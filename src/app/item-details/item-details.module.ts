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
  ],
  entryComponents: [ItemDetailsComponent],
  exports: [ItemDetailsComponent],
})
export class ItemDetailsModule {
}
