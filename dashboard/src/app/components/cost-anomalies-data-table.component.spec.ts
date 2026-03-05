import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CostAnomaliesDataTableComponent } from './cost-anomalies-data-table.component';
import { Resource } from '../models/resource.model';
import { SimpleChange } from '@angular/core';

describe('CostAnomaliesDataTableComponent', () => {
    let component: CostAnomaliesDataTableComponent;
    let fixture: ComponentFixture<CostAnomaliesDataTableComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', type: 'EC2', reason: '', status: '', resource_name: 'test-api', anomaly_details: '{"TotalImpact": 50}', days_idle: 0 },
        { pk: '2', sk: '2', type: 'RDS', reason: '', status: '', resource_name: 'db-node', anomaly_details: '{"TotalImpact": 1500}', days_idle: 0 },
        { pk: '3', sk: '3', type: 'EBS', reason: '', status: '', resource_name: 'storage', anomaly_details: '{"TotalImpact": 500}', days_idle: 0 }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CostAnomaliesDataTableComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(CostAnomaliesDataTableComponent);
        component = fixture.componentInstance;
        component.data = [...mockData];
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should parse anomaly_details and populate sortedData on changes', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });
        expect(component.sortedData.length).toBe(3);

        // it parses the JSON
        expect(component.sortedData[0].parsedAnomaly.TotalImpact).toBe(1500);
        expect(component.sortedData[1].parsedAnomaly.TotalImpact).toBe(500);
        expect(component.sortedData[2].parsedAnomaly.TotalImpact).toBe(50);
    });

    it('should handle missing anomaly_details gracefully', () => {
        const trickyData = [
            ...mockData,
            { pk: '4', sk: '4', type: 'EC2', reason: '', status: '', days_idle: 0 }
        ];
        component.data = trickyData;
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        const trickyItem = component.sortedData.find(item => item.pk === '4');
        expect(trickyItem?.parsedAnomaly).toEqual({});
    });

    it('should handle invalid JSON in anomaly_details gracefully', () => {
        const trickyData = [
            { pk: '5', sk: '5', type: 'EC2', reason: '', status: '', days_idle: 0, anomaly_details: 'not-json' }
        ];
        component.data = trickyData;

        // Mock console.error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        const trickyItem = component.sortedData.find(item => item.pk === '5');
        expect(trickyItem?.parsedAnomaly).toEqual({});
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    it('should toggle row expansion', () => {
        expect(component.expandedRowId).toBeNull();

        component.toggleRow('row-1');
        expect(component.expandedRowId).toBe('row-1');

        // clicking same row closes it
        component.toggleRow('row-1');
        expect(component.expandedRowId).toBeNull();

        // clicking new row opens it
        component.toggleRow('row-2');
        expect(component.expandedRowId).toBe('row-2');
    });

    it('should sort data by impact by default (descending)', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        // Impact desc should be 1500, 500, 50
        expect(component.sortedData[0].parsedAnomaly.TotalImpact).toBe(1500);
        expect(component.sortedData[1].parsedAnomaly.TotalImpact).toBe(500);
        expect(component.sortedData[2].parsedAnomaly.TotalImpact).toBe(50);
    });

    it('should change sort column and toggle direction', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        // Sort by resource_name (defaults to desc first time choosing a new column in CostAnomalies)
        component.sortBy('resource_name');
        expect(component.sortColumn).toBe('resource_name');
        expect(component.sortDirection).toBe('desc');
        expect(component.sortedData[0].resource_name).toBe('test-api'); // test-api, storage, db-node

        // Sort again should be asc
        component.sortBy('resource_name');
        expect(component.sortDirection).toBe('asc');
        expect(component.sortedData[0].resource_name).toBe('db-node');
    });

    it('should sort strings with undefined values gracefully', () => {
        const trickyData = [
            ...mockData,
            { pk: '4', sk: '4', type: 'EC2', reason: '', status: '', days_idle: 0 } // missing resource_name
        ];
        component.data = trickyData;
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        component.sortBy('resource_name'); // sets to desc
        component.sortBy('resource_name'); // sets to asc

        expect(component.sortedData[0].pk).toBe('4'); // undefined goes first in asc mode
    });

    it('should return correct badge style for impact size', () => {
        expect(component.getImpactBadgeStyle(undefined)).toContain('bg-gray-100');
        expect(component.getImpactBadgeStyle(50)).toContain('bg-yellow-100');
        expect(component.getImpactBadgeStyle(150)).toContain('bg-orange-100');
        expect(component.getImpactBadgeStyle(1500)).toContain('bg-red-100');
    });

    it('should handle missing data', () => {
        component.data = null as any;
        // manually call ngOnChanges so prepareData & sortData try to run
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        // shouldn't throw error
        expect(component.sortedData).toEqual([]);
    });
});
