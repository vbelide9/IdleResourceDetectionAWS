import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ResourceService } from './resource.service';
import { Resource } from '../models/resource.model';
import { firstValueFrom } from 'rxjs';

describe('ResourceService', () => {
    let service: ResourceService;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [
                ResourceService,
                provideHttpClient(),
                provideHttpClientTesting()
            ]
        });
        service = TestBed.inject(ResourceService);
    });

    it('should be created', () => {
        expect(service).toBeTruthy();
    });

    it('should initialize with empty resources and true loading state', () => {
        let currentResources: Resource[] = [];
        let isLoading = false;

        const sub1 = service.resources$.subscribe(resources => {
            currentResources = resources;
        });

        const sub2 = service.loading$.subscribe(loading => {
            isLoading = loading;
        });

        expect(currentResources).toEqual([]);
        expect(isLoading).toBe(true);

        sub1.unsubscribe();
        sub2.unsubscribe();
    });

    it('fetchAllResources should populate resources after delay', async () => {
        let loadedResources: Resource[] = [];
        let isLoading = true;

        const sub1 = service.resources$.subscribe(res => loadedResources = res);
        const sub2 = service.loading$.subscribe(loading => isLoading = loading);

        service.fetchAllResources();

        expect(isLoading).toBe(true);
        expect(loadedResources.length).toBe(0);

        // wait for the 800ms timeout
        await new Promise(resolve => setTimeout(resolve, 850));

        expect(isLoading).toBe(false);
        expect(loadedResources.length).toBe(150); // The generator creates 150 items

        sub1.unsubscribe();
        sub2.unsubscribe();
    });

    it('addManualCertificate should prepend new resource', async () => {
        const payload = {
            resource_name: 'test.example.com',
            project: 'ICS-AEM',
            env: 'dev',
            acm_expiration_date: '2026-10-10T00:00:00.000Z',
            notes: 'Test note'
        };

        const resultPromise = firstValueFrom(service.addManualCertificate(payload));

        const result: any = await resultPromise;

        expect(result.success).toBe(true);
        expect(result.item.resource_name).toBe('test.example.com');
        expect(result.item.reason).toBe('Test note');

        // Check if it was added to the subject
        let currentResources: Resource[] = [];
        const sub = service.resources$.subscribe(res => currentResources = res);

        expect(currentResources[0]).toEqual(result.item);
        sub.unsubscribe();
    });

    it('addManualCertificate should use default reason if notes not provided', async () => {
        const payload = {
            resource_name: 'test.example.com',
            project: 'ICS-AEM',
            env: 'dev',
            acm_expiration_date: '2026-10-10T00:00:00.000Z'
        };

        const result: any = await firstValueFrom(service.addManualCertificate(payload));

        expect(result.success).toBe(true);
        expect(result.item.reason).toBe('Manually Tracked');
    });
});
