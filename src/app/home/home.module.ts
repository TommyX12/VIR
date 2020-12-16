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

@NgModule({
  declarations: [HomeComponent],
  imports: [
    CommonModule, SharedModule, HomeRoutingModule, MatButtonModule,
    MatToolbarModule, MatIconModule, MatSlideToggleModule, MatSidenavModule,
    MatTabsModule, ItemsModule,
    MatTooltipModule,
  ],
})
export class HomeModule {
}
