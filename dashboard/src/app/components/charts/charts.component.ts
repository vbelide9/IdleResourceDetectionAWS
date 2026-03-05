import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { Resource } from '../../models/resource.model';

@Component({
    selector: 'app-charts',
    standalone: true,
    imports: [CommonModule, BaseChartDirective],
    template: `
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 animate-fade-in-up">
      
      <!-- Waste by Service Chart -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm flex flex-col transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        <div class="flex flex-col space-y-1.5 p-6 pb-4">
            <h3 class="font-semibold leading-none tracking-tight">Idle Resources by Service</h3>
            <p class="text-sm text-muted-foreground mt-1">Distribution of flagged resources across AWS services</p>
        </div>
        <div class="p-6 pt-0 h-[250px] w-full flex justify-center relative">
          <canvas *ngIf="isDataReady" baseChart
            [data]="pieChartData"
            [options]="pieChartOptions"
            [type]="pieChartType">
          </canvas>
        </div>
      </div>

      <!-- Top Idle Resources by Account -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm flex flex-col transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        <div class="flex flex-col space-y-1.5 p-6 pb-4">
            <h3 class="font-semibold leading-none tracking-tight">Idle Resources by Environment</h3>
            <p class="text-sm text-muted-foreground mt-1">Count of idle resources per deployed environment</p>
        </div>
        <div class="p-6 pt-0 h-[250px] w-full">
          <canvas *ngIf="isDataReady" baseChart
            [data]="barChartData"
            [options]="barChartOptions"
            [type]="barChartType">
          </canvas>
        </div>
      </div>

    </div>
  `
})
export class ChartsComponent implements OnChanges {
    @Input() data: Resource[] = [];

    isDataReady = false;

    // Pie Chart (Resources by Service)
    public pieChartType: ChartType = 'doughnut';
    public pieChartData: ChartData<'doughnut', number[], string | string[]> = {
        labels: [],
        datasets: []
    };
    public pieChartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: {
            legend: {
                position: 'right',
                labels: {
                    color: '#71717a', // zinc-500 neutral for both themes
                    font: { family: "'Inter', sans-serif", size: 12, weight: 500 },
                    usePointStyle: true,
                    pointStyle: 'circle',
                    padding: 24
                }
            },
            tooltip: {
                backgroundColor: 'rgba(9, 9, 11, 0.95)',
                titleColor: '#fafafa',
                bodyColor: '#a1a1aa',
                borderColor: '#27272a',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: "'Inter', sans-serif", size: 13, weight: 600 },
                bodyFont: { family: "'Inter', sans-serif", size: 12 },
                callbacks: {
                    label: (context: any) => ` ${context.parsed} resources`
                }
            }
        }
    };

    // Bar Chart (Resources by Env)
    public barChartType: ChartType = 'bar';
    public barChartData: ChartData<'bar'> = {
        labels: [],
        datasets: []
    };
    public barChartOptions: any = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true,
                ticks: { color: '#71717a', stepSize: 1, font: { family: "'Inter', sans-serif", size: 12 } },
                border: { display: false },
                grid: { color: 'rgba(113, 113, 122, 0.1)', drawBorder: false, tickLength: 0 }
            },
            x: {
                ticks: { color: '#71717a', font: { family: "'Inter', sans-serif", size: 12 } },
                border: { display: false },
                grid: { display: false, drawBorder: false, tickLength: 0 }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(9, 9, 11, 0.95)',
                titleColor: '#fafafa',
                bodyColor: '#a1a1aa',
                borderColor: '#27272a',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 8,
                titleFont: { family: "'Inter', sans-serif", size: 13, weight: 600 },
                bodyFont: { family: "'Inter', sans-serif", size: 12 },
                callbacks: {
                    label: (context: any) => ` ${context.parsed.y} resources`
                }
            }
        }
    };

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['data'] && this.data) {
            this.updateCharts();
        }
    }

    private updateCharts(): void {
        if (this.data.length === 0) {
            this.isDataReady = false;
            return;
        }

        // 1. Process Resources by Service
        const countByService: Record<string, number> = {};
        const countByEnv: Record<string, number> = {};

        this.data.forEach(item => {
            // Aggregate for Pie Chart
            if (!countByService[item.type]) countByService[item.type] = 0;
            countByService[item.type] += 1;

            // Aggregate for Bar Chart
            const env = (item.env || 'unknown').toUpperCase();
            if (!countByEnv[env]) countByEnv[env] = 0;
            countByEnv[env] += 1;
        });

        const pieLabels = Object.keys(countByService);
        const pieValues = Object.values(countByService);

        this.pieChartData = {
            labels: pieLabels,
            datasets: [{
                data: pieValues,
                backgroundColor: [
                    '#f59e0b', // Amber (EC2)
                    '#10b981', // Emerald (RDS)
                    '#3b82f6', // Blue (EBS)
                    '#a855f7', // Purple (ELB)
                    '#f43f5e', // Rose (EFS)
                    '#06b6d4'  // Cyan (NAT)
                ],
                hoverBackgroundColor: [
                    '#fbbf24',
                    '#34d399',
                    '#60a5fa',
                    '#c084fc',
                    '#fb7185',
                    '#22d3ee'
                ],
                borderWidth: 0,
                hoverOffset: 6,
                borderRadius: 4
            }]
        };

        const barLabels = Object.keys(countByEnv);
        const barValues = Object.values(countByEnv);

        this.barChartData = {
            labels: barLabels,
            datasets: [{
                data: barValues,
                backgroundColor: 'rgba(161, 161, 170, 0.4)', // Neutral zinc-400 with opacity
                hoverBackgroundColor: 'rgba(113, 113, 122, 0.8)', // Darker zinc on hover
                borderRadius: 6,
                borderSkipped: false,
                barPercentage: 0.6
            }]
        };

        this.isDataReady = true;
    }
}
