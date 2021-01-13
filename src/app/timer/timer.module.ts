import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {TimerComponent} from './timer.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatTooltipModule} from '@angular/material/tooltip'


@NgModule({
  declarations: [TimerComponent],
  exports: [
    TimerComponent,
  ],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
})
export class TimerModule {
}
