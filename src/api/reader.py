"""
IdleResourceReader Lambda
=========================
Serves as the backend for the Idle Resource dashboard.

Routes:
  GET  /resources  — Query DynamoDB for idle resource records.
  POST /refresh    — Invoke the scanner Lambda asynchronously to trigger
                     an on-demand scan. Returns immediately; scan runs in
                     the background (~30–60 s depending on region count).

Environment Variables:
  TABLE_NAME          - DynamoDB table written by the scanner Lambda.
  SCANNER_LAMBDA_NAME - Function name of the scanner Lambda (for /refresh).

IAM Permissions Required:
  - dynamodb:Query
  - dynamodb:Scan
  - lambda:InvokeFunction  (on the scanner Lambda, for the /refresh route)
"""

import boto3
import json
import os
import logging
from boto3.dynamodb.conditions import Key
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)


# ─── Helpers ───────────────────────────────────────────────────────────────────

class DecimalEncoder(json.JSONEncoder):
    """DynamoDB stores numbers as Decimal. Convert back to float for JSON."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


def build_response(status_code, body, methods="GET,POST,OPTIONS"):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": methods,
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body, cls=DecimalEncoder)
    }


# ─── Main Handler ──────────────────────────────────────────────────────────────

def lambda_handler(event, context):
    """
    Entry point called by API Gateway.

    GET /resources
        Query Parameters (all optional):
          service  - Filter by AWS service type, e.g. ?service=RDS
          date     - Filter to a specific scan date (YYYYMMDD)
        Returns a JSON array of idle resource objects.

    POST /refresh
        Invokes the scanner Lambda asynchronously and returns immediately.
        The scan runs in the background; re-fetch /resources after ~60 s.

    OPTIONS (preflight)
        Returns CORS headers for browser pre-flight requests.
    """
    http_method = event.get("httpMethod", "GET").upper()
    path        = event.get("path", "/resources")

    # ── CORS preflight ────────────────────────────────────────────────────────
    if http_method == "OPTIONS":
        return build_response(200, {})

    # ── POST /manual-certificates — add a non-acm cert ────────────────────────
    if http_method == "POST" and path.rstrip("/").endswith("/manual-certificates"):
        return handle_post_manual_certificate(event)

    # ── POST /refresh — trigger an on-demand scan ─────────────────────────────
    if http_method == "POST" and path.rstrip("/").endswith("/refresh"):
        return handle_refresh()

    # ── GET /resources — query DynamoDB ──────────────────────────────────────
    return handle_get_resources(event)


def handle_refresh():
    """Invoke the scanner Lambda asynchronously (InvocationType=Event)."""
    scanner_name = os.environ.get("SCANNER_LAMBDA_NAME")
    if not scanner_name:
        logger.error("SCANNER_LAMBDA_NAME environment variable is not set.")
        return build_response(500, {"error": "SCANNER_LAMBDA_NAME env var not set"})

    try:
        lam = boto3.client("lambda")
        resp = lam.invoke(
            FunctionName=scanner_name,
            InvocationType="Event",   # Async — returns immediately (status 202)
            Payload=json.dumps({})
        )
        status_code = resp.get("StatusCode", 0)
        if status_code == 202:
            logger.info(f"Scanner Lambda '{scanner_name}' invoked successfully (async).")
            return build_response(200, {
                "status": "scan_started",
                "message": "Scan has been triggered. Refresh the dashboard in ~60 seconds to see updated data."
            })
        else:
            logger.error(f"Unexpected Lambda invoke status: {status_code}")
            return build_response(500, {"error": f"Lambda invoke returned status {status_code}"})
    except Exception as e:
        logger.error(f"Failed to invoke scanner Lambda: {e}")
        return build_response(500, {"error": str(e)})


def handle_get_resources(event):
    """Query DynamoDB and return the latest idle resource records."""
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        logger.error("TABLE_NAME environment variable is not set.")
        return build_response(500, {"error": "TABLE_NAME env var not set"})

    params        = event.get("queryStringParameters") or {}
    service_filter = params.get("service")
    date_filter    = params.get("date")

    dynamodb = boto3.resource("dynamodb")
    table    = dynamodb.Table(table_name)

    pk_val    = "SCOPE#MAIN"
    sk_prefix = f"RES#{service_filter}#" if service_filter else "RES#"

    try:
        response = table.query(
            KeyConditionExpression=(
                Key("pk").eq(pk_val) &
                Key("sk").begins_with(sk_prefix)
            )
        )
        items = response.get("Items", [])

        # Handle DynamoDB pagination
        while "LastEvaluatedKey" in response:
            response = table.query(
                KeyConditionExpression=(
                    Key("pk").eq(pk_val) &
                    Key("sk").begins_with(sk_prefix)
                ),
                ExclusiveStartKey=response["LastEvaluatedKey"]
            )
            items.extend(response.get("Items", []))

        # Post-filter by date if requested (sk ends with #{YYYYMMDD})
        if date_filter:
            items = [i for i in items if i.get("sk", "").endswith(f"#{date_filter}")]

        logger.info(f"Returning {len(items)} items (service={service_filter}, date={date_filter})")
        return build_response(200, items)

    except Exception as e:
        logger.error(f"DynamoDB query failed: {e}")
        return build_response(500, {"error": str(e)})


def handle_post_manual_certificate(event):
    """Insert a user-provided manual certificate into DynamoDB."""
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        logger.error("TABLE_NAME environment variable is not set.")
        return build_response(500, {"error": "TABLE_NAME env var not set"})

    try:
        body = json.loads(event.get("body", "{}"))
    except Exception as e:
        logger.error(f"Failed to parse request body: {e}")
        return build_response(400, {"error": "Invalid JSON body payload"})

    domain = body.get("resource_name")
    vendor = body.get("vendor", "Unknown")
    expiration = body.get("acm_expiration_date")
    renewal = body.get("renewal_date")
    notes = body.get("notes", "")
    project = body.get("project", "default")
    env = body.get("env", "dev")

    if not domain or not expiration:
        return build_response(400, {"error": "Missing required fields: resource_name and acm_expiration_date are required."})

    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(table_name)

    # PK is standard SCOPE#MAIN. SK uniquely identifies this as a manual certificate
    pk_val = "SCOPE#MAIN"
    sk_val = f"RES#ManualCertificate#{domain}#{project}#{env}"

    new_item = {
        "pk": pk_val,
        "sk": sk_val,
        "type": "Manual Certificate",
        "resource_name": domain,
        "vendor": vendor,
        "acm_expiration_date": expiration,
        "renewal_date": renewal,
        "notes": notes,
        "project": project,
        "env": env,
        "accountLabel": f"{project}-{env}",
        "status": "Active",
        "reason": "Manually Tracked",
        "days_idle": 0
    }

    try:
        table.put_item(Item=new_item)
        logger.info(f"Successfully inserted manual certificate {domain} for {project}-{env}")
        return build_response(201, {"message": "Certificate successfully added", "item": new_item})
    except Exception as e:
        logger.error(f"DynamoDB put_item failed: {e}")
        return build_response(500, {"error": str(e)})
