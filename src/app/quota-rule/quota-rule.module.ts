import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {QuotaRuleComponent} from './quota-rule.component'
import {SharedModule} from '../shared/shared.module'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {SessionChipModule} from '../session-chip/session-chip.module'


@NgModule({
  declarations: [QuotaRuleComponent],
  imports: [
    CommonModule,
    SharedModule,
    MatButtonModule,
    MatIconModule,
    SessionChipModule,
  ],
  exports: [
    QuotaRuleComponent,
  ],
})
export class QuotaRuleModule {
}
