import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { Resource } from '../models/resource.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ResourceService {
    private resourcesSubject = new BehaviorSubject<Resource[]>([]);
    public resources$ = this.resourcesSubject.asObservable();

    private loadingSubject = new BehaviorSubject<boolean>(true);
    public loading$ = this.loadingSubject.asObservable();

    private errorsSubject = new BehaviorSubject<{ account: string, error: string }[]>([]);
    public errors$ = this.errorsSubject.asObservable();

    constructor(private http: HttpClient) { }

    public fetchAllResources(): void {
        this.loadingSubject.next(true);

        const mockData: Resource[] = this.generateMockData();

        // Simulate network delay
        setTimeout(() => {
            this.resourcesSubject.next(mockData);
            this.errorsSubject.next([]);
            this.loadingSubject.next(false);
        }, 800);
    }

    public addManualCertificate(certPayload: any): Observable<any> {
        // Here you would normally make an HTTP POST to the backend API:
        // return this.http.post(`${environment.apiUrl}/manual-certificates`, certPayload);

        // For the current mock setup, we insert directly into the subject:
        return new Observable(observer => {
            setTimeout(() => {
                const newResource: Resource = {
                    pk: `SCOPE#MAIN`,
                    sk: `RES#ExternalCertificate#${certPayload.resource_name}#${certPayload.project}#${certPayload.env}`,
                    type: 'External Certificate',
                    region: 'N/A',
                    resource_name: certPayload.resource_name,
                    accountLabel: `${certPayload.project}-${certPayload.env}`,
                    project: certPayload.project,
                    env: certPayload.env,
                    acm_expiration_date: certPayload.acm_expiration_date,
                    status: 'Active',
                    reason: certPayload.notes || 'Manually Tracked',
                    days_idle: 0
                };

                const currentData = this.resourcesSubject.value;
                this.resourcesSubject.next([newResource, ...currentData]);

                observer.next({ success: true, item: newResource });
                observer.complete();
            }, 500); // simulate 500ms network save time
        });
    }

    private generateMockData(): Resource[] {
        const types = [
            { type: 'EC2', reasons: ['CPU < 1%', 'Stopped for 30+ days'], namePrefix: ['api-server', 'worker-node', 'bastion-host', 'batch-processor'] },
            { type: 'RDS', reasons: ['No Connections', 'CPU < 1%'], namePrefix: ['main-db', 'replica-db', 'reporting-db', 'cache-db'] },
            { type: 'EBS', reasons: ['Unattached'], namePrefix: ['data-vol', 'log-vol', 'backup-vol'] },
            { type: 'Elastic IP', reasons: ['Unattached'], namePrefix: ['vpn-ip', 'nat-ip', 'nlb-ip'] },
            { type: 'S3 Bucket', reasons: ['No Recent Access', 'Empty Bucket'], namePrefix: ['assets-bucket', 'backups', 'logs-archive'] },
            { type: 'ECS Service', reasons: ['Running but Idle', '0 Tasks Running'], namePrefix: ['frontend-svc', 'backend-svc', 'processor-svc'] },
            { type: 'ACM Certificate', reasons: ['Expiring Soon'], namePrefix: ['api.example.com', 'auth.domain.net', 'metrics.company.org'] },
            { type: 'Cost Anomaly', reasons: ['High Impact Anomaly'], namePrefix: ['EC2-Spike', 'RDS-Spike', 'S3-DataTransfer'] }
        ];

        const projects = ['ICS-AEM', 'ICS-EM', 'ICS-SDUI', 'ICS-ES'];
        const envs = ['dev', 'tst', 'prd'];

        const data: Resource[] = [];

        for (let i = 0; i < 150; i++) {
            const project = projects[Math.floor(Math.random() * projects.length)];
            const env = envs[Math.floor(Math.random() * envs.length)];
            const sample = types[Math.floor(Math.random() * types.length)];
            const reason = sample.reasons[Math.floor(Math.random() * sample.reasons.length)];
            const nameBase = sample.namePrefix[Math.floor(Math.random() * sample.namePrefix.length)];

            let id = '';
            if (sample.type === 'EC2') id = `i-${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}`;
            else if (sample.type === 'RDS') id = `${nameBase}-${env}-${project}`;
            else if (sample.type === 'EBS') id = `vol-${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}`;
            else if (sample.type === 'Elastic IP') id = `eipalloc-${Math.random().toString(16).substring(2, 10)}`;
            else if (sample.type === 'S3 Bucket') id = `${project}-${env}-${nameBase}`;
            else if (sample.type === 'ECS Service') id = `${project}-${env}-cluster/${nameBase}`;
            else if (sample.type === 'ACM Certificate') id = `${nameBase}`;
            else if (sample.type === 'Cost Anomaly') id = `CostAnomaly-${Math.random().toString(16).substring(2, 10)}`;

            const region = ['us-east-1', 'us-west-2', 'eu-west-1'][Math.floor(Math.random() * 3)];
            const resourceName = `${project}-${env}-${nameBase}-${Math.floor(Math.random() * 100)}`;
            const isStopped = reason.toLowerCase().includes('stopped');
            const isIdle = Math.random() > 0.3 || isStopped; // 70% idle

            let optimizer_finding;
            let optimizer_recommendation;
            let monthly_savings_opportunity;

            if ((sample.type === 'EC2' || sample.type === 'EBS' || sample.type === 'ECS Service') && Math.random() > 0.1) {
                const findings = ['Overprovisioned', 'Overprovisioned', 'Underprovisioned', 'Optimized', 'Idle', 'Idle'];
                optimizer_finding = findings[Math.floor(Math.random() * findings.length)];

                if (optimizer_finding === 'Overprovisioned') {
                    monthly_savings_opportunity = Number((Math.random() * 850 + 120).toFixed(2));
                    if (sample.type === 'EC2') optimizer_recommendation = ['t3.medium', 'm5.large', 'c5.xlarge', 't4g.small'][Math.floor(Math.random() * 4)];
                    else if (sample.type === 'EBS') optimizer_recommendation = 'Modify volume size or IOPS';
                    else if (sample.type === 'ECS Service') optimizer_recommendation = 'Reduce task size (CPU/Memory)';
                } else if (optimizer_finding === 'Underprovisioned') {
                    monthly_savings_opportunity = 0;
                    if (sample.type === 'EC2') optimizer_recommendation = ['m5.2xlarge', 'c5.4xlarge', 'r5.xlarge'][Math.floor(Math.random() * 3)];
                    else if (sample.type === 'EBS') optimizer_recommendation = 'Increase volume size or IOPS';
                    else if (sample.type === 'ECS Service') optimizer_recommendation = 'Increase task size (CPU/Memory)';
                } else if (optimizer_finding === 'Idle') {
                    monthly_savings_opportunity = Number((Math.random() * 480 + 55).toFixed(2));
                    optimizer_recommendation = 'Terminate or stop resource';
                } else {
                    monthly_savings_opportunity = 0;
                    optimizer_recommendation = 'None';
                }
            }

            let acm_expiration_days;
            let acm_expiration_date;
            if (sample.type === 'ACM Certificate') {
                acm_expiration_days = Math.floor(Math.random() * 30);
                const expiry = new Date();
                expiry.setDate(expiry.getDate() + acm_expiration_days);
                acm_expiration_date = expiry.toISOString();
            }

            let anomaly_details;
            if (sample.type === 'Cost Anomaly') {
                const impactValue = Math.random() * 5000 + 50;
                const expectedValue = Math.random() * 2000 + 100;
                const actualValue = expectedValue + impactValue;
                const percentage = (impactValue / expectedValue) * 100;
                const maxScore = Math.random() * 0.99; // CE max score is usually 0-1

                anomaly_details = JSON.stringify({
                    TotalImpact: Number(impactValue.toFixed(2)),
                    TotalActualSpend: Number(actualValue.toFixed(2)),
                    TotalExpectedSpend: Number(expectedValue.toFixed(2)),
                    TotalAnomalyPercentage: Number(percentage.toFixed(2)),
                    MaxScore: Number(maxScore.toFixed(2)),
                    AnomalyStartDate: new Date(Date.now() - 3 * 86400000).toISOString(),
                    AnomalyEndDate: new Date().toISOString(),
                    RootCauses: [
                        { "Service": "Amazon Elastic Compute Cloud - Compute", "UsageType": "BoxUsage:t3.large", "Region": "us-east-1" },
                        { "LinkedAccount": "123456789012" }
                    ]
                });
            }

            data.push({
                pk: `ACCOUNT#${Math.floor(Math.random() * 899999999999) + 100000000000}`,
                sk: `RES#${id}`,
                type: sample.type,
                days_idle: isIdle ? Math.floor(Math.random() * 90) + 1 : 0,
                reason: isIdle ? reason : 'Actively Running',
                status: isIdle ? 'Idle' : 'Active',
                instance_state: sample.type === 'EC2' ? (isStopped ? 'stopped' : 'running') : undefined,
                size_gb: (sample.type === 'EBS' || sample.type === 'S3 Bucket' || sample.type === 'RDS') ? Math.floor(Math.random() * 500) + 10 : undefined,
                region: region,
                resource_name: resourceName,
                ami_id: sample.type === 'EC2' ? `ami-0${Math.random().toString(16).substring(2, 9)}` : undefined,
                ami_name: sample.type === 'EC2' ? `amazon-linux-2023-${env}-base` : undefined,
                ami_age_days: sample.type === 'EC2' ? Math.floor(Math.random() * 120) : undefined,
                optimizer_finding: optimizer_finding,
                optimizer_recommendation: optimizer_recommendation,
                monthly_savings_opportunity: monthly_savings_opportunity,
                acm_expiration_days: acm_expiration_days,
                acm_expiration_date: acm_expiration_date,
                anomaly_details: anomaly_details,
                tags: {
                    Name: resourceName,
                    Owner: 'platform-team',
                    CostCenter: '12345'
                },
                project: project,
                env: env,
                accountLabel: `${project}-${env}`
            });
        }

        return data;
    }
}
