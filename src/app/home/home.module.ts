import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'

import {HomeRoutingModule} from './home-routing.module'

import {HomeComponent} from './home.component'
import {SharedModule} from '../shared/shared.module'

import {ItemsModule} from '../items/items.module'

import {MatSidenavModule} from '@angular/material/sidenav'
import {MatTabsModule} from '@angular/material/tabs'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatToolbarModule} from '@angular/material/toolbar'
import {MatSlideToggleModule} from '@angular/material/slide-toggle'
import {MatTooltipModule} from '@angular/material/tooltip'
import {TimelineModule} from '../timeline/timeline.module'
import {DayViewModule} from '../day-view/day-view.module'
import {MatFormFieldModule} from '@angular/material/form-field'
import {MatDatepickerModule} from '@angular/material/datepicker'
import {MatInputModule} from '@angular/material/input'
import {QueueModule} from '../queue/queue.module'
import {QuotaListModule} from '../quota-list/quota-list.module'
import {MatDividerModule} from '@angular/material/divider'
import {SettingsDialogModule} from '../settings-dialog/settings-dialog.module'
import {StartDialogModule} from '../start-dialog/start-dialog.module'
import {AlertListModule} from '../alert-list/alert-list.module'
import {TimerModule} from '../timer/timer.module'

@NgModule({
  declarations: [HomeComponent],
  imports: [
    CommonModule, SharedModule, HomeRoutingModule, MatButtonModule,
    MatToolbarModule, MatIconModule, MatSlideToggleModule, MatSidenavModule,
    MatTabsModule, ItemsModule,
    MatTooltipModule, TimelineModule, DayViewModule, MatFormFieldModule,
    MatDatepickerModule, MatInputModule, QueueModule, QuotaListModule,
    MatDividerModule, SettingsDialogModule, StartDialogModule, AlertListModule,
    TimerModule,
  ],
})
export class HomeModule {
}
