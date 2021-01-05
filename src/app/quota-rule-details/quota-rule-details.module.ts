import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {QuotaRuleDetailsComponent} from './quota-rule-details.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatInputModule} from '@angular/material/input'
import {MatFormFieldModule} from '@angular/material/form-field'
import {FormsModule, ReactiveFormsModule} from '@angular/forms'
import {MatCheckboxModule} from '@angular/material/checkbox'
import {MatAutocompleteModule} from '@angular/material/autocomplete'
import {MatTooltipModule} from '@angular/material/tooltip'
import {MatSelectModule} from '@angular/material/select'
import {MatDatepickerModule} from '@angular/material/datepicker'
import {MatButtonToggleModule} from '@angular/material/button-toggle'


@NgModule({
  declarations: [QuotaRuleDetailsComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonToggleModule,
  ],
  entryComponents: [QuotaRuleDetailsComponent],
  exports: [QuotaRuleDetailsComponent],
})
export class QuotaRuleDetailsModule {
}
