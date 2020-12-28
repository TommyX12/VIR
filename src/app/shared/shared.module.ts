import {NgModule} from '@angular/core'
import {CommonModule} from '@angular/common'

import {TranslateModule} from '@ngx-translate/core'

import {PageNotFoundComponent} from './components/'
import {WebviewDirective} from './directives/'
import {FormsModule} from '@angular/forms'
import {DroptargetDirective} from './directives/droptarget.directive'

@NgModule({
  declarations: [PageNotFoundComponent, WebviewDirective, DroptargetDirective],
  imports: [CommonModule, TranslateModule, FormsModule],
  exports: [TranslateModule, WebviewDirective, FormsModule,
    DroptargetDirective],
})
export class SharedModule {
}
