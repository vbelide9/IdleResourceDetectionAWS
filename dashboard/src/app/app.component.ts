import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResourceService } from './services/resource.service';
import { Resource } from './models/resource.model';
import { Subscription } from 'rxjs';
import { KpiCardsComponent } from './components/kpi-cards.component';
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
    imports: [CommonModule, KpiCardsComponent, DataTableComponent, AmiDataTableComponent, OptimizerDataTableComponent, ChartsComponent, CertificatesDataTableComponent, CostAnomaliesDataTableComponent, AdminPortalComponent],
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

    activeTab: 'dashboard' | 'analytics' | 'optimization' | 'certificates' | 'costAnomalies' | 'admin' = 'dashboard';

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

    // Calculated KPI stats
    totalResourcesFlagged = 0;
    averageIdleDuration = 0;
    idleOver14Days = 0;
    servicesAffected = 0;

    // Optimization stats
    totalPotentialSavings = 0;
    idleSavings = 0;
    rightSizingSavings = 0;

    isDarkMode = false;

    private subs: Subscription = new Subscription();

    constructor(private resourceService: ResourceService) {
        this.initTheme();
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

    switchTab(tab: 'dashboard' | 'analytics' | 'optimization' | 'certificates' | 'costAnomalies' | 'admin', event: Event) {
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
    }
}
