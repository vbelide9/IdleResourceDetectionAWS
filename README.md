# AWS Idle Resource FinOps Bot

An automated AWS infrastructure scanner that detects idle resources, calculates wasted costs, and stores everything in DynamoDB for real-time dashboard reporting.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Account                                 │
│                                                                     │
│  EventBridge (scheduled)                                            │
│        │                                                            │
│        ▼                                                            │
│  ┌───────────────────┐      ┌──────────────────┐                   │
│  │  Scanner Lambda   │─────▶│    DynamoDB       │                   │
│  │  (src/scanner/    │      │  IdleResourcesTable│                  │
│  │   main.py)        │      └──────────┬─────────┘                  │
│  └───────────────────┘                 │                            │
│                                        ▼                            │
│                            ┌───────────────────────┐               │
│                            │  Reader Lambda         │               │
│                            │  (src/api/reader.py)   │               │
│                            └───────────┬───────────┘               │
│                                        │                            │
│                            ┌───────────▼───────────┐               │
│                            │   API Gateway          │               │
│                            │   GET /resources       │               │
│                            └───────────┬───────────┘               │
└────────────────────────────────────────┼────────────────────────────┘
                                         │ HTTPS
                                         ▼
                              ┌──────────────────────┐
                              │  React Dashboard      │
                              │  (dashboard/)         │
                              └──────────────────────┘
```

---

## Services Scanned

| Service | Idle Criteria | CloudWatch Metric |
|---|---|---|
| **EC2** | CPU < 10% AND NetworkOut < 5 MB | `CPUUtilization`, `NetworkOut` |
| **RDS** | DatabaseConnections = 0 | `DatabaseConnections` |
| **ELB (ALB/NLB)** | RequestCount = 0 AND ActiveConnections = 0 | `RequestCount`, `ActiveConnectionCount` |
| **EFS** | ClientConnections = 0 | `ClientConnections` |
| **Lambda** | No invocations in 30 days | `Invocations` |
| **EBS Volumes** | Unattached (no EC2 association) | API state check |
| **EBS Snapshots** | Older than 30 days, not linked to AMI | `StartTime` field |
| **Elastic IPs** | Not associated with any instance or ENI | API state check |
| **NAT Gateway** | Zero bytes sent to destination | `BytesOutToDestination` |
| **ECS Services** | desiredCount > 0, runningCount = 0 | API state check |
| **S3 Buckets** | No requests in 30 days | `AllRequests` |

---

## Cost Calculation Formulas

All cost values are computed **at scan time** and stored directly in DynamoDB. The dashboard reads these pre-computed values — no inference or prediction is performed.

### Step 1 — Fetch the on-demand monthly rate

For each resource, the scanner calls the **AWS Pricing API** (`pricing:GetProducts`) to obtain the current on-demand hourly rate.

```
monthly_rate = hourly_rate × 730.5
```

> 730.5 = average hours per month (365.25 days × 24 hours ÷ 12 months)

### Step 2 — Determine true idle hours

CloudWatch metrics are queried over a 30-day rolling window. The scanner finds the most recent data point where the metric exceeded the idle threshold and sets that as `last_active`.

```
idle_hours = (now − last_active) in hours
```

If CloudWatch has **no data** (resource never used, or metrics older than 15 months), the scanner queries DynamoDB for the previous scan's `last_active` timestamp and inherits it — preventing the "30-day amnesia" problem.

### Step 3 — Compute the three waste figures

```
# Total accumulated idle cost since last_active
idle_cost = monthly_rate × (idle_hours / 730.5)

# Pro-rated waste within the current 30-day billing cycle (capped at 730.5 hrs)
current_month_hours = min(idle_hours, 730.5)
waste_this_month    = monthly_rate × (current_month_hours / 730.5)

# Pro-rated waste for today only (capped at 24 hrs)
current_day_hours = min(idle_hours, 24.0)
waste_today       = monthly_rate × (current_day_hours / 730.5)
```

### Example — RDS Instance

| Variable | Value |
|---|---|
| Instance type | `db.t3.medium` (MySQL, Single-AZ, us-east-1) |
| AWS Pricing API rate | `$0.0792/hr` |
| `monthly_rate` | `0.0792 × 730.5 = $57.87/mo` |
| `idle_hours` | `720` (idle 30 full days) |
| `waste_this_month` | `57.87 × (720/730.5) = $57.04` |
| `waste_today` | `57.87 × (24/730.5) = $1.90` |

> **Validation:** AWS Cost Explorer showed `$6.05` actual RDS cost for Feb 22, 2026.  
> Our scanner predicted `$5.79` — a **4.3% margin of error**.  
> The gap comes from variable I/O and backup storage charges not in the public pricing API.

---

## DynamoDB Schema

**Table name:** `IdleResourcesTable`  
**Partition key:** `pk` (String) — always `SCOPE#MAIN`  
**Sort key:** `sk` (String) — format: `RES#{Service}#{Region}#{ResourceId}#{YYYYMMDD}`

| Field | Type | Description |
|---|---|---|
| `resource_id` | String | AWS resource identifier |
| `resource_name` | String | Name tag or resource ID |
| `service` | String | `EC2`, `RDS`, `EFS`, `ELB`, etc. |
| `region` | String | AWS region, e.g. `us-east-1` |
| `status` | String | Always `Idle` |
| `idle_hours` | Number | Hours idle since `last_active` |
| `idle_days` | Number | `idle_hours / 24` |
| `last_active` | String | ISO UTC timestamp of last activity |
| `idle_until` | String | ISO UTC timestamp of scan run |
| `idle_reason` | String | Human-readable idle reason |
| `monthly_waste` | Number | Full monthly on-demand cost (USD) |
| `waste_this_month` | Number | Pro-rated waste in current billing cycle |
| `waste_today` | Number | Pro-rated waste for today only |
| `idle_cost` | Number | Total accumulated idle cost |
| `tags` | Map | All AWS resource tags |
| `scan_ts` | String | UTC timestamp of the scan |
| `last_scanned` | Number | Unix epoch of the scan |
| `expires_at` | Number | TTL — auto-deleted after 400 days |

---

## Manual Deployment (No CDK)

### Step 1 — Create DynamoDB Table

1. **DynamoDB → Create table**
2. Table name: `IdleResourcesTable`
3. Partition key: `pk` (String), Sort key: `sk` (String)
4. Capacity mode: **On-demand**

### Step 2 — Create IAM Role

1. **IAM → Roles → Create role → AWS Service → Lambda**
2. Attach `AWSLambdaBasicExecutionRole`
3. Add inline policy with read access to: `ec2:Describe*`, `rds:Describe*`, `elasticloadbalancing:Describe*`, `cloudwatch:GetMetricStatistics`, `ecs:List*`, `ecs:Describe*`, `lambda:ListFunctions`, `elasticfilesystem:DescribeFileSystems`, `s3:ListAllMyBuckets`, `s3:GetBucketLocation`, `pricing:GetProducts`
4. Add write access to: `dynamodb:PutItem`, `dynamodb:BatchWriteItem`, `dynamodb:Query`
5. Name it `ScannerLambdaRole`

### Step 3 — Deploy Scanner Lambda

1. Zip `src/scanner/main.py` → `scanner.zip`
2. **Lambda → Create function**
   - Name: `IdleResourceScanner`, Runtime: Python 3.9, Role: `ScannerLambdaRole`
3. Upload zip, set handler: `main.lambda_handler`
4. Memory: **1024 MB**, Timeout: **15 min**
5. Env variable: `TABLE_NAME = IdleResourcesTable`

### Step 4 — Deploy Reader Lambda

1. Zip `src/api/reader.py` → `reader.zip`
2. **Lambda → Create function**
   - Name: `IdleResourceReader`, Runtime: Python 3.9, Role: `ScannerLambdaRole`
3. Upload zip, set handler: `reader.lambda_handler`
4. Env variable: `TABLE_NAME = IdleResourcesTable`

### Step 5 — Create API Gateway

1. **API Gateway → Create API → HTTP API**
2. Integration: Lambda → `IdleResourceReader`
3. Route: `GET /resources`, CORS: allow origin `*`
4. Deploy → stage `prod`, copy the **Invoke URL**

### Step 6 — Connect the Dashboard

1. Create `dashboard/.env`:
   ```
   VITE_API_URL=https://<your-api-id>.execute-api.us-east-1.amazonaws.com/prod/resources
   ```
2. Run locally:
   ```bash
   cd dashboard && npm install && npm run dev
   ```

---

## Running the Scanner

Trigger manually from the Lambda **Test** tab (empty `{}` payload), or schedule via EventBridge:

- Recommended schedule: **daily at 6 AM UTC**
- Each run creates a new daily row per resource (sortkey includes `YYYYMMDD`)
- Rows auto-expire after **400 days** via DynamoDB TTL

---

## Project Structure

```
IdleResourceDetectionBot/
├── src/
│   ├── scanner/
│   │   └── main.py          # Scanner Lambda — writes to DynamoDB
│   └── api/
│       └── reader.py        # Reader Lambda — serves data to dashboard
├── dashboard/
│   ├── src/
│   │   ├── App.jsx          # Main dashboard app
│   │   ├── data.js          # Local fallback data (for development)
│   │   └── components/
│   │       ├── SummaryCards.jsx
│   │       ├── DataTable.jsx
│   │       └── VisualizationSection.jsx
│   └── .env                 # Set VITE_API_URL here
└── README.md
```
