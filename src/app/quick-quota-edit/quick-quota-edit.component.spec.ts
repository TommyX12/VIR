import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuickQuotaEditComponent } from './quick-quota-edit.component';

describe('QuickQuotaEditComponent', () => {
  let component: QuickQuotaEditComponent;
  let fixture: ComponentFixture<QuickQuotaEditComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ QuickQuotaEditComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(QuickQuotaEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
