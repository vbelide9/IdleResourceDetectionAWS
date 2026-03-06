import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, forkJoin, of, throwError } from 'rxjs';
import { catchError, map, finalize } from 'rxjs/operators';
import { Resource } from '../models/resource.model';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class ResourceService {
    private resourcesSubject = new BehaviorSubject<Resource[]>([]);
    public resources$ = this.resourcesSubject.asObservable();

    private loadingSubject = new BehaviorSubject<boolean>(true);
    public loading$ = this.loadingSubject.asObservable();

    private errorsSubject = new BehaviorSubject<{ account: string, error: string }[]>([]);
    public errors$ = this.errorsSubject.asObservable();

    constructor(private http: HttpClient) { }

    public fetchAllResources(): void {
        this.loadingSubject.next(true);

        // Filter out endpoints that are effectively empty strings
        const accountEntries = Object.entries(environment.accounts).filter(([_, url]) => !!url);

        if (accountEntries.length === 0) {
            this.resourcesSubject.next([]);
            this.errorsSubject.next([]);
            this.loadingSubject.next(false);
            return;
        }

        // Create an array of HTTP requests, one for each account endpoint
        const requests: Observable<Resource[]>[] = accountEntries.map(([accountName, url]) => {
            return this.http.get<{ body: string }>(url).pipe(
                map(response => {
                    // AWS API Gateway often returns JSON strings inside the body property
                    // Depending on the exact API Gateway integration, we might need to parse it
                    let data: any = response;
                    if (response && response.body && typeof response.body === 'string') {
                        try {
                            data = JSON.parse(response.body);
                        } catch (e) {
                            console.error(`Failed to parse body from ${accountName}`, e);
                        }
                    }

                    const mapItems = (items: any[]) => {
                        return items.map((item: any) => {
                            // Deduce project and env from AccountName if missing
                            let project = item.project;
                            let env = item.env || item.region;
                            if (!project || !env) {
                                const parts = accountName.split('-');
                                if (parts.length >= 3) {
                                    project = `${parts[0]}-${parts[1]}`;
                                    env = parts[2];
                                } else {
                                    project = accountName;
                                    env = item.region || 'Unknown';
                                }
                            }

                            return {
                                ...item,
                                accountLabel: accountName,
                                type: item.type || item.service || 'Unknown',
                                days_idle: item.days_idle !== undefined ? item.days_idle : (item.idle_days || 0),
                                reason: item.reason || item.idle_reason || 'Unknown',
                                project: project,
                                env: env,
                                // ensure these exist for sorting/filtering
                                region: item.region || env
                            };
                        });
                    };

                    // Ensure we return an array
                    if (Array.isArray(data)) {
                        return mapItems(data);
                    } else if (data && data.items && Array.isArray(data.items)) {
                        return mapItems(data.items);
                    } else if (data && typeof data === 'object') {
                        // If it's a single object that isn't an array, wrap it, but it's likely an error format
                        console.warn(`Unexpected data format from ${accountName}:`, data);
                        return [];
                    }
                    return [];
                }),
                catchError(error => {
                    console.error(`Error fetching resources for account ${accountName} from ${url}:`, error);

                    // Add to our errors stream so the UI can display a warning
                    const currentErrors = this.errorsSubject.value;
                    this.errorsSubject.next([...currentErrors, {
                        account: accountName,
                        error: error.message || 'Unknown network error'
                    }]);

                    // Return empty array so forkJoin doesn't completely fail
                    return of([]);
                })
            );
        });

        // Execute all requests in parallel
        forkJoin(requests).pipe(
            map(resultsArray => {
                // Flatten the array of arrays into a single array of resources
                const allItems = resultsArray.reduce((acc, curr) => acc.concat(curr), []);

                // Deduplicate by resource_id to keep only the latest scan
                const uniqueMap = new Map<string, Resource>();

                allItems.forEach(item => {
                    const id = item.ResourceId || item.resource_id || item.resource_name || item.sk;
                    if (!id) return;

                    if (!uniqueMap.has(id)) {
                        uniqueMap.set(id, item);
                    } else {
                        const existing = uniqueMap.get(id)!;
                        // Determine which is newer
                        const existingTs = existing.scan_ts ? new Date(existing.scan_ts).getTime() : 0;
                        const newTs = item.scan_ts ? new Date(item.scan_ts).getTime() : 0;

                        if (newTs > existingTs) {
                            uniqueMap.set(id, item);
                        }
                    }
                });

                return Array.from(uniqueMap.values());
            }),
            finalize(() => {
                this.loadingSubject.next(false);
            })
        ).subscribe({
            next: (allResources) => {
                this.resourcesSubject.next(allResources);
            },
            error: (err) => {
                console.error('Critical error in fetchAllResources forkJoin:', err);
                this.resourcesSubject.next([]);
            }
        });
    }

    public addManualCertificate(certPayload: any): Observable<any> {
        // Assuming we want to post this to the first available API endpoint, 
        // or a specific central endpoint. Let's find one.
        // Filter out endpoints that are empty strings
        const accountEntries = Object.entries(environment.accounts).filter(([_, url]) => !!url);

        if (accountEntries.length === 0) {
            return throwError(() => new Error("No endpoints configured in environment."));
        }

        // Use the endpoint that matches the selected project/env if possible,
        // otherwise fallback to the first available endpoint.
        const targetAccountName = `${certPayload.project}-${certPayload.env}`;
        let targetUrl = environment.accounts[targetAccountName as keyof typeof environment.accounts];

        if (!targetUrl) {
            console.warn(`No exact endpoint match for ${targetAccountName}, falling back to ${accountEntries[0][0]}`);
            targetUrl = accountEntries[0][1];
        }

        // The expected payload format for the API POST
        const apiPayload = {
            resource_name: certPayload.resource_name,
            project: certPayload.project,
            env: certPayload.env,
            acm_expiration_date: certPayload.acm_expiration_date,
            notes: certPayload.notes || 'Manually Tracked'
        };

        return this.http.post(targetUrl, apiPayload).pipe(
            map(response => {
                return { success: true, response };
            }),
            catchError(error => {
                console.error("Error adding manual certificate:", error);
                return throwError(() => error);
            })
        );
    }
}
