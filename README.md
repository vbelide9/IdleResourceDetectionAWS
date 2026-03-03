# AWS Idle Resource FinOps Bot

An automated AWS infrastructure scanner that detects idle resources, calculates wasted costs, and stores everything in DynamoDB for real-time dashboard reporting across multiple AWS accounts.

---

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Account A/B/C                          │
│                                                                     │
│  EventBridge (daily)                                                │
│        │                                                            │
│        ▼                                                            │
│  ┌───────────────────┐      ┌──────────────────┐                   │
│  │  Scanner Lambda   │─────▶│    DynamoDB       │                   │
│  │  (main.py)        │      │  IdleResourcesTable│                  │
│  └──────────┬────────┘      └──────────┬─────────┘                  │
│             │                          │                            │
│                            ┌───────────▼───────────┐               │
│                            │   API Gateway          │               │
│                            │   GET /resources       │               │
│                            └───────────────────────┘               │
│                                        │                            │
│                            ┌───────────▼───────────┐               │
│                            │   API Gateway          │               │
│                            │   GET /resources       │               │
│                            └───────────────────────┘               │
└────────────────────────────────────────┼────────────────────────────┘
                                         │ HTTPS (Multi-Account Support)
                                         ▼
                              ┌──────────────────────┐
                              │  React Dashboard      │
                              │  (VITE_ACCOUNTS=...)  │
                              └──────────────────────┘
```

---

## Services Scanned

| Service | Idle Criteria | CloudWatch Metric |
|---|---|---|
| **EC2** | CPU < 10% AND NetworkOut < 5MB | `CPUUtilization`, `NetworkOut` |
| **RDS** | DatabaseConnections = 0 | `DatabaseConnections` |
| **ELB (ALB/NLB)** | RequestCount = 0 AND ActiveConnections = 0 | `RequestCount`, `ActiveConnectionCount`, `ActiveFlowCount` |
| **EFS** | ClientConnections = 0 | `ClientConnections` |
| **Lambda** | No invocations in 30 days | `Invocations` |
| **EBS Volumes** | Unattached (no EC2 association) | API state check |
| **EBS Snapshots** | Older than 30 days, not linked to AMI | `StartTime` field |
| **Elastic IPs** | Not associated with any instance or ENI | API state check |
| **NAT Gateway** | Zero bytes sent to destination | `BytesOutToDestination` |
| **ECS Services** | desiredCount > 0 AND (zero CPU + Network for 24h) | API state check + `ContainerInsights` metrics |
| **S3 Buckets** | No requests in 30 days* (see exclusions below) | `AllRequests` |

> * **S3 Exclusions:** The scanner automatically ignores log destination buckets (e.g. buckets containing `-logs`, `-access-log`, `-audit-replicated` in the name) without touching resource tags. You can override the matching patterns using the `S3_IGNORE_PATTERNS` environment variable.



## Centralised Angular Dashboard

The dashboard supports monitoring multiple AWS accounts from a single pane of glass and was recently rewritten from React to Angular utilizing a premium Shadcn-inspired interaction design language.

1. Deploy the API Gateway reader to each AWS account (see deployment steps).
2. Create `dashboard/.env` with your API Gateway URLs separated by commas:
   ```env
   VITE_ACCOUNTS=https://api-123.execute-api.us-east-1.amazonaws.com/prod/resources,https://api-456.execute-api.eu-west-1.amazonaws.com/prod/resources
   ```
3. Run locally:
   ```bash
   cd dashboard
   npm install
   npm run start
   ```

### Dashboard Features
*   **Modern Angular Architecture:** Fully responsive, zero-build-time CSS using Tailwind, and component-scoped RxJS data handling.
*   **AMI Age Tracking:** Extracts `ImageId` and calculates the days since creation for all Running and Stopped EC2 instances, visible in a dedicated AMI analytics tab.
*   **High-Density Visualization:** 15-row data tables without text truncation, complete with multi-field sortable headers and transition hover animations on all KPI widgets.
*   **Security & Architecture Modules:** Out-of-the-box UI navigation links ready for backend integration with CAST Scan Status, Archer Risk Exceptions, TLS Certificate Expiration tracking, and CVE data feeds.
*   **Global Date Picker:** Traverse scanner history (metrics are tracked daily via sort keys `YYYYMMDD`).
*   **Environment Filters:** Auto-filters based on standard SDLC tags (`dev`, `prod`, `qa`) found in your AWS resource tags.
*   **Service/Resource Charts:** Visualises idle times across the entire fleet.
*   **Exclusion Tagging:** AWS resources tagged with `IdleScanIgnore=True` will not appear in the dashboard.



---

## Manual Deployment

This bot is deliberately designed without a heavy IaC framework (like CDK or Terraform) in the repo to allow security/cloud teams to embed the logic into their own standard GitOps pipelines.

For manual deployment into a single account:

1. **DynamoDB:** Create `IdleResourcesTable` (Partition key: `pk`, Sort key: `sk`, On-demand capacity).
2. **IAM Role:** Create a Lambda role with permissions for all `Describe*`/`List*` calls for the supported services, plus DynamoDB read/write.
3. **Lambda Scanner:**
   - Package `src/scanner/main.py`.
   - Set env vars: `TABLE_NAME=IdleResourcesTable`.
   - Optional: `S3_IGNORE_PATTERNS=-logs,-access-log` (defaults included).
   - Memory: 1024MB, Timeout: 15 mins. Trigger via EventBridge daily.
4. **Lambda Reader:**
   - Package `src/api/reader.py`
   - Set env vars: `TABLE_NAME=IdleResourcesTable`.
5. **API Gateway:** Map an HTTP API to the Reader Lambda and configure CORS to allow your dashboard frontend.
