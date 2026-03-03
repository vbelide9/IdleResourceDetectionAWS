export interface Resource {
    pk: string;
    sk: string;
    type: string;
    days_idle: number;
    reason: string;
    size_gb?: number;
    tags?: Record<string, string>;
    project?: string;
    env?: string;
    accountLabel?: string;
    region?: string;
    resource_name?: string;
    status?: string;
    instance_state?: string;
    ami_id?: string;
    ami_name?: string;
    ami_age_days?: number;
}
