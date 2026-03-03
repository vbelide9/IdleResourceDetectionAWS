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
│  └───────────────────┘      └──────────┬─────────┘                  │
│                                        │                            │
│                            ┌───────────▼───────────┐               │
│                            │   API Gateway          │               │
│                            │   GET /resources       │               │
│                            └───────────┬───────────┘               │
│                                        │                            │
└────────────────────────────────────────┼────────────────────────────┘
                                         │ HTTPS (Multi-Account Support)
                                         ▼
                              ┌──────────────────────┐
                              │  Angular Dashboard    │
                              │  (CloudOps Console)   │
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

---

## Centralised Angular Dashboard

The dashboard supports monitoring multiple AWS accounts from a single pane of glass. It is built with Angular and uses a premium Shadcn-inspired interaction design language with Tailwind CSS.

### Supported Projects

The dashboard is configured for the following projects:

| Project ID | Description |
|---|---|
| `ICS-AEM` | ICS AEM |
| `ICS-EM` | ICS EM |
| `ICS-SDUI` | ICS SDUI |
| `ICS-ES` | ICS ES |

### Setup

1. Deploy the API Gateway reader to each AWS account (see deployment steps).
2. Configure your API Gateway URLs in `dashboard/src/environments/environment.ts`:
   ```typescript
   export const environment = {
       production: false,
       accounts: {
           "ICS-AEM-dev": "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/resources",
           "ICS-AEM-tst": "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/resources",
           "ICS-EM-dev": "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/resources",
           "ICS-SDUI-pro": "https://your-api-id.execute-api.us-east-1.amazonaws.com/prod/resources"
       }
   };
   ```
3. Run locally:
   ```bash
   cd dashboard
   npm install
   ng serve
   ```

### Dashboard Features

*   **Modern Angular Architecture:** Fully responsive design using Tailwind CSS and component-scoped RxJS data handling.
*   **Sidebar Navigation:** Clean sidebar with Title Case labels for all modules — Idle Resources Dashboard, AMI Details, Optimization, and more.
*   **AMI Age Tracking:** Extracts `ImageId` and calculates the days since creation for all Running and Stopped EC2 instances, visible in a dedicated AMI analytics tab.
*   **High-Density Visualization:** 15-row data tables without text truncation, complete with multi-field sortable headers and transition hover animations on all KPI widgets.
*   **Certificate Expirations:** Tracks ACM certificate expirations with filterable views for ACM-only and External-only certificates with dynamic table headers.
*   **Certificate Management:** A dedicated admin form under **Settings → Certificate Management** to manually register and track external (non-ACM) certificates. Collects domain name, vendor, expiration date, renewal date, project, and environment. Filter dropdowns are hidden on this tab since it is a write operation.
*   **AWS Cost Anomalies:** Displays unexpected spending spikes with expandable detail rows showing root cause, impact amount, and linked AWS services.
*   **Security & Architecture Modules:** Navigation links for CAST Scan Status, Archer Risk Exceptions, and CVE data feeds.
*   **Global Date Picker:** Traverse scanner history (metrics are tracked daily via sort keys `YYYYMMDD`).
*   **Environment Filters:** Auto-filters based on standard SDLC tags (`dev`, `tst`, `prd`) found in your AWS resource tags.
*   **Project Filters:** Filter data by project (ICS-AEM, ICS-EM, ICS-SDUI, ICS-ES).
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
