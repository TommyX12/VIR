import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {ItemComponent} from './item.component'
import {MatIconModule} from '@angular/material/icon'
import {MatButtonModule} from '@angular/material/button'
import {SessionChipModule} from '../session-chip/session-chip.module'
import {MatCheckboxModule} from '@angular/material/checkbox'
import {FormsModule} from '@angular/forms'
import {SharedModule} from '../shared/shared.module'


@NgModule({
  declarations: [ItemComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    SessionChipModule,
    MatCheckboxModule,
    FormsModule,
    SharedModule,
  ],
  exports: [ItemComponent],
})
export class ItemModule {
}
