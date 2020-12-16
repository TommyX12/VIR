import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SessionChipComponent } from './session-chip.component';

describe('SessionChipComponent', () => {
  let component: SessionChipComponent;
  let fixture: ComponentFixture<SessionChipComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SessionChipComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SessionChipComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
