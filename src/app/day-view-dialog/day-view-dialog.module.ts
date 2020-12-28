import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {DayViewDialogComponent} from './day-view-dialog.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {DayViewModule} from '../day-view/day-view.module'


@NgModule({
  declarations: [DayViewDialogComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    DayViewModule,
  ],
  exports: [DayViewDialogComponent],
})
export class DayViewDialogModule {
}
