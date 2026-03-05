import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AppComponent } from '../app/app.component';
import { ResourceService } from '../app/services/resource.service';
import { of } from 'rxjs';
import { Resource } from '../app/models/resource.model';
import { CommonModule } from '@angular/common';

describe('AppComponent', () => {
    let component: AppComponent;
    let fixture: ComponentFixture<AppComponent>;
    let mockResourceService: any;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', resource_name: 'test-db', type: 'RDS', reason: 'High CPU', status: 'Idle', optimizer_finding: 'Idle', region: 'us-east-1', env: 'prd', project: 'ProjA', days_idle: 10, monthly_savings_opportunity: 100 },
        { pk: '2', sk: '2', resource_name: 'web-server', type: 'EC2', reason: 'No traffic', status: 'Stopped', optimizer_finding: 'Right-size', region: 'us-west-2', env: 'dev', project: 'ProjB', days_idle: 45, monthly_savings_opportunity: 50, ami_id: 'ami-123', ami_age_days: 400, instance_state: 'stopped' },
        { pk: '3', sk: '3', resource_name: 'cache', type: 'ACM Certificate', reason: 'Expiring', status: 'Active', region: 'eu-west-1', env: 'tst', project: 'ProjA', days_idle: 20, acm_expiration_days: 15 },
        { pk: '4', sk: '4', resource_name: 'anomaly', type: 'Cost Anomaly', reason: 'Spike', status: 'Active', region: 'eu-west-1', env: 'tst', project: 'ProjB', days_idle: 0, anomaly_details: '{"TotalImpact": 200}' }
    ];

    beforeEach(async () => {
        mockResourceService = {
            loading$: of(false),
            errors$: of([]),
            resources$: of([...mockData]),
            fetchAllResources: vi.fn()
        };

        // Mock window.matchMedia
        Object.defineProperty(window, 'matchMedia', {
            writable: true,
            value: vi.fn().mockImplementation(query => ({
                matches: false,
                media: query,
                onchange: null,
                addListener: vi.fn(), // Deprecated
                removeListener: vi.fn(), // Deprecated
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                dispatchEvent: vi.fn(),
            })),
        });

        // Mock localStorage
        const store: Record<string, string> = {};
        const mockLocalStorage = {
            getItem: (key: string): string | null => {
                return key in store ? store[key] : null;
            },
            setItem: (key: string, value: string) => {
                store[key] = `${value}`;
            },
            removeItem: (key: string) => {
                delete store[key];
            },
            clear: () => {
                for (const key in store) {
                    delete store[key];
                }
            }
        };
        Object.defineProperty(window, 'localStorage', {
            value: mockLocalStorage
        });

        await TestBed.configureTestingModule({
            imports: [AppComponent, CommonModule],
            providers: [
                { provide: ResourceService, useValue: mockResourceService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(AppComponent);
        component = fixture.componentInstance;
        fixture.detectChanges(); // triggers ngOnInit
    });

    it('should create the app', () => {
        expect(component).toBeTruthy();
    });

    it('should call fetchAllResources on init', () => {
        expect(mockResourceService.fetchAllResources).toHaveBeenCalled();
    });

    it('should extract and apply filters correctly on data load', () => {
        expect(component.allData.length).toBe(4);

        expect(component.projects).toContain('ProjA');
        expect(component.projects).toContain('ProjB');

        expect(component.envs).toContain('dev');
        expect(component.envs).toContain('prd');
        expect(component.envs).toContain('tst');

        // Check data sets
        expect(component.dashboardData.length).toBe(1); // 1 Idle
        expect(component.analyticsData.length).toBe(1); // 1 EC2 with AMI
        expect(component.optimizerData.length).toBe(2); // 2 with optimizer findings
        expect(component.certificatesData.length).toBe(1); // 1 Cert
        expect(component.costAnomaliesData.length).toBe(1); // 1 Anomaly
    });

    it('should calculate stats correctly', () => {
        expect(component.totalResourcesFlagged).toBe(1);
        expect(component.totalPotentialSavings).toBe(150); // 100 + 50
        expect(component.idleSavings).toBe(100);
        expect(component.rightSizingSavings).toBe(50);

        // AMC stats
        expect(component.totalAMIs).toBe(1);
        expect(component.oldAMIs).toBe(1); // > 365 days
        expect(component.stoppedInstances).toBe(1);

        // Certificates stats
        expect(component.criticalCerts).toBe(1); // 15 days <= 30

        // Anomalies stats
        expect(component.highImpactAnomalies).toBe(1); // 200 >= 100
        expect(component.totalAnomalyImpact).toBe(200);
    });

    it('should handle anomaly parsing safely', () => {
        const errorItem = { ...mockData[0], type: 'Cost Anomaly', anomaly_details: 'invalid json' };
        component.allData = [errorItem];
        (component as any).applyFilters();
        expect(component.totalAnomalyImpact).toBe(0);
        expect(component.highImpactAnomalies).toBe(0);
    });

    it('should apply filters on selection change', () => {
        component.selectProject('ProjA');
        expect(component.selectedProject).toBe('ProjA');
        expect(component.filteredData.length).toBe(2); // Mock data has 2 ProjA

        component.selectEnv('prd');
        expect(component.selectedEnv).toBe('prd');
        expect(component.filteredData.length).toBe(1); // Only 1 ProjA in prd

        component.selectTimeFrame('Last Week');
        expect(component.selectedTimeFrame).toBe('Last Week');
        // days_idle = 10, so it gets filtered out from Last Week (<= 7)
        expect(component.filteredData.length).toBe(0);
    });

    it('should switch tabs', () => {
        const event = new Event('click');
        Object.defineProperty(window, 'innerWidth', { value: 500 });
        component.sidebarOpen = true;

        component.switchTab('analytics', event);
        expect(component.activeTab).toBe('analytics');
        expect(component.sidebarOpen).toBe(false); // Should close on mobile
    });

    it('should toggle sidebar operations', () => {
        component.toggleSidebar();
        expect(component.sidebarOpen).toBe(true);

        component.toggleCollapse();
        expect(component.sidebarCollapsed).toBe(true);
        expect(localStorage.getItem('sidebarCollapsed')).toBe('true');
    });

    it('should toggle theme mode', () => {
        component.isDarkMode = false;
        component.toggleTheme();
        expect(component.isDarkMode).toBe(true);
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(document.documentElement.classList.contains('dark')).toBe(true);

        component.toggleTheme();
        expect(component.isDarkMode).toBe(false);
        expect(localStorage.getItem('theme')).toBe('light');
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });

    it('should init theme correctly from local storage', () => {
        localStorage.setItem('theme', 'dark');
        (component as any).initTheme();
        expect(component.isDarkMode).toBe(true);

        localStorage.setItem('theme', 'light');
        (component as any).initTheme();
        expect(component.isDarkMode).toBe(false);
    });
});
