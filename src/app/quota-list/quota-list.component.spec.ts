import {ComponentFixture, TestBed} from '@angular/core/testing'

import {QuotaListComponent} from './quota-list.component'

describe('QuotaListComponent', () => {
  let component: QuotaListComponent
  let fixture: ComponentFixture<QuotaListComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [QuotaListComponent],
    })
      .compileComponents()
  })

  beforeEach(() => {
    fixture = TestBed.createComponent(QuotaListComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
