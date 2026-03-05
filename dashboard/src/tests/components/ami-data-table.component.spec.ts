import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AmiDataTableComponent } from '../../app/components/ami-data-table.component';
import { Resource } from '../../app/models/resource.model';
import { vi } from 'vitest';

describe('AmiDataTableComponent', () => {
    let component: AmiDataTableComponent;
    let fixture: ComponentFixture<AmiDataTableComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', reason: '', status: '', resource_name: 'test-api', ami_id: 'ami-123', ami_name: 'amzn-linux', region: 'us-east-1', ami_age_days: 10, instance_state: 'running', env: 'dev', type: 'EC2', days_idle: 0 },
        { pk: '2', sk: '2', reason: '', status: '', resource_name: 'worker-node', ami_id: 'ami-456', ami_name: 'ubuntu', region: 'us-west-2', ami_age_days: 40, instance_state: 'stopped', env: 'prd', type: 'EC2', days_idle: 30 },
        { pk: '3', sk: '3', reason: '', status: '', resource_name: 'bastion', ami_id: 'ami-789', ami_name: 'amzn-base', region: 'eu-west-1', ami_age_days: 120, instance_state: 'running', env: 'tst', type: 'EC2', days_idle: 0 }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [AmiDataTableComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(AmiDataTableComponent);
        component = fixture.componentInstance;
        component.data = [...mockData];
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize filteredData and displayedRows on changes', () => {
        component.ngOnChanges();
        expect(component.filteredData.length).toBe(3);
        expect(component.displayedRows.length).toBe(3);
        expect(component.totalPages).toBe(1);
    });

    it('should filter by search term', () => {
        component.onSearchChange({ target: { value: 'api' } });
        expect(component.filteredData.length).toBe(1);
        expect(component.filteredData[0].resource_name).toBe('test-api');
    });

    it('should filter by old AMIs (>= 30 days)', () => {
        component.setAgeFilter('OLD');
        expect(component.showOldAmisOnly).toBe(true);
        expect(component.filteredData.length).toBe(2);
        expect(component.filteredData.every(item => (item.ami_age_days || 0) >= 30)).toBe(true);
    });

    it('should filter by instance status', () => {
        component.setStatusFilter('STOPPED');
        expect(component.filteredData.length).toBe(1);
        expect(component.filteredData[0].instance_state).toBe('stopped');
    });

    it('should sort data ascending and descending', () => {
        // First click sets asc
        component.sortData('ami_age_days');
        expect(component.sortColumn).toBe('ami_age_days');
        expect(component.sortDirection).toBe('asc');
        expect(component.filteredData[0].ami_age_days).toBe(10);
        expect(component.filteredData[2].ami_age_days).toBe(120);

        // Second click sets desc
        component.sortData('ami_age_days');
        expect(component.sortDirection).toBe('desc');
        expect(component.filteredData[0].ami_age_days).toBe(120);
    });

    it('should sort strings correctly', () => {
        component.sortData('resource_name');
        expect(component.filteredData[0].resource_name).toBe('bastion');
        expect(component.filteredData[2].resource_name).toBe('worker-node');
    });

    it('should handle pagination', () => {
        const largeData: Resource[] = Array.from({ length: 35 }, (_, i) => ({ ...mockData[0], pk: `${i}`, resource_name: `node${i}` }));
        component.data = largeData;
        component.itemsPerPage = 10;
        component.ngOnChanges();

        expect(component.totalPages).toBe(4);
        expect(component.displayedRows.length).toBe(10);

        component.nextPage();
        expect(component.currentPage).toBe(2);

        // Can't go beyond total pages (testing edge cases)
        component.currentPage = 4;
        component.nextPage();
        expect(component.currentPage).toBe(4);

        component.prevPage();
        expect(component.currentPage).toBe(3);

        component.currentPage = 1;
        component.prevPage();
        expect(component.currentPage).toBe(1);
    });

    it('should return correct badge color classes', () => {
        expect(component.getAccountBadge('dev')).toContain('blue-500');
        expect(component.getAccountBadge('tst')).toContain('amber-500');
        expect(component.getAccountBadge('prd')).toContain('rose-500');
        expect(component.getAccountBadge(undefined)).toContain('slate-700');
    });

    it('should trigger CSV export without errors', () => {
        const spyCreateObj = vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:test');

        // Mocking HTML anchor element methods
        const mockLink = {
            setAttribute: vi.fn(),
            click: vi.fn()
        };
        const spyCreateElement = vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
        const spyAppend = vi.spyOn(document.body, 'appendChild').mockImplementation(() => null as any);
        const spyRemove = vi.spyOn(document.body, 'removeChild').mockImplementation(() => null as any);

        component.filteredData = mockData;
        component.exportToCsv();

        expect(spyCreateObj).toHaveBeenCalled();
        expect(spyCreateElement).toHaveBeenCalledWith('a');
        expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:test');
        expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'ami_details_export.csv');
        expect(spyAppend).toHaveBeenCalled();
        expect(mockLink.click).toHaveBeenCalled();
        expect(spyRemove).toHaveBeenCalled();

        spyCreateObj.mockRestore();
        spyCreateElement.mockRestore();
        spyAppend.mockRestore();
        spyRemove.mockRestore();
    });
});
