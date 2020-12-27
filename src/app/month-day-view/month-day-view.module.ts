import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {MonthDayViewComponent} from './month-day-view.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatMenuModule} from '@angular/material/menu'
import {SessionDetailsModule} from '../session-details/session-details.module'


@NgModule({
  declarations: [MonthDayViewComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    SessionDetailsModule,
  ],
  exports: [MonthDayViewComponent],
})
export class MonthDayViewModule {
}
