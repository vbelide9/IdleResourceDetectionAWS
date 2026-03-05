import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartsComponent } from '../../../app/components/charts/charts.component';
import { Resource } from '../../../app/models/resource.model';
import { SimpleChange } from '@angular/core';

describe('ChartsComponent', () => {
    let component: ChartsComponent;
    let fixture: ComponentFixture<ChartsComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', resource_name: 'test-db', type: 'RDS', reason: '', status: '', env: 'prd', days_idle: 10 },
        { pk: '2', sk: '2', resource_name: 'web-server', type: 'EC2', reason: '', status: '', env: 'dev', days_idle: 45 },
        { pk: '3', sk: '3', resource_name: 'cache', type: 'ElastiCache', reason: '', status: '', env: 'dev', days_idle: 20 },
        { pk: '4', sk: '4', resource_name: 'node', type: 'EC2', reason: '', status: '', days_idle: 20 } // no env
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ChartsComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(ChartsComponent);
        component = fixture.componentInstance;
        component.data = [...mockData];
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should update charts data when populated inputs are received', () => {
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        expect(component.isDataReady).toBe(true);

        // Expect pie chart labels to include RDS, EC2, ElastiCache
        expect(component.pieChartData.labels).toContain('RDS');
        expect(component.pieChartData.labels).toContain('EC2');
        expect(component.pieChartData.labels).toContain('ElastiCache');

        // EC2 has 2 occurrences
        const ec2Index = component.pieChartData.labels?.indexOf('EC2') ?? -1;
        expect((component.pieChartData.datasets[0].data as number[])[ec2Index]).toBe(2);

        // Env check (dev should have 2, prd 1, unknown 1)
        expect(component.barChartData.labels).toContain('DEV');
        expect(component.barChartData.labels).toContain('PRD');
        expect(component.barChartData.labels).toContain('UNKNOWN');

        const unknownIndex = component.barChartData.labels?.indexOf('UNKNOWN') ?? -1;
        expect((component.barChartData.datasets[0].data as number[])[unknownIndex]).toBe(1);
    });

    it('should not throw error if data is empty', () => {
        component.data = [];
        component.ngOnChanges({ data: new SimpleChange(null, component.data, true) });

        expect(component.isDataReady).toBe(false);
    });

    it('should update chart custom tooltip properly in pie chart options', () => {
        const tooltipCb = component.pieChartOptions.plugins.tooltip.callbacks.label;
        expect(tooltipCb({ parsed: 42 })).toContain('42 resources');
    });

    it('should update chart custom tooltip properly in bar chart options', () => {
        const tooltipCb = component.barChartOptions.plugins.tooltip.callbacks.label;
        expect(tooltipCb({ parsed: { y: 42 } })).toContain('42 resources');
    });
});
