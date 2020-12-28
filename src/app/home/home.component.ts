import {
  AfterViewInit,
  Component,
  HostBinding,
  OnInit,
  ViewChild,
} from '@angular/core'
import {Router} from '@angular/router'
import {OverlayContainer} from '@angular/cdk/overlay'
import {DataStore} from '../data/data-store'
import {ItemsComponent} from '../items/items.component'
import {MatTabChangeEvent} from '@angular/material/tabs'
import {TimelineComponent} from '../timeline/timeline.component'
import {dateToDayID, dayIDNow, dayIDToDate} from '../util/time-util'
import {MatDatepickerInputEvent} from '@angular/material/datepicker'

const THEME_DARKNESS_SUFFIX = `-dark`
const DEFAULT_THEME_NAME = 'main'
const DEFAULT_DARKNESS = true

interface TabData {
  getComponent(): any | undefined
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit, AfterViewInit {
  // @ts-ignore
  @HostBinding('class') activeThemeCssClass: string

  @ViewChild('timelineTab') timelineTab?: TimelineComponent
  @ViewChild('itemsTab') itemTab?: ItemsComponent

  tabs: TabData[] = [
    {
      getComponent: () => this.timelineTab,
    },
    {
      getComponent: () => this.itemTab,
    },
  ]

  isThemeDark = false

  private activeTheme = DEFAULT_THEME_NAME
  private _enableDarkMode = DEFAULT_DARKNESS
  public selectedTabIndex = 0
  public activatedTabIndex = -1

  sideBarDayID = dayIDNow()

  constructor(private router: Router,
              private overlayContainer: OverlayContainer,
              public readonly dataStore: DataStore) {
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

  ngAfterViewInit() {
    setTimeout(() => {
      this.onSelectedIndexChange(this.selectedTabIndex)
    })
  }

  activateTab(index: number) {
    const tabData = this.tabs[index]
    const component = tabData.getComponent()
    if (component !== undefined) {
      if (component.onActivate !== undefined) {
        component.onActivate()
      }
    }
  }

  deactivateTab(index: number) {
    const tabData = this.tabs[index]
    const component = tabData.getComponent()
    if (component !== undefined) {
      if (component.onDeactivate !== undefined) {
        component.onDeactivate()
      }
    }
  }

  onSelectedTabChange(event: MatTabChangeEvent) {
    this.onSelectedIndexChange(event.index)
  }

  onSelectedIndexChange(index: number) {
    if (this.activatedTabIndex >= 0) {
      this.deactivateTab(this.activatedTabIndex)
    }
    this.activatedTabIndex = index
    this.activateTab(index)
  }

  getSideBarDate() {
    return dayIDToDate(this.sideBarDayID)
  }

  changeSideBarDate(delta: number) {
    this.sideBarDayID += delta
  }

  onSideBarDateChanged(event: MatDatepickerInputEvent<Date, Date | null>) {
    const date = event.value
    if (!date) return
    this.sideBarDayID = dateToDayID(date)
  }

  sideBarGoToToday() {
    this.sideBarDayID = dayIDNow()
  }
}
