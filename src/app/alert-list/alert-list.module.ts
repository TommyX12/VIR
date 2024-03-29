import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {AlertListComponent} from './alert-list.component'
import {MatTreeModule} from '@angular/material/tree'
import {MatIconModule} from '@angular/material/icon'
import {MatButtonModule} from '@angular/material/button'
import {ItemModule} from '../item/item.module'
import {MatDialogModule} from '@angular/material/dialog'
import {ItemDetailsModule} from '../item-details/item-details.module'
import {MatTooltipModule} from '@angular/material/tooltip'
import {MatInputModule} from '@angular/material/input'
import {MatSlideToggleModule} from '@angular/material/slide-toggle'
import {MatDividerModule} from '@angular/material/divider'
import {FormsModule} from '@angular/forms'
import {DragDropModule} from '@angular/cdk/drag-drop'
import {ScrollingModule} from '@angular/cdk/scrolling'
import {MatButtonToggleModule} from '@angular/material/button-toggle'
import {QuotaRuleModule} from '../quota-rule/quota-rule.module'
import {QuotaRuleDetailsModule} from '../quota-rule-details/quota-rule-details.module'
import {MatMenuModule} from '@angular/material/menu'

@NgModule({
  declarations: [AlertListComponent],
  imports: [
    CommonModule,
    MatTreeModule,
    MatIconModule,
    MatButtonModule,
    MatDialogModule,
    ItemDetailsModule,
    ItemModule,
    MatTooltipModule,
    MatInputModule,
    MatSlideToggleModule,
    MatDividerModule,
    FormsModule,
    DragDropModule,
    ScrollingModule,
    MatButtonToggleModule,
    QuotaRuleModule,
    QuotaRuleDetailsModule,
    MatMenuModule,
  ],
  exports: [
    AlertListComponent,
  ],
})
export class AlertListModule {
}
