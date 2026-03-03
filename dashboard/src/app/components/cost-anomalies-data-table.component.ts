import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Resource } from '../models/resource.model';

@Component({
    selector: 'app-cost-anomalies-data-table',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './cost-anomalies-data-table.component.html'
})
export class CostAnomaliesDataTableComponent implements OnChanges {
    @Input() data: Resource[] = [];

    // Sort by impact by default by using a custom sort logic on the parsed JSON if needed
    // or string fallback
    sortColumn: keyof Resource | 'impact' = 'impact';
    sortDirection: 'desc' | 'asc' = 'desc';

    sortedData: (Resource & { parsedAnomaly?: any })[] = [];
    expandedRowId: string | null = null;

    toggleRow(id: string) {
        this.expandedRowId = this.expandedRowId === id ? null : id;
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data']) {
            this.prepareData();
            this.sortData();
        }
    }

    private prepareData() {
        if (!this.data) return;
        this.sortedData = this.data.map(item => {
            let parsedAnomaly = {};
            if (item.anomaly_details) {
                try {
                    parsedAnomaly = JSON.parse(item.anomaly_details);
                } catch (e) {
                    console.error("Failed to parse anomaly_details", e);
                }
            }
            return { ...item, parsedAnomaly };
        });
    }

    sortBy(column: keyof Resource | 'impact') {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'desc'; // Default to desc for new columns like impact
        }
        this.sortData();
    }

    private sortData() {
        if (!this.sortedData) return;
        this.sortedData.sort((a, b) => {
            let valA: any = a[this.sortColumn as keyof Resource];
            let valB: any = b[this.sortColumn as keyof Resource];

            if (this.sortColumn === 'impact') {
                valA = a.parsedAnomaly?.TotalImpact || 0;
                valB = b.parsedAnomaly?.TotalImpact || 0;
            }

            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string') valA = valA.toLowerCase();
            if (typeof valB === 'string') valB = valB.toLowerCase();

            if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    getImpactBadgeStyle(impact: number | undefined): string {
        if (impact === undefined) return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
        if (impact > 1000) {
            return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800';
        } else if (impact > 100) {
            return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800';
        }
        return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800';
    }
}
