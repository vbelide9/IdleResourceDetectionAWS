import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OptimizerDataTableComponent } from '../../app/components/optimizer-data-table.component';
import { Resource } from '../../app/models/resource.model';
import { SimpleChange } from '@angular/core';

describe('OptimizerDataTableComponent', () => {
    let component: OptimizerDataTableComponent;
    let fixture: ComponentFixture<OptimizerDataTableComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', resource_name: 'test-api', type: 'EC2', monthly_savings_opportunity: 100, optimizer_finding: 'Overprovisioned', reason: '', status: '', env: 'dev', days_idle: 0 },
        { pk: '2', sk: '2', resource_name: 'db-node', type: 'RDS', monthly_savings_opportunity: 500, optimizer_finding: 'Idle', reason: '', status: '', env: 'prd', days_idle: 30 },
        { pk: '3', sk: '3', resource_name: 'cache', type: 'ElastiCache', monthly_savings_opportunity: 50, optimizer_finding: 'Underprovisioned', reason: '', status: '', env: 'tst', days_idle: 0 }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [OptimizerDataTableComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(OptimizerDataTableComponent);
        component = fixture.componentInstance;
        component.data = [...mockData];
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should populate sortedData on changes', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });
        expect(component.sortedData.length).toBe(3);
    });

    it('should calculate totalPages and paginatedData relative to pageSize', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });
        component.pageSize = 2;

        expect(component.totalPages).toBe(2);

        component.currentPage = 1;
        expect(component.paginatedData.length).toBe(2);

        component.currentPage = 2;
        expect(component.paginatedData.length).toBe(1);
    });

    it('should sort data, descending by default for saving opportunity', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        // Initial sort setup is "desc" for monthly_savings_opportunity
        expect(component.sortedData[0].monthly_savings_opportunity).toBe(500);
        expect(component.sortedData[2].monthly_savings_opportunity).toBe(50);
    });

    it('should toggle sort direction when sorting by same column', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        component.sortBy('monthly_savings_opportunity');
        expect(component.sortDirection).toBe('asc');
        expect(component.sortedData[0].monthly_savings_opportunity).toBe(50);

        component.sortBy('monthly_savings_opportunity');
        expect(component.sortDirection).toBe('desc');
        expect(component.sortedData[0].monthly_savings_opportunity).toBe(500);
    });

    it('should reset to asc when sorting new column except opportunity', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        component.sortBy('resource_name');
        expect(component.sortColumn).toBe('resource_name');
        expect(component.sortDirection).toBe('asc');
        expect(component.sortedData[0].resource_name).toBe('cache');

        // When going back to opportunity, checks if it defaults to desc
        component.sortBy('monthly_savings_opportunity');
        expect(component.sortDirection).toBe('desc');
    });

    it('should jump pages properly', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });
        component.pageSize = 2;
        expect(component.currentPage).toBe(1);

        component.nextPage();
        expect(component.currentPage).toBe(2);

        component.nextPage(); // Should not exceed totalPages (2)
        expect(component.currentPage).toBe(2);

        component.prevPage();
        expect(component.currentPage).toBe(1);

        component.prevPage(); // Should not go below 1
        expect(component.currentPage).toBe(1);
    });

    it('should test string sorting with undefined values gracefully', () => {
        const trickyData = [
            ...mockData,
            { pk: '4', sk: '4', type: 'EC2', reason: '', status: '', days_idle: 0 } // missing resource_name
        ];
        component.data = trickyData;
        component.sortBy('resource_name');
        expect(component.sortedData[0].pk).toBe('4'); // undefined goes first
    });

    it('should return correct badge color depending on finding', () => {
        expect(component.getBadgeClass('Overprovisioned')).toContain('yellow-100');
        expect(component.getBadgeClass('Underprovisioned')).toContain('red-100');
        expect(component.getBadgeClass('Optimized')).toContain('green-100');
        expect(component.getBadgeClass('Idle')).toContain('orange-100');
        expect(component.getBadgeClass(undefined)).toContain('gray-100');
    });
});
