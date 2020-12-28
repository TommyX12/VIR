import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DayViewComponent } from './day-view.component';

describe('DayViewComponent', () => {
  let component: DayViewComponent;
  let fixture: ComponentFixture<DayViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ DayViewComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(DayViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
