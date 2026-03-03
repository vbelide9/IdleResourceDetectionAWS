import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ResourceService } from '../services/resource.service';

@Component({
    selector: 'app-admin-portal',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './admin-portal.component.html'
})
export class AdminPortalComponent {

    // Form Model
    newCert = {
        domainName: '',
        vendor: '',
        expirationDate: '',
        renewalDate: '',
        project: 'ICS-ES',
        env: 'dev',
        notes: ''
    };

    isSubmitting = false;
    successMessage = '';
    errorMessage = '';

    constructor(private resourceService: ResourceService) { }

    onSubmit() {
        this.successMessage = '';
        this.errorMessage = '';

        if (!this.newCert.domainName || !this.newCert.expirationDate) {
            this.errorMessage = 'Domain Name and Expiration Date are required.';
            return;
        }

        this.isSubmitting = true;

        // Compile payload
        const payload = {
            resource_name: this.newCert.domainName,
            vendor: this.newCert.vendor,
            acm_expiration_date: new Date(this.newCert.expirationDate).toISOString(),
            renewal_date: this.newCert.renewalDate ? new Date(this.newCert.renewalDate).toISOString() : undefined,
            project: this.newCert.project,
            env: this.newCert.env,
            notes: this.newCert.notes
        };

        // Send to service (which currently mocks the db write, but will eventually hit the API)
        this.resourceService.addManualCertificate(payload).subscribe({
            next: () => {
                this.isSubmitting = false;
                this.successMessage = `Certificate for ${this.newCert.domainName} added successfully!`;

                // Reset form
                this.newCert = {
                    domainName: '',
                    vendor: '',
                    expirationDate: '',
                    renewalDate: '',
                    project: 'ICS-ES',
                    env: 'dev',
                    notes: ''
                };

                // Clear success message after 3 seconds
                setTimeout(() => this.successMessage = '', 3000);
            },
            error: (err) => {
                this.isSubmitting = false;
                this.errorMessage = 'Failed to add certificate. Please try again.';
                console.error(err);
            }
        });
    }
}
