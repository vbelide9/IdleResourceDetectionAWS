import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-kpi-cards',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

      <!-- Total Resources Flagged -->
      <div class="group relative bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in-up delay-1">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-muted-foreground">Total Flagged</h3>
            <div class="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"></path><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"></path></svg>
            </div>
        </div>
        <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-foreground">{{totalResourcesFlagged}}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1.5">Identified across all accounts</p>
        <div class="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
      </div>

      <!-- Average Idle Duration -->
      <div class="group relative bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in-up delay-2">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-muted-foreground">Avg Idle Duration</h3>
            <div class="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </div>
        </div>
        <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-foreground">{{averageIdleDuration}}</span>
            <span class="text-sm font-medium text-muted-foreground">days</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1.5">Time without active usage</p>
        <div class="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-500 to-yellow-400 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
      </div>

      <!-- Idle 14+ Days -->
      <div class="group relative bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in-up delay-3">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-muted-foreground">Idle 14+ Days</h3>
            <div class="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"></path><path d="M12 9v4"></path><path d="M12 17h.01"></path></svg>
            </div>
        </div>
        <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-foreground" [class.text-rose-500]="idleOver14Days > 0">{{idleOver14Days}}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1.5">Requires immediate attention</p>
        <div class="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-rose-500 to-pink-400 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
      </div>

      <!-- Services Affected -->
      <div class="group relative bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden animate-fade-in-up delay-4">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-medium text-muted-foreground">Services Affected</h3>
            <div class="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                <svg class="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="3" rx="1"></rect><rect width="7" height="7" x="14" y="14" rx="1"></rect><rect width="7" height="7" x="3" y="14" rx="1"></rect></svg>
            </div>
        </div>
        <div class="flex items-baseline gap-2">
            <span class="text-3xl font-bold tracking-tight text-foreground">{{servicesAffected}}</span>
        </div>
        <p class="text-xs text-muted-foreground mt-1.5">Distinct AWS resource types</p>
        <div class="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500 to-teal-400 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
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
