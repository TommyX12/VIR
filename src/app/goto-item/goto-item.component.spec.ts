import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GotoItemComponent } from './goto-item.component';

describe('GotoItemComponent', () => {
  let component: GotoItemComponent;
  let fixture: ComponentFixture<GotoItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ GotoItemComponent ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(GotoItemComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
