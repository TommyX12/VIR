import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {TimelineComponent} from './timeline.component'
import {MatDividerModule} from '@angular/material/divider'
import {FormsModule} from '@angular/forms'
import {MatButtonToggleModule} from '@angular/material/button-toggle'
import {MatButtonModule} from '@angular/material/button'
import {MonthDayViewModule} from '../month-day-view/month-day-view.module'
import {MatIconModule} from '@angular/material/icon'
import {MatTooltipModule} from '@angular/material/tooltip'
import {MatDatepickerModule} from '@angular/material/datepicker'
import {MatFormFieldModule} from '@angular/material/form-field'
import {MatInputModule} from '@angular/material/input'
import {MatNativeDateModule} from '@angular/material/core'
import {MatSlideToggleModule} from '@angular/material/slide-toggle'
import {SessionChipModule} from '../session-chip/session-chip.module'


@NgModule({
  declarations: [TimelineComponent],
  imports: [
    CommonModule,
    MatDividerModule,
    FormsModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatTooltipModule,
    MonthDayViewModule,
    MatIconModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    SessionChipModule,
  ],
  exports: [TimelineComponent],
})
export class TimelineModule {
}
