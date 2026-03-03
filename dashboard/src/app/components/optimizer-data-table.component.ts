import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Resource } from '../models/resource.model';

@Component({
    selector: 'app-optimizer-data-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './optimizer-data-table.component.html'
})
export class OptimizerDataTableComponent implements OnChanges {
    @Input() data: Resource[] = [];
    Math = Math;

    // Sorting state
    sortColumn: string = 'monthly_savings_opportunity';
    sortDirection: 'asc' | 'desc' = 'desc';

    sortedData: Resource[] = [];

    // Paginator logic if needed later, right now we display all
    pageSize = 10;
    currentPage = 1;

    get totalPages(): number {
        return Math.ceil(this.sortedData.length / this.pageSize);
    }

    get paginatedData(): Resource[] {
        const start = (this.currentPage - 1) * this.pageSize;
        return this.sortedData.slice(start, start + this.pageSize);
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data']) {
            this.currentPage = 1;
            this.sortData();
        }
    }

    sortBy(column: string) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
            if (column === 'monthly_savings_opportunity') this.sortDirection = 'desc';
        }
        this.sortData();
    }

    private sortData() {
        this.sortedData = [...this.data].sort((a, b) => {
            let valA: any = a[this.sortColumn as keyof Resource];
            let valB: any = b[this.sortColumn as keyof Resource];

            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    nextPage() {
        if (this.currentPage < this.totalPages) this.currentPage++;
    }

    prevPage() {
        if (this.currentPage > 1) this.currentPage--;
    }

    // Visual helper
    getBadgeClass(finding?: string): string {
        switch (finding) {
            case 'Overprovisioned': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800';
            case 'Underprovisioned': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border border-red-200 dark:border-red-800';
            case 'Optimized': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800';
            case 'Idle': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200 dark:border-orange-800';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700';
        }
    }
}
