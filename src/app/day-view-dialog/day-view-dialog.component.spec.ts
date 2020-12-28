import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DayViewDialogComponent } from './day-view-dialog.component';

describe('DayViewDialogComponent', () => {
  let component: DayViewDialogComponent;
  let fixture: ComponentFixture<DayViewDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DayViewDialogComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DayViewDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
