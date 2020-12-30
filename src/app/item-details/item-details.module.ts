import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {ItemDetailsComponent} from './item-details.component'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatInputModule} from '@angular/material/input'
import {MatFormFieldModule} from '@angular/material/form-field'
import {FormsModule, ReactiveFormsModule} from '@angular/forms'
import {ColorPickerModule} from 'ngx-color-picker'
import {MatCheckboxModule} from '@angular/material/checkbox'
import {MatAutocompleteModule} from '@angular/material/autocomplete'
import {MatTooltipModule} from '@angular/material/tooltip'
import {MatDatepickerModule} from '@angular/material/datepicker'
import {MatSelectModule} from '@angular/material/select'
import {MatButtonToggleModule} from '@angular/material/button-toggle'


@NgModule({
  declarations: [ItemDetailsComponent],
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    FormsModule,
    ColorPickerModule,
    MatCheckboxModule,
    MatAutocompleteModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatSelectModule,
    MatButtonToggleModule,
  ],
  entryComponents: [ItemDetailsComponent],
  exports: [ItemDetailsComponent],
})
export class ItemDetailsModule {
}
