import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import {DataStore} from '../data/data-store'
import {BehaviorSubject, Subscription} from 'rxjs'
import {MatDialog} from '@angular/material/dialog'
import {debounceTime} from 'rxjs/operators'
import {CdkVirtualScrollViewport} from '@angular/cdk/scrolling'
import {
  Alert,
  AlertAction,
  AlertActionContext,
  DataAnalyzer,
  Task,
} from '../data/data-analyzer'
import {arrayToMap} from '../util/util'
import {dayIDToDate, getShortDateDisplayName} from '../util/time-util'
import {HomeComponent} from '../home/home.component'
import {DayID, ItemID} from '../data/common'
import {ItemDetailsComponent} from '../item-details/item-details.component'

const SEARCH_IDLE_DELAY = 200

const DISPLAY_HTML_GENERATORS: {
  type: string,
  generator(alert: Alert, dataStore: DataStore): string,
}[] = [
  {
    type: 'taskConflict',
    generator(alert, dataStore): string {
      const task: Task = alert.data.task
      const item = dataStore.getItem(alert.data.itemID)
      if (item === undefined) return ''
      const dueDate = task.end
      if (dueDate === undefined) {
        return `Item <b>${item.name}</b> is not completable in the current queue.`
      }
      return `Item <b>${item.name}</b> (due ${getShortDateDisplayName(
        dayIDToDate(
          dueDate))}) is not completable in the current queue.`
    },
  },
  {
    type: 'taskImpossible',
    generator(alert, dataStore): string {
      const task: Task = alert.data.task
      const item = dataStore.getItem(alert.data.itemID)
      if (item === undefined) return ''
      const dueDate = task.end
      if (dueDate === undefined) {
        return `Item <b>${item.name}</b> is impossible to complete.`
      }
      return `Item <b>${item.name}</b> (due ${getShortDateDisplayName(
        dayIDToDate(dueDate))}) is impossible to complete.`
    },
  },
  {
    type: 'itemCostCompleted',
    generator(alert, dataStore): string {
      const item = dataStore.getItem(alert.data.itemID)
      if (item === undefined) return ''
      return `Item <b>${item.name}</b> has completed its cost.`
    },
  },
  {
    type: 'itemOverdue',
    generator(alert, dataStore): string {
      const dueDate: DayID = alert.data.dueDate
      const item = dataStore.getItem(alert.data.itemID)
      if (item === undefined) return ''
      if (dueDate === undefined) {
        return `Item <b>${item.name}</b> is overdue.`
      }
      return `Item <b>${item.name}</b> (due ${getShortDateDisplayName(
        dayIDToDate(dueDate))}) is overdue.`
    },
  },
]

const DISPLAY_HTML_GENERATORS_BY_TYPE = arrayToMap(
  DISPLAY_HTML_GENERATORS, item => item.type, item => item.generator)

export interface AlertNode {
  supportedActions: AlertAction[]
  displayHtml: string
  alert: Alert
}

@Component({
  selector: 'app-alert-list',
  templateUrl: './alert-list.component.html',
  styleUrls: ['./alert-list.component.scss'],
})
export class AlertListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollViewport') scrollViewport?: CdkVirtualScrollViewport
  @ViewChild(
    'scrollViewport', {read: ElementRef}) scrollViewportElement?: ElementRef

  itemHeight = 35

  private onDataChanged = (dataStore: DataStore) => {
    this.refresh()
  }

  private onAnalyzerChanged = (dataAnalyzer: DataAnalyzer) => {
    // TODO implement me
    this.refresh()
  }

  private dataStoreChangeSubscription?: Subscription
  private dataAnalyzerChangeSubscription?: Subscription
  private searchQueryChangeSubscription?: Subscription
  private _searchQuery: string = ''
  private searchQueryValue = new BehaviorSubject<string>(this._searchQuery)

  alertActionCtx: AlertActionContext

  data: AlertNode[] = []

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly dialog: MatDialog,
    private readonly zone: NgZone,
    private readonly home: HomeComponent,
  ) {
    this.alertActionCtx = {
      showItemInItems: (itemID: ItemID) => {
        this.home.showInItems(itemID)
      },
      showItemInQueue: (itemID: ItemID) => {
        this.home.showInQueue(itemID)
      },
      editItem: (itemID: ItemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item === undefined) return
        const dialogRef = this.dialog.open(ItemDetailsComponent, {
          width: ItemDetailsComponent.DIALOG_WIDTH,
          data: {item},
          hasBackdrop: true,
          disableClose: false,
          autoFocus: false,
        })
      },
      dataStore: this.dataStore,
    }
  }

  ngOnInit() {
    this.subscribeToData()

    this.searchQueryChangeSubscription = this.searchQueryValue.pipe(
      debounceTime(SEARCH_IDLE_DELAY),
    ).subscribe((value) => {
      this.refresh()
    })
  }

  ngAfterViewInit() {
  }

  ngOnDestroy() {
    this.unsubscribeFromData()

    this.searchQueryChangeSubscription?.unsubscribe()
    this.searchQueryChangeSubscription = undefined
  }

  get searchQuery() {
    return this._searchQuery
  }

  set searchQuery(value: string) {
    this._searchQuery = value
    this.searchQueryValue.next(value)
  }

  private refresh() {
    this.data = []
    this.dataAnalyzer.getAlerts().forEach(alert => {
      this.data.push({
        supportedActions: alert.actions.filter(
          action => action.isSupported(this.alertActionCtx)),
        displayHtml: this.getDisplayHtml(alert),
        alert,
      })
    })

    this.changeDetectorRef.detectChanges()
  }

  subscribeToData() {
    if (this.dataStoreChangeSubscription === undefined) {
      this.dataStoreChangeSubscription =
        this.dataStore.onChange.subscribe(this.onDataChanged)
    }
    if (this.dataAnalyzerChangeSubscription === undefined) {
      this.dataAnalyzerChangeSubscription =
        this.dataAnalyzer.onChange.subscribe(this.onAnalyzerChanged)
    }
  }

  unsubscribeFromData() {
    this.dataStoreChangeSubscription?.unsubscribe()
    this.dataStoreChangeSubscription = undefined
    this.dataAnalyzerChangeSubscription?.unsubscribe()
    this.dataAnalyzerChangeSubscription = undefined
  }

  /**
   * Will be called when this as a tab is selected
   */
  onActivate() {
    this.subscribeToData()

    // This forces the virtual scroll to redraw
    const el = this.scrollViewportElement?.nativeElement
    el?.dispatchEvent(new Event('scroll'))
  }

  /**
   * Will be called when another tab is selected
   */
  onDeactivate() {
    this.unsubscribeFromData()
  }

  private getDisplayHtml(alert: Alert) {
    const generator = DISPLAY_HTML_GENERATORS_BY_TYPE.get(alert.type)
    if (generator === undefined) return '(Unknown alert)'
    return generator(alert, this.dataStore)
  }
}
