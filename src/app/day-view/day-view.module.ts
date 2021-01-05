import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {DayViewComponent} from './day-view.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatMenuModule} from '@angular/material/menu'
import {MatTooltipModule} from '@angular/material/tooltip'
import {SessionDetailsModule} from '../session-details/session-details.module'
import {SharedModule} from '../shared/shared.module'
import {MatSnackBarModule} from '@angular/material/snack-bar'


@NgModule({
  declarations: [DayViewComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    SessionDetailsModule,
    SharedModule,
    MatTooltipModule,
    MatSnackBarModule,
  ],
  exports: [DayViewComponent],
})
export class DayViewModule {
}
