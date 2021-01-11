import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {StartDialogComponent} from './start-dialog.component'
import {MatFormFieldModule} from '@angular/material/form-field'
import {MatInputModule} from '@angular/material/input'
import {MatButtonModule} from '@angular/material/button'
import {FormsModule} from '@angular/forms'


@NgModule({
  declarations: [StartDialogComponent],
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    FormsModule,
  ],
})
export class StartDialogModule {
}
