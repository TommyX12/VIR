import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {QuickQuotaEditComponent} from './quick-quota-edit.component'
import {MatIconModule} from '@angular/material/icon'
import {MatFormFieldModule} from '@angular/material/form-field'
import {FormsModule} from '@angular/forms'
import {MatInputModule} from '@angular/material/input'
import {MatButtonModule} from '@angular/material/button'


@NgModule({
  declarations: [QuickQuotaEditComponent],
  imports: [
    CommonModule,
    MatIconModule,
    MatFormFieldModule,
    FormsModule,
    MatInputModule,
    MatButtonModule,
  ],
})
export class QuickQuotaEditModule {
}
