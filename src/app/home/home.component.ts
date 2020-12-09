import {Component, HostBinding, OnInit} from '@angular/core'
import {Router} from '@angular/router'
import {OverlayContainer} from '@angular/cdk/overlay'

const THEME_DARKNESS_SUFFIX = `-dark`
const DEFAULT_THEME_NAME = 'main'
const DEFAULT_DARKNESS = true

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  // @ts-ignore
  @HostBinding('class') activeThemeCssClass: string
  isThemeDark = false

  private activeTheme = DEFAULT_THEME_NAME
  private _enableDarkMode = DEFAULT_DARKNESS

  constructor(private router: Router,
              private overlayContainer: OverlayContainer) {
    this.setActiveTheme(this.activeTheme, this.enableDarkMode)
  }

  public get enableDarkMode() {
    return this._enableDarkMode
  }

  public set enableDarkMode(value: boolean) {
    if (value != this._enableDarkMode) {
      this._enableDarkMode = value
      this.setActiveTheme(this.activeTheme, value)
    }
  }

  setActiveTheme(theme: string, darkness: boolean) {
    const cssClass = darkness ? theme + THEME_DARKNESS_SUFFIX : theme

    const classList = this.overlayContainer.getContainerElement().classList
    if (classList.contains(this.activeThemeCssClass)) {
      classList.replace(this.activeThemeCssClass, cssClass)
    } else {
      classList.add(cssClass)
    }

    this.activeThemeCssClass = cssClass
  }

  ngOnInit(): void {
  }

}
