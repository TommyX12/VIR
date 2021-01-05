import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuotaRuleComponent } from './quota-rule.component';

describe('QuotaRuleComponent', () => {
  let component: QuotaRuleComponent;
  let fixture: ComponentFixture<QuotaRuleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ QuotaRuleComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(QuotaRuleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
