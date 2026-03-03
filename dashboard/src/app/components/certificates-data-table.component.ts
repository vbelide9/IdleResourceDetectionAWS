import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Resource } from '../models/resource.model';

@Component({
    selector: 'app-certificates-data-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './certificates-data-table.component.html'
})
export class CertificatesDataTableComponent implements OnChanges {
    @Input() data: Resource[] = [];

    sortColumn: keyof Resource | 'acm_expiration_days' = 'acm_expiration_days';
    sortDirection: 'asc' | 'desc' = 'asc';
    filterType: 'all' | 'acm' | 'manual' = 'all';

    sortedData: Resource[] = [];

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data']) {
            this.filterAndSortData();
        }
    }

    setFilter(type: 'all' | 'acm' | 'manual') {
        this.filterType = type;
        this.filterAndSortData();
    }

    sortBy(column: keyof Resource | 'acm_expiration_days') {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        this.filterAndSortData();
    }

    private filterAndSortData() {
        if (!this.data) return;

        let filtered = this.data;
        if (this.filterType === 'acm') {
            filtered = this.data.filter(item => item.type === 'ACM Certificate');
        } else if (this.filterType === 'manual') {
            filtered = this.data.filter(item => item.type === 'External Certificate');
        }

        this.sortedData = [...filtered].sort((a, b) => {
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

    getBadgeStyle(days: number | undefined): string {
        if (days === undefined) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        if (days < 7) {
            return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
        } else if (days < 14) {
            return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
        }
        return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
    }
}
