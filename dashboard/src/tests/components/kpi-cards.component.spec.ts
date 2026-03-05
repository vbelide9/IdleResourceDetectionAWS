import { ComponentFixture, TestBed } from '@angular/core/testing';
import { KpiCardsComponent } from '../../app/components/kpi-cards.component';

describe('KpiCardsComponent', () => {
    let component: KpiCardsComponent;
    let fixture: ComponentFixture<KpiCardsComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [KpiCardsComponent]
        }).compileComponents();

        fixture = TestBed.createComponent(KpiCardsComponent);
        component = fixture.componentInstance;

        component.totalResourcesFlagged = 150;
        component.averageIdleDuration = 45;
        component.idleOver14Days = 12;
        component.servicesAffected = 5;

        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should display inputs correctly', () => {
        const compiled = fixture.nativeElement as HTMLElement;
        const values = Array.from(compiled.querySelectorAll('.text-3xl')).map(el => el.textContent?.trim());

        expect(values).toContain('150');
        expect(values).toContain('45');
        expect(values).toContain('12');
        expect(values).toContain('5');
    });
});
