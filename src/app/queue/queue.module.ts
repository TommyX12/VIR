import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'
import {QueueComponent} from './queue.component'
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
import {MatCheckboxModule} from '@angular/material/checkbox'

@NgModule({
  declarations: [QueueComponent],
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
    MatCheckboxModule,
  ],
  exports: [
    QueueComponent,
  ],
})
export class QueueModule {
}
