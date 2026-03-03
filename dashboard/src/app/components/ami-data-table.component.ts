import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { Resource } from '../models/resource.model';

@Component({
    selector: 'app-ami-data-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './ami-data-table.component.html'
})
export class AmiDataTableComponent implements OnChanges {
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

    showOldAmisOnly: boolean = false;
    statusFilter: 'ALL' | 'RUNNING' | 'STOPPED' = 'ALL';

    setAgeFilter(value: string): void {
        this.showOldAmisOnly = (value === 'OLD');
        this.currentPage = 1;
        this.filterData();
    }

    setStatusFilter(status: 'ALL' | 'RUNNING' | 'STOPPED'): void {
        this.statusFilter = status;
        this.currentPage = 1;
        this.filterData();
    }

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
                (item.ami_id?.toLowerCase() || '').includes(this.searchTerm) ||
                (item.ami_name?.toLowerCase() || '').includes(this.searchTerm) ||
                (item.region?.toLowerCase() || '').includes(this.searchTerm)
            );
        }

        if (this.showOldAmisOnly) {
            dataToFilter = dataToFilter.filter(item => (item.ami_age_days || 0) >= 30);
        }

        if (this.statusFilter !== 'ALL') {
            dataToFilter = dataToFilter.filter(item =>
                (item.instance_state || '').toUpperCase() === this.statusFilter
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

    getAccountBadge(env: string | undefined): string {
        if (!env) return 'bg-slate-700/50 text-slate-300 border border-slate-600';
        const envLower = env.toLowerCase();
        if (envLower === 'dev') return 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
        if (envLower === 'tst' || envLower === 'uat') return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
        if (envLower === 'pro' || envLower === 'prd') return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
        return 'bg-slate-700/50 text-slate-300 border border-slate-600';
    }

    exportToCsv(): void {
        const headers = ['Resource Name', 'Environment', 'Status', 'AMI Name', 'AMI ID', 'AMI Age (Days)'];
        const csvRows = [headers.join(',')];

        for (const item of this.filteredData) {
            const row = [
                `"${item.resource_name || ''}"`,
                `"${item.env || ''}"`,
                `"${item.instance_state || ''}"`,
                `"${item.ami_name || ''}"`,
                `"${item.ami_id || ''}"`,
                `"${item.ami_age_days || 0}"`
            ];
            csvRows.push(row.join(','));
        }

        const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "ami_details_export.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}
