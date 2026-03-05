import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DataTableComponent } from './data-table.component';
import { Resource } from '../models/resource.model';

describe('DataTableComponent', () => {
    let component: DataTableComponent;
    let fixture: ComponentFixture<DataTableComponent>;

    const mockData: Resource[] = [
        { pk: '1', sk: '1', resource_name: 'test-db', type: 'RDS', reason: 'High CPU', status: 'Active', region: 'us-east-1', env: 'prd', days_idle: 10 },
        { pk: '2', sk: '2', resource_name: 'web-server', type: 'EC2', reason: 'No traffic', status: 'Stopped', region: 'us-west-2', env: 'dev', days_idle: 45 },
        { pk: '3', sk: '3', resource_name: 'cache', type: 'ElastiCache', reason: 'Unused', status: 'Active', region: 'eu-west-1', env: 'tst', days_idle: 20 }
    ];

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [DataTableComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(DataTableComponent);
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

    it('should filter data based on search term', () => {
        component.onSearchChange({ target: { value: 'server' } });
        expect(component.filteredData.length).toBe(1);
        expect(component.filteredData[0].resource_name).toBe('web-server');

        component.onSearchChange({ target: { value: 'us-east' } });
        expect(component.filteredData.length).toBe(1);
        expect(component.filteredData[0].region).toBe('us-east-1');
    });

    it('should handle sorting logic ascending and descending', () => {
        // default uses data order when no sortColumn is set
        component.sortData('resource_name');
        expect(component.sortColumn).toBe('resource_name');
        expect(component.sortDirection).toBe('asc');
        expect(component.filteredData[0].resource_name).toBe('cache'); // c < t < w

        component.sortData('resource_name');
        expect(component.sortDirection).toBe('desc');
        expect(component.filteredData[0].resource_name).toBe('web-server');
    });

    it('should handle undefined values during sorting', () => {
        const trickyData = [
            ...mockData,
            { pk: '4', sk: '4', type: 'EBS', reason: '', status: '', days_idle: 0 } // missing resource_name
        ];
        component.data = trickyData;
        component.ngOnChanges();

        component.sortData('resource_name'); // asc
        expect(component.filteredData[0].pk).toBe('4'); // undefined goes first
    });

    it('should calculate pagination correctly', () => {
        const largeData = Array.from({ length: 25 }, (_, i) => ({ ...mockData[0], pk: `${i}`, resource_name: `node${i}` }));
        component.data = largeData;
        component.itemsPerPage = 10;
        component.ngOnChanges();

        expect(component.totalPages).toBe(3);
        expect(component.displayedRows.length).toBe(10);

        component.nextPage();
        expect(component.currentPage).toBe(2);

        component.nextPage();
        component.nextPage(); // Should not go past page 3
        expect(component.currentPage).toBe(3);
        expect(component.displayedRows.length).toBe(5); // Last page has 5 items

        component.prevPage();
        expect(component.currentPage).toBe(2);

        component.currentPage = 1;
        component.prevPage(); // Should not go below page 1
        expect(component.currentPage).toBe(1);
    });

    it('should get correct badge colors for types', () => {
        expect(component.getBadgeColors('EC2')).toContain('amber-500');
        expect(component.getBadgeColors('RDS')).toContain('emerald-500');
        expect(component.getBadgeColors('OpenSearch')).toContain('emerald-500');
        expect(component.getBadgeColors('EBS')).toContain('blue-500');
        expect(component.getBadgeColors('ELB')).toContain('purple-500');
        expect(component.getBadgeColors('EFS')).toContain('rose-500');
        expect(component.getBadgeColors('NAT')).toContain('cyan-500');
        expect(component.getBadgeColors('UnknownType')).toContain('slate-500');
    });

    it('should get correct account badges', () => {
        expect(component.getAccountBadge('dev')).toContain('blue-500');
        expect(component.getAccountBadge('tst')).toContain('amber-500');
        expect(component.getAccountBadge('prd')).toContain('rose-500');
        expect(component.getAccountBadge(undefined)).toContain('slate-700');
    });
});
