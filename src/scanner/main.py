import boto3
import os
import json
import logging
import time
from datetime import datetime, timedelta
from decimal import Decimal
from boto3.dynamodb.conditions import Key
from concurrent.futures import ThreadPoolExecutor, as_completed

# --- CONFIGURATION & LOGGING ---
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Honour the IdleScanIgnore=True tag — skip any resource tagged this way.
IGNORE_TAG_KEY   = "IdleScanIgnore"
IGNORE_TAG_VALUE = "True"

# S3 log/audit/backup bucket suppression — matched against bucket name as a substring.
# Override via env var S3_IGNORE_PATTERNS (comma-separated list of substrings).
# Buckets whose names contain ANY of these strings are skipped without tag changes.
_DEFAULT_S3_IGNORE_PATTERNS = [
    "-access-log",
    "-alb-access-log",
    "-log-storage",
    "-logs",
    "-audit-log",
    "-audit-replicated",
    "log-archive",
]
S3_IGNORE_NAME_PATTERNS: list[str] = (
    [p.strip() for p in os.environ["S3_IGNORE_PATTERNS"].split(",") if p.strip()]
    if os.environ.get("S3_IGNORE_PATTERNS")
    else _DEFAULT_S3_IGNORE_PATTERNS
)

def is_s3_log_bucket(name: str) -> bool:
    """Return True if the bucket name matches any configured log-bucket pattern."""
    lower = name.lower()
    return any(pat in lower for pat in S3_IGNORE_NAME_PATTERNS)


# --- HELPER CLASSES ---

class AWSClient:
    """Manages Boto3 sessions and clients for a single AWS account."""
    def __init__(self):
        self._session = boto3.Session()

    def get_client(self, service_name, region_name=None):
        return self._session.client(service_name, region_name=region_name)

    def get_enabled_regions(self):
        current_region = os.environ.get("AWS_REGION", "us-east-1")
        if os.environ.get("SCAN_REGIONS"):
            return [r.strip() for r in os.environ.get("SCAN_REGIONS").split(",")]
        return [current_region]


# --- HELPERS ---

def is_ignored(tags: dict) -> bool:
    """Return True if the resource carries the opt-out tag IdleScanIgnore=True."""
    return tags.get(IGNORE_TAG_KEY) == IGNORE_TAG_VALUE


def calculate_idle_stats(metrics, thresholds, metric_name,
                          statistic="Average", window_days=30, period=3600):
    """
    Calculates exact idle duration starting from the most recent non-idle activity.

    CloudWatch data retention:
        1-hour resolution  → 455 days
        5-minute resolution → 63 days
        1-minute resolution → 15 days

    Returns:
        {
            "last_active": ISO_STR | None,
            "idle_until":  ISO_STR,
            "idle_hours":  float,
            "idle_days":   float,
            "DataStatus":  "OK" | "NO_METRICS"
        }
    """
    now = datetime.utcnow()

    if not metrics.get("Datapoints"):
        return {
            "last_active": None,
            "idle_until":  now.isoformat(),
            "idle_hours":  float(window_days * 24.0),
            "idle_days":   float(window_days),
            "DataStatus":  "NO_METRICS"
        }

    points = sorted(metrics["Datapoints"], key=lambda x: x["Timestamp"], reverse=True)

    last_active_time = None
    for p in points:
        val     = p[statistic]
        is_idle = True
        if "max" in thresholds and val > thresholds["max"]:
            is_idle = False
        if "min" in thresholds and val < thresholds["min"]:
            is_idle = False
        if not is_idle:
            raw_ts           = p["Timestamp"].replace(tzinfo=None)
            last_active_time = raw_ts + timedelta(seconds=period)
            break

    if last_active_time is None:
        return {
            "last_active": None,
            "idle_until":  now.isoformat(),
            "idle_hours":  float(window_days * 24.0),
            "idle_days":   float(window_days),
            "DataStatus":  "OK"
        }

    delta        = now - last_active_time
    total_secs   = max(0, delta.total_seconds())
    idle_hours   = total_secs / 3600.0
    idle_days    = idle_hours / 24.0

    return {
        "last_active": last_active_time.isoformat(),
        "idle_until":  now.isoformat(),
        "idle_hours":  float(f"{idle_hours:.2f}"),
        "idle_days":   float(f"{idle_days:.2f}"),
        "DataStatus":  "OK"
    }


def write_to_dynamodb(table_name, resources):
    """
    Persists all detected idle resources in a SINGLE batch write.

    WHY single write:  calling write_to_dynamodb inside the thread loop causes
    write collisions, partial flushes, and DynamoDB throttling.  Collect all
    results first → call this function once.

    Sort key includes the scan date (YYYYMMDD) → every daily run appends a
    new row without overwriting yesterday's data.

    30-day amnesia fix: if CloudWatch returns no datapoints, we query the
    previous DynamoDB row to inherit the last known last_active timestamp.

    TTL = 400 days → rows auto-expire, covering yearly comparisons.
    """
    if not resources:
        logger.info("No idle resources to write.")
        return

    dynamodb   = boto3.resource("dynamodb")
    table      = dynamodb.Table(table_name)
    expires_at = int(time.time()) + 60 * 60 * 24 * 400
    scan_day   = datetime.utcnow().strftime("%Y%m%d")
    now        = datetime.utcnow()

    logger.info(f"Writing {len(resources)} items to DynamoDB table '{table_name}'")

    with table.batch_writer() as batch:
        for res in resources:
            last_active_iso = res["IdleStats"]["last_active"]

            # ── 30-day amnesia fix ──────────────────────────────────────────
            # If CloudWatch returned no datapoints, inherit last_active from
            # the most recent historical DynamoDB row for this resource.
            if last_active_iso is None:
                try:
                    prev = table.query(
                        KeyConditionExpression=(
                            Key("pk").eq("SCOPE#MAIN") &
                            Key("sk").begins_with(
                                f"RES#{res['Service']}#{res['Region']}#{res['ResourceId']}#"
                            )
                        ),
                        ScanIndexForward=False,
                        Limit=1
                    ).get("Items", [])
                    if prev and prev[0].get("last_active"):
                        last_active_iso = prev[0]["last_active"]
                except Exception as e:
                    logger.warning(
                        f"Could not query previous record for {res['ResourceId']}: {e}"
                    )

            # ── Compute true idle duration ──────────────────────────────────
            if last_active_iso:
                try:
                    true_last = datetime.fromisoformat(last_active_iso)
                    idle_hrs  = max(0.0, (now - true_last).total_seconds() / 3600.0)
                except ValueError:
                    idle_hrs = float(res["IdleStats"]["idle_hours"])
            else:
                last_active_iso = (now - timedelta(days=30)).isoformat()
                idle_hrs        = float(res["IdleStats"]["idle_hours"])

            idle_days     = idle_hrs / 24.0
            tags          = res.get("Tags", {})
            resource_name = tags.get("Name", res["ResourceId"])

            item = {
                "pk":            "SCOPE#MAIN",
                "sk":            f"RES#{res['Service']}#{res['Region']}#{res['ResourceId']}#{scan_day}",
                "region":        res["Region"],
                "scan_ts":       res.get("scan_ts", now.isoformat()),
                "resource_name": resource_name,
                "service":       res["Service"],
                "status":        "Idle",
                "resource_id":   res["ResourceId"],
                # Fix #6 — use f-string formatting to avoid float precision loss
                "idle_hours":    Decimal(f"{idle_hrs:.2f}"),
                "idle_days":     Decimal(f"{idle_days:.2f}"),
                "idle_reason":   res["IdleReason"],
                "idle_until":    res["IdleStats"].get("idle_until", now.isoformat()),
                "last_active":   last_active_iso,
                "last_scanned":  int(time.time()),
                "tags":          tags,
                "expires_at":    expires_at,
                # Fix 5 — persist size_gb for S3 buckets (0 for all other resource types)
                "size_gb":       Decimal(f"{float(res.get('size_gb', 0)):.4f}"),
            }
            batch.put_item(Item=item)

    logger.info("DynamoDB write complete.")


# --- SCANNERS ---
# All scanners follow this contract:
#   • Accept (aws_client, region, scan_ts)
#   • Return a list of resource dicts (may be empty)
#   • Wrap all AWS API calls in try/except so one error never crashes a scan
#   • Honour the IdleScanIgnore tag (skip tagged resources)

def scan_ec2(aws_client, region, scan_ts):
    try:
        ec2        = aws_client.get_client("ec2", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        paginator  = ec2.get_paginator("describe_instances")
        instances  = []
        for page in paginator.paginate(
            Filters=[{"Name": "instance-state-name", "Values": ["running", "stopped"]}]
        ):
            for r in page["Reservations"]:
                instances.extend(r["Instances"])

        end_time   = datetime.utcnow()
        start_time = end_time - timedelta(days=30)

        for inst in instances:
            instance_id = inst["InstanceId"]
            state       = inst["State"]["Name"]
            tags        = {t["Key"]: t["Value"] for t in inst.get("Tags", [])}
            if is_ignored(tags):
                continue

            if state == "stopped":
                now    = datetime.utcnow()
                reason = inst.get("StateTransitionReason", "")
                idle_h = 720.0
                if "User initiated" in reason:
                    try:
                        date_str    = reason.split("(")[1].split(" GMT")[0]
                        stopped_at  = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=None)
                        idle_h      = max(0, (now - stopped_at).total_seconds() / 3600.0)
                    except Exception:
                        pass
                idle.append({
                    "ResourceId": instance_id, "Service": "EC2", "Region": region,
                    "IdleReason": "Instance is Stopped",
                    "IdleStats": {
                        "last_active": None, "idle_until": now.isoformat(),
                        "idle_hours": float(f"{idle_h:.2f}"),
                        "idle_days":  float(f"{idle_h/24.0:.2f}"),
                        "DataStatus": "NO_METRICS"
                    },
                    "Tags": tags, "scan_ts": scan_ts
                })
                continue

            try:
                cpu_metrics = cloudwatch.get_metric_statistics(
                    Namespace="AWS/EC2", MetricName="CPUUtilization",
                    Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
                    StartTime=start_time, EndTime=end_time, Period=3600, Statistics=["Average"]
                )
                net_metrics = cloudwatch.get_metric_statistics(
                    Namespace="AWS/EC2", MetricName="NetworkOut",
                    Dimensions=[{"Name": "InstanceId", "Value": instance_id}],
                    StartTime=start_time, EndTime=end_time, Period=3600, Statistics=["Sum"]
                )
            except Exception as e:
                logger.warning(f"EC2 CloudWatch error for {instance_id}: {e}")
                continue

            cpu_stats = calculate_idle_stats(cpu_metrics, {"max": 10.0}, "CPUUtilization", period=3600)
            net_stats = calculate_idle_stats(net_metrics, {"max": 5_000_000}, "NetworkOut",
                                              statistic="Sum", period=3600)

            la_cpu = datetime.fromisoformat(cpu_stats["last_active"]) if cpu_stats["last_active"] else None
            la_net = datetime.fromisoformat(net_stats["last_active"]) if net_stats["last_active"] else None
            now    = datetime.utcnow()

            if la_cpu is None and la_net is None:
                final_la   = None
                idle_hours = 30.0 * 24.0
                idle_days  = 30.0
            else:
                final_la   = max(la_cpu or datetime.min, la_net or datetime.min)
                idle_hours = max(0, (now - final_la).total_seconds()) / 3600.0
                idle_days  = idle_hours / 24.0

            if idle_hours >= 24.0:
                idle.append({
                    "ResourceId": instance_id, "Service": "EC2", "Region": region,
                    "IdleReason": "Low CPU (< 10%) AND NetworkOut (< 5MB)",
                    "IdleStats": {
                        "last_active": final_la.isoformat() if final_la else None,
                        "idle_until":  now.isoformat(),
                        "idle_hours":  float(f"{idle_hours:.2f}"),
                        "idle_days":   float(f"{idle_days:.2f}"),
                        "DataStatus":  "OK"
                    },
                    "Tags": tags, "scan_ts": scan_ts
                })
        return idle
    except Exception as e:
        logger.error(f"scan_ec2 failed in {region}: {e}")
        return []


def scan_rds(aws_client, region, scan_ts):
    try:
        rds        = aws_client.get_client("rds", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        for page in rds.get_paginator("describe_db_instances").paginate():
            for db in page["DBInstances"]:
                if db["DBInstanceStatus"] != "available":
                    continue
                db_id = db["DBInstanceIdentifier"]
                try:
                    tags_list = rds.list_tags_for_resource(
                        ResourceName=db["DBInstanceArn"]
                    ).get("TagList", [])
                    tags = {t["Key"]: t["Value"] for t in tags_list}
                except Exception:
                    tags = {}

                if is_ignored(tags):
                    continue

                try:
                    conn_metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/RDS", MetricName="DatabaseConnections",
                        Dimensions=[{"Name": "DBInstanceIdentifier", "Value": db_id}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Maximum"]
                    )
                    cpu_metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/RDS", MetricName="CPUUtilization",
                        Dimensions=[{"Name": "DBInstanceIdentifier", "Value": db_id}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Average"]
                    )
                except Exception as e:
                    logger.warning(f"RDS CloudWatch error for {db_id}: {e}")
                    continue

                conn_stats = calculate_idle_stats(conn_metrics, {"max": 0},
                                                  "DatabaseConnections", statistic="Maximum", period=3600)
                cpu_stats  = calculate_idle_stats(cpu_metrics, {"max": 5.0},
                                                  "CPUUtilization", period=3600)

                # Combined idle = whichever metric is LESS idle (more conservative)
                if conn_stats["idle_hours"] <= cpu_stats["idle_hours"]:
                    final_stats = conn_stats
                else:
                    final_stats = cpu_stats
                final_stats["idle_hours"] = min(conn_stats["idle_hours"], cpu_stats["idle_hours"])
                final_stats["idle_days"]  = min(conn_stats["idle_days"],  cpu_stats["idle_days"])

                # Fix #4 — store final_stats (with combined idle), not just conn_stats
                if final_stats["DataStatus"] in ["OK", "NO_METRICS"] and final_stats["idle_hours"] >= 24.0:
                    idle.append({
                        "ResourceId": db_id, "Service": "RDS", "Region": region,
                        "IdleReason": "Zero Database Connections",
                        "IdleStats":  final_stats,
                        "Tags": tags, "scan_ts": scan_ts
                    })
        return idle
    except Exception as e:
        logger.error(f"scan_rds failed in {region}: {e}")
        return []


def scan_elb(aws_client, region, scan_ts):
    try:
        elbv2      = aws_client.get_client("elbv2", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        for page in elbv2.get_paginator("describe_load_balancers").paginate():
            for lb in page["LoadBalancers"]:
                arn       = lb["LoadBalancerArn"]
                dim_value = "/".join(arn.split("loadbalancer/")[1:])

                try:
                    tags_raw = elbv2.describe_tags(ResourceArns=[arn])["TagDescriptions"][0].get("Tags", [])
                    tags     = {t["Key"]: t["Value"] for t in tags_raw}
                except Exception:
                    tags = {}
                if is_ignored(tags):
                    continue

                try:
                    if lb["Type"] == "application":
                        namespace = "AWS/ApplicationELB"
                        req_metrics  = cloudwatch.get_metric_statistics(
                            Namespace=namespace, MetricName="RequestCount",
                            Dimensions=[{"Name": "LoadBalancer", "Value": dim_value}],
                            StartTime=datetime.utcnow() - timedelta(days=30),
                            EndTime=datetime.utcnow(), Period=3600, Statistics=["Sum"]
                        )
                        conn_metrics = cloudwatch.get_metric_statistics(
                            Namespace=namespace, MetricName="ActiveConnectionCount",
                            Dimensions=[{"Name": "LoadBalancer", "Value": dim_value}],
                            StartTime=datetime.utcnow() - timedelta(days=30),
                            EndTime=datetime.utcnow(), Period=3600, Statistics=["Maximum"]
                        )
                        req_stats  = calculate_idle_stats(req_metrics,  {"max": 0}, "RequestCount", statistic="Sum", period=3600)
                        conn_stats = calculate_idle_stats(conn_metrics, {"max": 0}, "ActiveConnectionCount", statistic="Maximum", period=3600)
                        combined   = min(req_stats["idle_days"], conn_stats["idle_days"])
                        # Fix #3 — pick the stats object that gave the combined value, then
                        # mutate it so idle_days/idle_hours match the combined figure exactly.
                        if req_stats["idle_days"] <= conn_stats["idle_days"]:
                            stats = req_stats
                        else:
                            stats = conn_stats
                        stats["idle_days"]  = combined
                        stats["idle_hours"] = combined * 24.0
                        reason     = "Zero RequestCount and ActiveConnectionCount"
                    else:
                        namespace = "AWS/NetworkELB"
                        metrics   = cloudwatch.get_metric_statistics(
                            Namespace=namespace, MetricName="ActiveFlowCount",
                            Dimensions=[{"Name": "LoadBalancer", "Value": dim_value}],
                            StartTime=datetime.utcnow() - timedelta(days=30),
                            EndTime=datetime.utcnow(), Period=3600, Statistics=["Maximum"]
                        )
                        stats    = calculate_idle_stats(metrics, {"max": 0}, "ActiveFlowCount", statistic="Maximum", period=3600)
                        combined = stats["idle_days"]
                        reason   = "Zero ActiveFlowCount"
                except Exception as e:
                    logger.warning(f"ELB CloudWatch error for {lb['LoadBalancerName']}: {e}")
                    continue

                if stats["DataStatus"] in ["OK", "NO_METRICS"] and combined >= 1.0:
                    idle.append({
                        "ResourceId": lb["LoadBalancerName"], "Service": "LoadBalancer", "Region": region,
                        "IdleReason": reason, "IdleStats": stats,
                        "Tags": tags, "scan_ts": scan_ts
                    })
        return idle
    except Exception as e:
        logger.error(f"scan_elb failed in {region}: {e}")
        return []


def scan_efs(aws_client, region, scan_ts):
    try:
        efs        = aws_client.get_client("efs", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        for page in efs.get_paginator("describe_file_systems").paginate():
            for fs in page["FileSystems"]:
                # Fix 2 — EFS tags are NOT in describe_file_systems; must call describe_tags separately
                tags = {}
                try:
                    tag_resp = efs.describe_tags(FileSystemId=fs["FileSystemId"])
                    tags = {t["Key"]: t["Value"] for t in tag_resp.get("Tags", [])}
                except Exception:
                    pass
                if is_ignored(tags):
                    continue
                try:
                    metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/EFS", MetricName="ClientConnections",
                        Dimensions=[{"Name": "FileSystemId", "Value": fs["FileSystemId"]}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Sum"]
                    )
                except Exception as e:
                    logger.warning(f"EFS CloudWatch error for {fs['FileSystemId']}: {e}")
                    continue

                stats = calculate_idle_stats(metrics, {"max": 0}, "ClientConnections",
                                              statistic="Sum", period=3600)
                if stats["DataStatus"] in ["OK", "NO_METRICS"] and stats["idle_days"] >= 1.0:
                    idle.append({
                        "ResourceId": fs["FileSystemId"], "Service": "EFS", "Region": region,
                        "IdleReason": "Zero Client Connections",
                        "IdleStats": stats, "Tags": tags, "scan_ts": scan_ts
                    })
        return idle
    except Exception as e:
        logger.error(f"scan_efs failed in {region}: {e}")
        return []


def scan_lambda_fns(aws_client, region, scan_ts):
    try:
        lam        = aws_client.get_client("lambda", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        for page in lam.get_paginator("list_functions").paginate():
            for fn in page["Functions"]:
                # Fix #4 — list_tags is the reliable method; Tags in list_functions
                # response is only populated when the function has resource-based tags
                # added by certain tools — it can be missing entirely.
                try:
                    tags = lam.list_tags(Resource=fn["FunctionArn"]).get("Tags", {})
                except Exception:
                    tags = fn.get("Tags", {})
                if is_ignored(tags):
                    continue
                try:
                    inv_metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/Lambda", MetricName="Invocations",
                        Dimensions=[{"Name": "FunctionName", "Value": fn["FunctionName"]}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Sum"]
                    )
                    pc_metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/Lambda", MetricName="ProvisionedConcurrentExecutions",
                        Dimensions=[{"Name": "FunctionName", "Value": fn["FunctionName"]}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Maximum"]
                    )
                except Exception as e:
                    logger.warning(f"Lambda CloudWatch error for {fn['FunctionName']}: {e}")
                    continue

                stats  = calculate_idle_stats(inv_metrics, {"max": 0}, "Invocations",
                                               statistic="Sum", period=3600)
                has_pc = bool(pc_metrics.get("Datapoints") and
                              max((dp.get("Maximum", 0) for dp in pc_metrics["Datapoints"]), default=0) > 0)

                if stats["DataStatus"] in ["OK", "NO_METRICS"] and stats["idle_days"] >= 1.0:
                    idle.append({
                        "ResourceId": fn["FunctionName"], "Service": "Lambda", "Region": region,
                        "IdleReason": "No Invocations (with Provisioned Concurrency)" if has_pc else "No Invocations",
                        "IdleStats": stats, "Tags": tags, "scan_ts": scan_ts
                    })
        return idle
    except Exception as e:
        logger.error(f"scan_lambda_fns failed in {region}: {e}")
        return []


def scan_unattached_ebs(aws_client, region, scan_ts):
    try:
        ec2  = aws_client.get_client("ec2", region)
        idle = []
        for page in ec2.get_paginator("describe_volumes").paginate(
            Filters=[{"Name": "status", "Values": ["available"]}]
        ):
            for vol in page["Volumes"]:
                tags = {t["Key"]: t["Value"] for t in vol.get("Tags", [])}
                if is_ignored(tags):
                    continue
                now        = datetime.utcnow().replace(tzinfo=None)
                idle_hours = max(0, (now - vol["CreateTime"].replace(tzinfo=None)).total_seconds() / 3600.0)
                idle_days  = idle_hours / 24.0
                idle.append({
                    "ResourceId": vol["VolumeId"], "Service": "EBS", "Region": region,
                    "IdleReason": "Unattached Volume (Available)",
                    "IdleStats": {
                        "last_active": None, "idle_until": now.isoformat(),
                        "idle_hours": float(f"{idle_hours:.2f}"),
                        "idle_days":  float(f"{idle_days:.2f}"),
                        "DataStatus": "NO_METRICS"
                    },
                    "Tags": tags, "scan_ts": scan_ts
                })
        return idle
    except Exception as e:
        logger.error(f"scan_unattached_ebs failed in {region}: {e}")
        return []


def scan_unassociated_eip(aws_client, region, scan_ts):
    try:
        ec2  = aws_client.get_client("ec2", region)
        idle = []
        now  = datetime.utcnow()
        for addr in ec2.describe_addresses().get("Addresses", []):
            if "AssociationId" in addr:
                continue
            tags = {t["Key"]: t["Value"] for t in addr.get("Tags", [])}
            if is_ignored(tags):
                continue
            idle.append({
                "ResourceId": addr.get("PublicIp", addr.get("AllocationId", "Unknown")),
                "Service": "ElasticIP", "Region": region,
                "IdleReason": "Unassociated Elastic IP",
                "IdleStats": {
                    "last_active": None, "idle_until": now.isoformat(),
                    "idle_hours": 730.0, "idle_days": 30.0, "DataStatus": "NO_METRICS"
                },
                "Tags": tags, "scan_ts": scan_ts
            })
        return idle
    except Exception as e:
        logger.error(f"scan_unassociated_eip failed in {region}: {e}")
        return []


def scan_nat_gateway(aws_client, region, scan_ts):
    try:
        ec2        = aws_client.get_client("ec2", region)
        cloudwatch = aws_client.get_client("cloudwatch", region)
        idle       = []

        for page in ec2.get_paginator("describe_nat_gateways").paginate(
            Filters=[{"Name": "state", "Values": ["available"]}]
        ):
            for nat in page["NatGateways"]:
                tags = {t["Key"]: t["Value"] for t in nat.get("Tags", [])}
                if is_ignored(tags):
                    continue
                try:
                    metrics = cloudwatch.get_metric_statistics(
                        Namespace="AWS/NATGateway", MetricName="BytesOutToDestination",
                        Dimensions=[{"Name": "NatGatewayId", "Value": nat["NatGatewayId"]}],
                        StartTime=datetime.utcnow() - timedelta(days=30),
                        EndTime=datetime.utcnow(), Period=3600, Statistics=["Sum"]
                    )
                except Exception as e:
                    logger.warning(f"NAT Gateway CloudWatch error for {nat['NatGatewayId']}: {e}")
                    continue

                stats = calculate_idle_stats(metrics, {"max": 0}, "BytesOutToDestination",
                                              statistic="Sum", period=3600)
                if stats["DataStatus"] in ["OK", "NO_METRICS"] and stats["idle_days"] >= 1.0:
                    idle.append({
                        "ResourceId": nat["NatGatewayId"], "Service": "NAT Gateway", "Region": region,
                        "IdleReason": "Zero BytesOutToDestination",
                        "IdleStats": stats, "Tags": tags, "scan_ts": scan_ts
                    })
        return idle
    except Exception as e:
        logger.error(f"scan_nat_gateway failed in {region}: {e}")
        return []


def scan_ebs_snapshots(aws_client, region, scan_ts):
    """Fix #3-style: uses paginator with capped page size to avoid memory spikes."""
    try:
        ec2  = aws_client.get_client("ec2", region)
        idle = []
        now  = datetime.utcnow()

        for page in ec2.get_paginator("describe_snapshots").paginate(
            OwnerIds=["self"], PaginationConfig={"PageSize": 50}
        ):
            for snap in page["Snapshots"]:
                tags = {t["Key"]: t["Value"] for t in snap.get("Tags", [])}
                if is_ignored(tags):
                    continue
                if "Created by CreateImage" in snap.get("Description", ""):
                    continue
                create_time = snap["StartTime"].replace(tzinfo=None)
                age_days    = max(0, (now - create_time).total_seconds() / 86400.0)
                if age_days < 30.0:
                    continue
                age_hours = age_days * 24.0
                idle.append({
                    "ResourceId": snap["SnapshotId"], "Service": "EBS Snapshot", "Region": region,
                    "IdleReason": "Snapshot older than 30 days",
                    "IdleStats": {
                        "last_active": None, "idle_until": now.isoformat(),
                        "idle_hours": float(f"{age_hours:.2f}"),
                        "idle_days":  float(f"{age_days:.2f}"),
                        "DataStatus": "NO_METRICS"
                    },
                    "Tags": tags, "scan_ts": scan_ts
                })
        return idle
    except Exception as e:
        logger.error(f"scan_ebs_snapshots failed in {region}: {e}")
        return []


def scan_ecs(aws_client, region, scan_ts):
    """Fix #3: Uses paginators for list_clusters and list_services (max 100 per page)."""
    try:
        ecs  = aws_client.get_client("ecs", region)
        idle = []
        now  = datetime.utcnow()

        cluster_paginator = ecs.get_paginator("list_clusters")
        for cluster_page in cluster_paginator.paginate():
            for cluster_arn in cluster_page["clusterArns"]:
                service_paginator = ecs.get_paginator("list_services")
                for svc_page in service_paginator.paginate(cluster=cluster_arn):
                    svc_arns = svc_page.get("serviceArns", [])
                    if not svc_arns:
                        continue
                    # describe_services accepts max 10 per call
                    for i in range(0, len(svc_arns), 10):
                        chunk = svc_arns[i:i+10]
                        try:
                            described = ecs.describe_services(
                                cluster=cluster_arn, services=chunk
                            )["services"]
                        except Exception as e:
                            logger.warning(f"ECS describe_services error: {e}")
                            continue
                        for svc in described:
                            # Fix #1 — collect real ECS service tags
                            svc_tags = {}
                            try:
                                tag_resp = ecs.list_tags_for_resource(resourceArn=svc["serviceArn"])
                                svc_tags = {t["key"]: t["value"] for t in tag_resp.get("tags", [])}
                            except Exception:
                                pass
                            if is_ignored(svc_tags):
                                continue
                            if svc["desiredCount"] == 0 and svc["runningCount"] == 0:
                                idle.append({
                                    "ResourceId": svc["serviceName"],
                                    "Service": "ECS", "Region": region,
                                    "IdleReason": "Service desired=0 and running=0",
                                    "IdleStats": {
                                        "last_active": None, "idle_until": now.isoformat(),
                                        "idle_hours": 720.0, "idle_days": 30.0,
                                        "DataStatus": "NO_METRICS"
                                    },
                                    "Tags": svc_tags, "scan_ts": scan_ts
                                })
                            else:
                                # Fix 3 — check running services for CloudWatch-level idle
                                # (desired>0, running>0, but CPU and network are idle)
                                cloudwatch = aws_client.get_client("cloudwatch", region)
                                cluster_name = cluster_arn.split("/")[-1]
                                svc_name     = svc["serviceName"]
                                cw_start     = now - timedelta(days=7)
                                try:
                                    cpu_m = cloudwatch.get_metric_statistics(
                                        Namespace="AWS/ECS", MetricName="CPUUtilization",
                                        Dimensions=[
                                            {"Name": "ClusterName", "Value": cluster_name},
                                            {"Name": "ServiceName", "Value": svc_name},
                                        ],
                                        StartTime=cw_start, EndTime=now,
                                        Period=3600, Statistics=["Average"]
                                    )
                                    net_rx_m = cloudwatch.get_metric_statistics(
                                        Namespace="ECS/ContainerInsights", MetricName="NetworkRxBytes",
                                        Dimensions=[
                                            {"Name": "ClusterName", "Value": cluster_name},
                                            {"Name": "ServiceName", "Value": svc_name},
                                        ],
                                        StartTime=cw_start, EndTime=now,
                                        Period=3600, Statistics=["Sum"]
                                    )
                                    cpu_stats    = calculate_idle_stats(cpu_m,    {"max": 5.0}, "CPUUtilization", period=3600)
                                    net_rx_stats = calculate_idle_stats(net_rx_m, {"max": 0},   "NetworkRxBytes", statistic="Sum", period=3600)
                                    # Only flag as idle when BOTH CPU and network show zero activity
                                    if (cpu_stats["idle_days"] >= 1.0 and net_rx_stats["idle_days"] >= 1.0):
                                        combined_days  = min(cpu_stats["idle_days"], net_rx_stats["idle_days"])
                                        combined_hours = combined_days * 24.0
                                        idle.append({
                                            "ResourceId": svc_name,
                                            "Service": "ECS", "Region": region,
                                            "IdleReason": "Running but zero CPU and Network activity",
                                            "IdleStats": {
                                                "last_active": cpu_stats["last_active"],
                                                "idle_until":  now.isoformat(),
                                                "idle_hours":  float(f"{combined_hours:.2f}"),
                                                "idle_days":   float(f"{combined_days:.2f}"),
                                                "DataStatus":  "OK"
                                            },
                                            "Tags": svc_tags, "scan_ts": scan_ts
                                        })
                                except Exception as e:
                                    logger.warning(f"ECS CloudWatch check failed for {svc_name}: {e}")
        return idle
    except Exception as e:
        logger.error(f"scan_ecs failed in {region}: {e}")
        return []


def scan_s3_bucket(aws_client, region, bucket_name, scan_ts):
    try:
        # Skip well-known log/audit/backup bucket naming patterns without touching tags
        if is_s3_log_bucket(bucket_name):
            logger.debug(f"S3: skipping log-pattern bucket '{bucket_name}'")
            return None

        # Fix #2 — fetch S3 bucket tags and respect IdleScanIgnore before scanning
        s3   = aws_client.get_client("s3", region)
        tags = {}
        try:
            tagging = s3.get_bucket_tagging(Bucket=bucket_name)
            tags    = {t["Key"]: t["Value"] for t in tagging.get("TagSet", [])}
        except s3.exceptions.ClientError as te:
            # NoSuchTagSet is expected for untagged buckets
            if te.response["Error"]["Code"] != "NoSuchTagSet":
                logger.warning(f"S3 tag fetch failed for {bucket_name}: {te}")
        except Exception as te:
            logger.warning(f"S3 tag fetch failed for {bucket_name}: {te}")

        if is_ignored(tags):
            return None

        cloudwatch = aws_client.get_client("cloudwatch", region)

        obj_metrics = cloudwatch.get_metric_statistics(
            Namespace="AWS/S3", MetricName="NumberOfObjects",
            Dimensions=[
                {"Name": "BucketName",   "Value": bucket_name},
                {"Name": "StorageType",  "Value": "AllStorageTypes"}
            ],
            StartTime=datetime.utcnow() - timedelta(days=2),
            EndTime=datetime.utcnow(), Period=86400, Statistics=["Average"]
        )
        if not obj_metrics.get("Datapoints"):
            return None
        latest_obj = sorted(obj_metrics["Datapoints"], key=lambda x: x["Timestamp"])[-1]
        if latest_obj["Average"] == 0:
            return None   # Empty bucket — skip

        req_metrics = cloudwatch.get_metric_statistics(
            Namespace="AWS/S3", MetricName="AllRequests",
            Dimensions=[
                {"Name": "BucketName", "Value": bucket_name},
                {"Name": "FilterId",   "Value": "EntireBucket"}
            ],
            StartTime=datetime.utcnow() - timedelta(days=30),
            EndTime=datetime.utcnow(), Period=3600, Statistics=["Sum"]
        )
        stats = calculate_idle_stats(req_metrics, {"max": 0}, "AllRequests",
                                      statistic="Sum", period=3600)

        # Fix minor bug — store size_gb
        size_gb = 0.0
        size_metrics = cloudwatch.get_metric_statistics(
            Namespace="AWS/S3", MetricName="BucketSizeBytes",
            Dimensions=[
                {"Name": "BucketName",  "Value": bucket_name},
                {"Name": "StorageType", "Value": "StandardStorage"}
            ],
            StartTime=datetime.utcnow() - timedelta(days=2),
            EndTime=datetime.utcnow(), Period=86400, Statistics=["Average"]
        )
        if size_metrics.get("Datapoints"):
            latest = sorted(size_metrics["Datapoints"], key=lambda x: x["Timestamp"])[-1]
            size_gb = round(latest["Average"] / (1024 ** 3), 4)

        if stats["DataStatus"] in ["OK", "NO_METRICS"] and stats["idle_days"] >= 29.9:
            return {
                "ResourceId": bucket_name, "Service": "S3", "Region": region,
                "IdleReason": "No requests for 30 days",
                "IdleStats": stats,
                "Tags": tags,
                "size_gb": size_gb,
                "scan_ts": scan_ts
            }
        return None
    except Exception as e:
        logger.warning(f"scan_s3_bucket failed for {bucket_name}: {e}")
        return None


# --- LAMBDA HANDLER ---
# Must be defined LAST — all scanner functions are defined above.

def lambda_handler(event, context):
    logger.info("=== Idle Resource Scan Starting ===")
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        logger.error("TABLE_NAME environment variable is missing.")
        return {"statusCode": 500, "body": "Error: TABLE_NAME env var not set."}

    aws     = AWSClient()
    regions = aws.get_enabled_regions()
    scan_ts = datetime.utcnow().isoformat()

    all_results = []

    # ── Fix #2: Collect ALL results first, write ONCE ─────────────────────────
    # Fix #7: max_workers=5 to stay within Lambda connection limits
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {}
        for region in regions:
            futures[executor.submit(scan_ec2,             aws, region, scan_ts)] = f"EC2:{region}"
            futures[executor.submit(scan_rds,             aws, region, scan_ts)] = f"RDS:{region}"
            futures[executor.submit(scan_elb,             aws, region, scan_ts)] = f"ELB:{region}"
            futures[executor.submit(scan_efs,             aws, region, scan_ts)] = f"EFS:{region}"
            futures[executor.submit(scan_lambda_fns,      aws, region, scan_ts)] = f"Lambda:{region}"
            futures[executor.submit(scan_unattached_ebs,  aws, region, scan_ts)] = f"EBS:{region}"
            futures[executor.submit(scan_ebs_snapshots,   aws, region, scan_ts)] = f"Snapshots:{region}"
            futures[executor.submit(scan_unassociated_eip,aws, region, scan_ts)] = f"EIP:{region}"
            futures[executor.submit(scan_nat_gateway,     aws, region, scan_ts)] = f"NAT:{region}"
            futures[executor.submit(scan_ecs,             aws, region, scan_ts)] = f"ECS:{region}"

        for future in as_completed(futures):
            label = futures[future]
            try:
                results = future.result()
                if results:
                    logger.info(f"  {label}: {len(results)} idle resource(s) found")
                    all_results.extend(results)
            except Exception as e:
                logger.error(f"  {label}: scan raised exception — {e}")

    # ── S3 is global — scan after regional workers complete ───────────────────
    try:
        s3_client = aws.get_client("s3", "us-east-1")
        buckets   = s3_client.list_buckets().get("Buckets", [])
        for bucket in buckets:
            name = bucket["Name"]
            try:
                loc      = s3_client.get_bucket_location(Bucket=name)["LocationConstraint"]
                b_region = loc if loc else "us-east-1"
                if b_region == "EU":
                    b_region = "eu-west-1"
                if b_region in regions:
                    res = scan_s3_bucket(aws, b_region, name, scan_ts)
                    if res:
                        all_results.append(res)
            except Exception as e:
                logger.warning(f"Skipping bucket {name}: {e}")
    except Exception as e:
        logger.error(f"S3 scan error: {e}")

    # ── Single DynamoDB write ─────────────────────────────────────────────────
    write_to_dynamodb(table_name, all_results)

    msg = f"Scan complete. {len(all_results)} idle resource(s) found across {len(regions)} region(s)."
    logger.info(f"=== {msg} ===")
    return {"statusCode": 200, "body": msg}
