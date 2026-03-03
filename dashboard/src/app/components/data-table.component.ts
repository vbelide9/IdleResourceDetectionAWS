import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Resource } from '../models/resource.model';

@Component({
    selector: 'app-data-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './data-table.component.html'
})
export class DataTableComponent implements OnChanges {
    @Input() data: Resource[] = [];

    searchTerm: string = '';
    filteredData: Resource[] = [];

    // Pagination
    currentPage = 1;
    itemsPerPage = 15;
    totalPages = 1;
    displayedRows: Resource[] = [];

    // Sorting
    sortColumn: keyof Resource | '' = '';
    sortDirection: 'asc' | 'desc' = 'asc';

    ngOnChanges(): void {
        this.filterData();
    }

    onSearchChange(event: any): void {
        this.searchTerm = event.target.value.toLowerCase();
        this.currentPage = 1;
        this.filterData();
    }

    sortData(column: keyof Resource): void {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.filterData();
    }

    filterData(): void {
        let dataToFilter = [...this.data];

        if (this.searchTerm) {
            dataToFilter = dataToFilter.filter(item =>
                (item.resource_name?.toLowerCase() || '').includes(this.searchTerm) ||
                (item.type?.toLowerCase() || '').includes(this.searchTerm) ||
                (item.reason?.toLowerCase() || '').includes(this.searchTerm) ||
                (item.region?.toLowerCase() || '').includes(this.searchTerm)
            );
        }

        if (this.sortColumn) {
            dataToFilter.sort((a, b) => {
                let valA = a[this.sortColumn as keyof Resource];
                let valB = b[this.sortColumn as keyof Resource];

                if (valA === undefined) valA = '';
                if (valB === undefined) valB = '';

                if (typeof valA === 'string' && typeof valB === 'string') {
                    const comparison = valA.localeCompare(valB);
                    return this.sortDirection === 'asc' ? comparison : -comparison;
                }

                if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        this.filteredData = dataToFilter;
        this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage) || 1;
        this.updatePageData();
    }

    updatePageData(): void {
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const end = start + this.itemsPerPage;
        this.displayedRows = this.filteredData.slice(start, end);
    }

    nextPage(): void {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.updatePageData();
        }
    }

    prevPage(): void {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.updatePageData();
        }
    }

    getBadgeColors(type: string): string {
        const colors: Record<string, string> = {
            'EC2': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
            'RDS': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            'OpenSearch': 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
            'EBS': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
            'ELB': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
            'EFS': 'bg-rose-500/10 text-rose-500 border-rose-500/20',
            'NAT': 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20'
        };
        return colors[type] || 'bg-slate-500/10 text-slate-300 border-slate-500/20';
    }

    getAccountBadge(env: string | undefined): string {
        if (!env) return 'bg-slate-700/50 text-slate-300 border border-slate-600';
        const envLower = env.toLowerCase();
        if (envLower === 'dev') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        if (envLower === 'tst' || envLower === 'uat') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        if (envLower === 'pro' || envLower === 'prd') return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    }
}
