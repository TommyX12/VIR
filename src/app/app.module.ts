import {BrowserModule} from '@angular/platform-browser'
import {BrowserAnimationsModule} from '@angular/platform-browser/animations'
import {NgModule} from '@angular/core'
import {FormsModule} from '@angular/forms'
import {HttpClient, HttpClientModule} from '@angular/common/http'
import {CoreModule} from './core/core.module'
import {SharedModule} from './shared/shared.module'

import {AppRoutingModule} from './app-routing.module'

// NG Translate
import {TranslateLoader, TranslateModule} from '@ngx-translate/core'
import {TranslateHttpLoader} from '@ngx-translate/http-loader'

import {HomeModule} from './home/home.module'
import {DetailModule} from './detail/detail.module'

import {AppComponent} from './app.component'
import {DataStore} from './data/data-store'
import {DataAnalyzer} from './data/data-analyzer'

// AoT requires an exported function for factories
export function HttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json')
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    HttpClientModule,
    CoreModule,
    SharedModule,
    HomeModule,
    DetailModule,
    AppRoutingModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient],
      },
    }),
  ],
  providers: [DataStore, DataAnalyzer],
  bootstrap: [AppComponent],
})
export class AppModule {
}
