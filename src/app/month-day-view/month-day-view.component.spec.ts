import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MonthDayViewComponent } from './month-day-view.component';

describe('MonthDayViewComponent', () => {
  let component: MonthDayViewComponent;
  let fixture: ComponentFixture<MonthDayViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ MonthDayViewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MonthDayViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
