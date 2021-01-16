import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {GotoItemComponent} from './goto-item.component'
import {MatIconModule} from '@angular/material/icon'
import {MatFormFieldModule} from '@angular/material/form-field'
import {FormsModule} from '@angular/forms'
import {MatInputModule} from '@angular/material/input'
import {MatButtonModule} from '@angular/material/button'
import {MatAutocompleteModule} from '@angular/material/autocomplete'


@NgModule({
  declarations: [GotoItemComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
    MatButtonModule,
    MatAutocompleteModule,
  ],
})
export class GotoItemModule {
}
