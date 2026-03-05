import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminPortalComponent } from '../../app/components/admin-portal.component';
import { ResourceService } from '../../app/services/resource.service';
import { of, throwError } from 'rxjs';

describe('AdminPortalComponent', () => {
    let component: AdminPortalComponent;
    let fixture: ComponentFixture<AdminPortalComponent>;
    let mockResourceService: any;

    beforeEach(async () => {
        mockResourceService = {
            addManualCertificate: vi.fn()
        };

        await TestBed.configureTestingModule({
            imports: [AdminPortalComponent],
            providers: [
                { provide: ResourceService, useValue: mockResourceService }
            ]
        }).compileComponents();

        fixture = TestBed.createComponent(AdminPortalComponent);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should not submit if required fields are missing', () => {
        component.newCert.domainName = '';
        component.onSubmit();

        expect(component.errorMessage).toContain('required');
        expect(component.isSubmitting).toBe(false);
        expect(mockResourceService.addManualCertificate).not.toHaveBeenCalled();
    });

    it('should submit successfully with required fields', async () => {
        mockResourceService.addManualCertificate.mockReturnValue(of({ success: true }));

        component.newCert = {
            domainName: 'test.com',
            vendor: 'AWS',
            expirationDate: '2025-01-01',
            renewalDate: '2024-12-01',
            project: 'TestProj',
            env: 'dev',
            notes: 'notes'
        };

        vi.useFakeTimers();

        component.onSubmit();

        expect(component.isSubmitting).toBe(false);
        expect(component.errorMessage).toBe('');
        expect(component.successMessage).toContain('added successfully!');

        // Form should be reset
        expect(component.newCert.domainName).toBe('');

        // Timers should clear message after 3000ms
        vi.advanceTimersByTime(3000);
        expect(component.successMessage).toBe('');

        vi.useRealTimers();
    });

    it('should handle service errors correctly', () => {
        mockResourceService.addManualCertificate.mockReturnValue(throwError(() => new Error('Server Error')));

        // Mock console.error
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });

        component.newCert = {
            domainName: 'test.com',
            vendor: 'AWS',
            expirationDate: '2025-01-01',
            renewalDate: '', // test omission
            project: 'TestProj',
            env: 'dev',
            notes: 'notes'
        };

        component.onSubmit();

        expect(component.isSubmitting).toBe(false);
        expect(component.errorMessage).toContain('Failed to add certificate');
        expect(consoleSpy).toHaveBeenCalled();

        consoleSpy.mockRestore();
    });
});
