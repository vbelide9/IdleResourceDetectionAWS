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

    private generateMockData(): Resource[] {
        const types = [
            { type: 'EC2', reasons: ['CPU < 1%', 'Stopped for 30+ days'], namePrefix: ['api-server', 'worker-node', 'bastion-host', 'batch-processor'] },
            { type: 'RDS', reasons: ['No Connections', 'CPU < 1%'], namePrefix: ['main-db', 'replica-db', 'reporting-db', 'cache-db'] },
            { type: 'EBS', reasons: ['Unattached'], namePrefix: ['data-vol', 'log-vol', 'backup-vol'] },
            { type: 'Elastic IP', reasons: ['Unattached'], namePrefix: ['vpn-ip', 'nat-ip', 'nlb-ip'] },
            { type: 'S3 Bucket', reasons: ['No Recent Access', 'Empty Bucket'], namePrefix: ['assets-bucket', 'backups', 'logs-archive'] },
            { type: 'ECS Service', reasons: ['Running but Idle', '0 Tasks Running'], namePrefix: ['frontend-svc', 'backend-svc', 'processor-svc'] }
        ];

        const projects = ['ics-aem', 'ics-em', 'ics-sdui', 'core-platform'];
        const envs = ['dev', 'tst', 'stg', 'pro'];

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

            const region = ['us-east-1', 'us-west-2', 'eu-west-1'][Math.floor(Math.random() * 3)];
            const resourceName = `${project}-${env}-${nameBase}-${Math.floor(Math.random() * 100)}`;
            const isStopped = reason.toLowerCase().includes('stopped');
            const isIdle = Math.random() > 0.3 || isStopped; // 70% idle

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
