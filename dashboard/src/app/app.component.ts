import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceService } from './services/resource.service';
import { Resource } from './models/resource.model';
import { Subscription } from 'rxjs';

import { DataTableComponent } from './components/data-table.component';
import { AmiDataTableComponent } from './components/ami-data-table.component';
import { OptimizerDataTableComponent } from './components/optimizer-data-table.component';
import { ChartsComponent } from './components/charts/charts.component';
import { CertificatesDataTableComponent } from './components/certificates-data-table.component';
import { CostAnomaliesDataTableComponent } from './components/cost-anomalies-data-table.component';
import { AdminPortalComponent } from './components/admin-portal.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, DataTableComponent, AmiDataTableComponent, OptimizerDataTableComponent, ChartsComponent, CertificatesDataTableComponent, CostAnomaliesDataTableComponent, AdminPortalComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
    title = 'dashboard';

    projects: string[] = [];
    envs: string[] = [];
    timeFrames = ['Today', 'Last Week', 'Last Month', 'Overall'];

    selectedProject = 'All Projects';
    selectedEnv = 'All Envs';
    selectedTimeFrame = 'Overall';

    activeTab: 'overview' | 'idleResources' | 'analytics' | 'optimization' | 'certificates' | 'costAnomalies' | 'admin' = 'overview';

    allData: Resource[] = [];
    filteredData: Resource[] = [];
    dashboardData: Resource[] = [];
    analyticsData: Resource[] = [];
    optimizerData: Resource[] = [];
    idleOptimizationData: Resource[] = [];
    rightSizingOptimizationData: Resource[] = [];
    certificatesData: Resource[] = [];
    costAnomaliesData: Resource[] = [];
    optimizationTab: 'idle' | 'rightSizing' = 'idle';
    errors: { account: string, error: string }[] = [];
    loading = true;
    sidebarOpen = false;
    sidebarCollapsed = false;

    // Calculated KPI stats
    totalResourcesFlagged = 0;
    averageIdleDuration = 0;
    idleOver14Days = 0;
    servicesAffected = 0;

    // Optimization stats
    totalPotentialSavings = 0;
    idleSavings = 0;
    rightSizingSavings = 0;

    // AMI stats
    totalAMIs = 0;
    oldAMIs = 0;
    stoppedInstances = 0;
    uniqueAMICount = 0;

    // Certificate stats
    totalCerts = 0;
    criticalCerts = 0;
    warningCerts = 0;
    healthyCerts = 0;

    // Cost Anomaly stats
    totalAnomalies = 0;
    highImpactAnomalies = 0;
    totalAnomalyImpact = 0;
    avgAnomalyImpact = 0;

    isDarkMode = false;

    private subs: Subscription = new Subscription();

    constructor(private resourceService: ResourceService) {
        this.initTheme();
        this.initSidebar();
    }

    private initSidebar() {
        const saved = localStorage.getItem('sidebarCollapsed');
        if (saved === 'true') {
            this.sidebarCollapsed = true;
        }
    }

    toggleCollapse() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', String(this.sidebarCollapsed));
    }

    private initTheme() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            this.isDarkMode = true;
            document.documentElement.classList.add('dark');
        } else {
            this.isDarkMode = false;
            document.documentElement.classList.remove('dark');
        }
    }

    toggleTheme() {
        this.isDarkMode = !this.isDarkMode;
        if (this.isDarkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }

    ngOnInit(): void {
        this.subs.add(
            this.resourceService.loading$.subscribe(loading => this.loading = loading)
        );
        this.subs.add(
            this.resourceService.errors$.subscribe(errors => this.errors = errors)
        );
        this.subs.add(
            this.resourceService.resources$.subscribe(data => {
                this.allData = data || [];
                this.extractFilters();
                this.applyFilters();
            })
        );

        // Trigger parallel fetch across all configured accounts
        this.resourceService.fetchAllResources();
    }

    ngOnDestroy(): void {
        this.subs.unsubscribe();
    }

    toggleSidebar() {
        this.sidebarOpen = !this.sidebarOpen;
    }

    switchTab(tab: 'overview' | 'idleResources' | 'analytics' | 'optimization' | 'certificates' | 'costAnomalies' | 'admin', event: Event) {
        event.preventDefault();
        this.activeTab = tab;
        if (window.innerWidth < 768) {
            this.sidebarOpen = false;
        }
    }

    selectProject(project: string) {
        this.selectedProject = project;
        this.applyFilters();
    }

    selectEnv(env: string) {
        this.selectedEnv = env;
        this.applyFilters();
    }

    selectTimeFrame(tf: string) {
        this.selectedTimeFrame = tf;
        this.applyFilters();
    }

    private extractFilters() {
        const pSet = new Set<string>();
        const eSet = new Set<string>();
        this.allData.forEach(item => {
            if (item.project) pSet.add(item.project);
            if (item.env) eSet.add(item.env);
        });
        this.projects = Array.from(pSet).sort();
        this.envs = Array.from(eSet).sort();
    }

    private applyFilters() {
        this.filteredData = this.allData.filter(item => {
            const matchProject = this.selectedProject === 'All Projects' || item.project === this.selectedProject;
            const matchEnv = this.selectedEnv === 'All Envs' || item.env === this.selectedEnv;

            let matchTime = true;
            if (this.selectedTimeFrame === 'Today') matchTime = item.days_idle <= 1;
            else if (this.selectedTimeFrame === 'Last Week') matchTime = item.days_idle <= 7;
            else if (this.selectedTimeFrame === 'Last Month') matchTime = item.days_idle <= 30;

            return matchProject && matchEnv && matchTime;
        });

        // Dashboard ONLY shows idle resources
        this.dashboardData = this.filteredData.filter(i => i.status === 'Idle');

        // Analytics shows ALL AWS EC2 with AMI tracked, including stopped ones
        this.analyticsData = this.filteredData.filter(i =>
            i.type === 'EC2' &&
            i.ami_id &&
            i.ami_id !== 'Unknown'
        );

        // Optimization shows resources with active Compute Optimizer recommendations
        this.optimizerData = this.filteredData.filter(i =>
            i.optimizer_finding &&
            i.optimizer_finding !== 'Unavailable'
        );

        this.idleOptimizationData = this.optimizerData.filter(i => i.optimizer_finding === 'Idle');
        this.rightSizingOptimizationData = this.optimizerData.filter(i => i.optimizer_finding !== 'Idle');

        this.certificatesData = this.filteredData.filter(i => i.type === 'ACM Certificate');
        this.costAnomaliesData = this.filteredData.filter(i => i.type === 'Cost Anomaly');

        this.calculateStats();
    }

    private calculateStats() {
        this.totalResourcesFlagged = this.dashboardData.length;

        const totalDays = this.dashboardData.reduce((sum, item) => sum + item.days_idle, 0);
        this.averageIdleDuration = this.totalResourcesFlagged > 0 ? Math.round(totalDays / this.totalResourcesFlagged) : 0;

        this.idleOver14Days = this.dashboardData.filter(i => i.days_idle >= 14).length;

        this.servicesAffected = new Set(this.dashboardData.map(i => i.type)).size;

        this.totalPotentialSavings = this.optimizerData.reduce((sum, item) => sum + (item.monthly_savings_opportunity || 0), 0);
        this.idleSavings = this.idleOptimizationData.reduce((sum, item) => sum + (item.monthly_savings_opportunity || 0), 0);
        this.rightSizingSavings = this.rightSizingOptimizationData.reduce((sum, item) => sum + (item.monthly_savings_opportunity || 0), 0);

        // AMI stats
        this.totalAMIs = this.analyticsData.length;
        this.oldAMIs = this.analyticsData.filter(i => (i as any).ami_age_days > 365).length;
        this.stoppedInstances = this.analyticsData.filter(i => (i as any).instance_state === 'stopped').length;
        this.uniqueAMICount = new Set(this.analyticsData.map(i => i.ami_id)).size;

        // Certificate stats
        this.totalCerts = this.certificatesData.length;
        this.criticalCerts = this.certificatesData.filter(i => (i as any).acm_expiration_days <= 30).length;
        this.warningCerts = this.certificatesData.filter(i => (i as any).acm_expiration_days > 30 && (i as any).acm_expiration_days <= 90).length;
        this.healthyCerts = this.certificatesData.filter(i => (i as any).acm_expiration_days > 90).length;

        // Cost Anomaly stats
        this.totalAnomalies = this.costAnomaliesData.length;
        this.totalAnomalyImpact = this.costAnomaliesData.reduce((sum, item) => {
            try {
                const parsed = JSON.parse((item as any).anomaly_details || '{}');
                return sum + (parsed?.TotalImpact || 0);
            } catch (e) {
                return sum;
            }
        }, 0);
        this.highImpactAnomalies = this.costAnomaliesData.filter(i => {
            try {
                const parsed = JSON.parse((i as any).anomaly_details || '{}');
                return (parsed?.TotalImpact || 0) >= 100;
            } catch (e) {
                return false;
            }
        }).length;
        this.avgAnomalyImpact = this.totalAnomalies > 0 ? this.totalAnomalyImpact / this.totalAnomalies : 0;
    }
}
