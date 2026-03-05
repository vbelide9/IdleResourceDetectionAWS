import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CertificatesDataTableComponent } from '../../app/components/certificates-data-table.component';
import { Resource } from '../../app/models/resource.model';
import { SimpleChange } from '@angular/core';

describe('CertificatesDataTableComponent', () => {
    let component: CertificatesDataTableComponent;
    let fixture: ComponentFixture<CertificatesDataTableComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', resource_name: 'test-api.example.com', type: 'ACM Certificate', acm_expiration_days: 10, reason: '', status: '', env: 'dev', days_idle: 0 },
        { pk: '2', sk: '2', resource_name: 'internal.example.com', type: 'External Certificate', acm_expiration_days: 5, reason: '', status: '', env: 'prd', days_idle: 0 },
        { pk: '3', sk: '3', resource_name: 'legacy.example.com', type: 'ACM Certificate', acm_expiration_days: 30, reason: '', status: '', env: 'tst', days_idle: 0 }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CertificatesDataTableComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(CertificatesDataTableComponent);
        component = fixture.componentInstance;
        component.data = [...mockData];
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize and sort data on changes', () => {
        component.ngOnChanges({
            data: new SimpleChange(null, component.data, true)
        });
        expect(component.sortedData.length).toBe(3);
        // default sort is acm_expiration_days asc
        expect(component.sortedData[0].acm_expiration_days).toBe(5);
        expect(component.sortedData[2].acm_expiration_days).toBe(30);
    });

    it('should handle undefined data gracefully', () => {
        component.data = null as any;
        component.ngOnChanges({
            data: new SimpleChange(null, component.data, false)
        });
        // should just return early, sortedData remains unchanged from previous
        expect(component.sortedData.length).toBe(0);
    });

    it('should filter by ACM certificates', () => {
        component.data = [...mockData];
        component.setFilter('acm');
        expect(component.sortedData.length).toBe(2);
        expect(component.sortedData.every(item => item.type === 'ACM Certificate')).toBe(true);
    });

    it('should filter by Manual (External) certificates', () => {
        component.data = [...mockData];
        component.setFilter('manual');
        expect(component.sortedData.length).toBe(1);
        expect(component.sortedData[0].type).toBe('External Certificate');
    });

    it('should filter by ALL certificates', () => {
        component.data = [...mockData];
        component.setFilter('acm'); // set to something else first
        component.setFilter('all');
        expect(component.sortedData.length).toBe(3);
    });

    it('should sort data correctly ascending and descending', () => {
        component.data = [...mockData];
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        // default is asc acm_expiration_days. Let's switch to desc
        component.sortBy('acm_expiration_days');
        expect(component.sortDirection).toBe('desc');
        expect(component.sortedData[0].acm_expiration_days).toBe(30);

        // then back to asc
        component.sortBy('acm_expiration_days');
        expect(component.sortDirection).toBe('asc');
        expect(component.sortedData[0].acm_expiration_days).toBe(5);
    });

    it('should change sort column and reset to asc', () => {
        component.data = [...mockData];
        component.sortBy('resource_name');
        expect(component.sortColumn).toBe('resource_name');
        expect(component.sortDirection).toBe('asc');
        // 'internal' < 'legacy' < 'test-api'
        expect(component.sortedData[0].resource_name).toBe('internal.example.com');
        expect(component.sortedData[2].resource_name).toBe('test-api.example.com');
    });

    it('should handle undefined values during sort', () => {
        const trickyData = [
            ...mockData,
            { pk: '4', sk: '4', type: 'ACM Certificate', reason: '', status: '', days_idle: 0 } // missing resource_name and expiration days
        ];
        component.data = trickyData;
        component.sortBy('resource_name');

        // The one with missing resource_name (gets treated as '') should be first
        expect(component.sortedData[0].pk).toBe('4');
    });

    it('should return correct badge style for expiration days', () => {
        expect(component.getBadgeStyle(undefined)).toContain('bg-gray-100');
        expect(component.getBadgeStyle(5)).toContain('bg-red-100');
        expect(component.getBadgeStyle(10)).toContain('bg-orange-100');
        expect(component.getBadgeStyle(20)).toContain('bg-yellow-100');
    });
});
