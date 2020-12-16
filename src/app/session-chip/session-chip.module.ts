import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {SessionChipComponent} from './session-chip.component'
import {MatIconModule} from '@angular/material/icon'


@NgModule({
  declarations: [SessionChipComponent],
  imports: [
    CommonModule,
    MatIconModule,
  ],
  exports: [
    SessionChipComponent,
  ],
})
export class SessionChipModule {
}
