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
import {ItemID} from '../data/common'
import {MatDialog} from '@angular/material/dialog'
import {QueueComponent} from '../queue/queue.component'
import {QuotaListComponent} from '../quota-list/quota-list.component'

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
  @ViewChild('itemsTab') itemsTab?: ItemsComponent
  @ViewChild('queueTab') queueTab?: QueueComponent
  @ViewChild('quotaListTab') quotaListTab?: QuotaListComponent

  // TODO: This must match the actual tabs in the template.
  //  Make this less error prone.
  tabs: TabData[] = [
    {
      getComponent: () => this.timelineTab,
    },
    {
      getComponent: () => this.itemsTab,
    },
    {
      getComponent: () => this.queueTab,
    },
    {
      getComponent: () => this.quotaListTab,
    },
  ]

  isThemeDark = false

  private activeTheme = DEFAULT_THEME_NAME
  private _enableDarkMode = DEFAULT_DARKNESS
  public selectedTabIndex = 0
  public activatedTabIndex = -1

  sideBarDayID = dayIDNow()

  home = this

  constructor(private router: Router,
              private overlayContainer: OverlayContainer,
              private dialog: MatDialog,
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

  showInItems(itemID: ItemID) {
    this.dialog.closeAll()

    for (let i = 0; i < this.tabs.length; ++i) {
      if (this.tabs[i].getComponent() === this.itemsTab) {
        this.selectedTabIndex = i
        break
      }
    }
    // TODO: This is a hack
    setTimeout(() => {
      setTimeout(() => {
        this.itemsTab?.locateNodeByID(itemID)
      })
    })
  }

  showInQueue(itemID: ItemID) {
    this.dialog.closeAll()

    for (let i = 0; i < this.tabs.length; ++i) {
      if (this.tabs[i].getComponent() === this.queueTab) {
        this.selectedTabIndex = i
        break
      }
    }
    // TODO: This is a hack
    setTimeout(() => {
      setTimeout(() => {
        this.queueTab?.locateNodeByID(itemID)
      })
    })
  }
}
