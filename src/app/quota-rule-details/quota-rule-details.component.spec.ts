import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotaRuleDetailsComponent } from './quota-rule-details.component';

describe('QuotaRuleDetailsComponent', () => {
  let component: QuotaRuleDetailsComponent;
  let fixture: ComponentFixture<QuotaRuleDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ QuotaRuleDetailsComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(QuotaRuleDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
