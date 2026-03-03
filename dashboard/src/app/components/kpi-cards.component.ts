import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-cards',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

      <!-- Total Resources Flagged -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 class="tracking-tight text-sm font-medium">Total Resources Flagged</h3>
            <svg class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        </div>
        <div class="p-6 pt-0">
            <div class="text-2xl font-bold">{{totalResourcesFlagged}}</div>
            <p class="text-xs text-muted-foreground mt-1">Identified across all accounts</p>
        </div>
      </div>

      <!-- Average Idle Duration -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 class="tracking-tight text-sm font-medium">Average Idle Duration</h3>
            <svg class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <div class="p-6 pt-0">
            <div class="text-2xl font-bold">{{averageIdleDuration}} <span class="text-sm font-normal text-muted-foreground">days</span></div>
            <p class="text-xs text-muted-foreground mt-1">Time without active usage</p>
        </div>
      </div>

      <!-- Idle 14+ Days -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1 hover:border-destructive/30">
        <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 class="tracking-tight text-sm font-medium">Idle 14+ Days</h3>
            <svg class="h-4 w-4 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <div class="p-6 pt-0">
            <div class="text-2xl font-bold text-destructive">{{idleOver14Days}}</div>
            <p class="text-xs text-muted-foreground mt-1">Requires immediate attention</p>
        </div>
      </div>

      <!-- Services Affected -->
      <div class="rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-1">
        <div class="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 class="tracking-tight text-sm font-medium">Services Affected</h3>
            <svg class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
        </div>
        <div class="p-6 pt-0">
            <div class="text-2xl font-bold">{{servicesAffected}}</div>
            <p class="text-xs text-muted-foreground mt-1">Distinct AWS resource types</p>
        </div>
      </div>

    </div>
  `
})
export class KpiCardsComponent {
  @Input() totalResourcesFlagged!: number;
  @Input() averageIdleDuration!: number;
  @Input() idleOver14Days!: number;
  @Input() servicesAffected!: number;
}
