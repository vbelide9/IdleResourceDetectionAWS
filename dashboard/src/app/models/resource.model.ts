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
    // Compute Optimizer fields
    optimizer_finding?: string;
    optimizer_recommendation?: string;
    monthly_savings_opportunity?: number;
    // ACM Certificate & Cost Anomaly extensions
    acm_expiration_days?: number;
    acm_expiration_date?: string;
    anomaly_details?: string;
}
