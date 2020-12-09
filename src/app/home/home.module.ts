import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'

import {HomeRoutingModule} from './home-routing.module'

import {HomeComponent} from './home.component'
import {SharedModule} from '../shared/shared.module'

import {MatSidenavModule} from '@angular/material/sidenav'
import {MatButtonModule} from '@angular/material/button'
import {MatIconModule} from '@angular/material/icon'
import {MatToolbarModule} from '@angular/material/toolbar'
import {MatSlideToggleModule} from '@angular/material/slide-toggle'

@NgModule({
  declarations: [HomeComponent],
  imports: [CommonModule, SharedModule, HomeRoutingModule, MatButtonModule,
    MatToolbarModule, MatIconModule, MatSlideToggleModule, MatSidenavModule],
})
export class HomeModule {
}
