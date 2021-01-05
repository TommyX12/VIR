import {
  ChangeDetectorRef,
  Component,
  NgZone,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChildren,
} from '@angular/core'
import {dateAddDay, dateToDayID, dayIDNow, startOfWeek} from '../util/time-util'
import {Subscription} from 'rxjs'
import {DataStore} from '../data/data-store'
import {MonthDayViewComponent} from '../month-day-view/month-day-view.component'
import {HomeComponent} from '../home/home.component'
import {DataAnalyzer} from '../data/data-analyzer'
import {DayID} from '../data/common'

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.scss'],
})
export class TimelineComponent implements OnInit, OnDestroy {
  // @ts-ignore
  @ViewChildren('monthDayView') monthDayViews: QueryList<MonthDayViewComponent>

  rows = [0, 1, 2, 3, 4]
  columns = [0, 1, 2, 3, 4, 5, 6]
  _viewRange: 'week' | 'month' = 'month'

  // TODO: implement this
  dayStartOffsetMinutes = 0

  todayDayID = dayIDNow(this.dayStartOffsetMinutes)

  weekStartDate = startOfWeek(new Date())

  private dataStoreChangeSubscription?: Subscription
  private dataAnalyzerChangeSubscription?: Subscription

  private updateIntervalID?: any

  private cachedQuotaRangeFirst: DayID = -1
  private cachedQuotaRangeLast: DayID = -1
  private cachedQuota?: Map<DayID, number>

  dowDates = (() => {
    const result: Date[] = []
    const start = startOfWeek(new Date())
    for (let i = 0; i < 7; ++i) {
      result.push(dateAddDay(start, i))
    }
    return result
  })()

  private onDataChanged = (dataStore: DataStore) => {
    this.invalidateQuotaCache()
    this.refresh()
  }

  private onAnalyzerChanged = (dataAnalyzer: DataAnalyzer) => {
    // TODO implement me
    this.refresh()
  }

  constructor(
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly zone: NgZone,
    readonly home: HomeComponent,
  ) {
    this.viewRange = 'month' // Ensure row is updated
  }

  get viewRange() {
    return this._viewRange
  }

  set viewRange(value) {
    this._viewRange = value
    if (value === 'week') {
      this.rows = [0]
    } else {
      this.rows = [0, 1, 2, 3, 4]
    }
  }

  ngOnInit(): void {
    this.subscribeToData()

    this.zone.runOutsideAngular(() => {
      this.updateIntervalID = setInterval(() => {
        const newTodayDayID = dayIDNow(this.dayStartOffsetMinutes)
        if (this.todayDayID !== newTodayDayID) {
          this.todayDayID = newTodayDayID
          this.changeDetectorRef.detectChanges()
        }
      }, 60000) // Update every minute
    })
  }

  ngOnDestroy() {
    this.unsubscribeFromData()

    if (this.updateIntervalID !== undefined) {
      clearInterval(this.updateIntervalID)
      this.updateIntervalID = undefined
    }
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
  }

  /**
   * Will be called when another tab is selected
   */
  onDeactivate() {
    this.unsubscribeFromData()
  }

  identity<T>(x: T) {
    return x
  }

  getNowDate() {
    return new Date()
  }

  getDayIDOfCell(row: number, column: number) {
    const weekStartDayID = dateToDayID(this.weekStartDate)
    return weekStartDayID + row * this.columns.length + column
  }

  shouldDisplayMonth(row: number, column: number) {
    return row === 0 && column === 0
  }

  private refresh() {
    this.changeDetectorRef.detectChanges()
    this.monthDayViews?.forEach(monthDayView => {
      monthDayView.processData()
    })
  }

  getDayData(row: number, column: number) {
    return this.dataStore.getDayData(this.getDayIDOfCell(row, column))
  }

  changeWeek(delta: number) {
    this.weekStartDate = dateAddDay(this.weekStartDate, delta * 7)
  }

  gotoTodayWeek() {
    this.weekStartDate = startOfWeek(new Date())
  }

  onDateChanged(event: any) {
    this.weekStartDate = startOfWeek(event.value)
  }

  getQuota(row: number, column: number) {
    const viewRangeFirst = dateToDayID(this.weekStartDate)
    const viewRangeLast = viewRangeFirst +
      (this.rows.length * this.columns.length) - 1
    if (this.cachedQuota === undefined ||
      viewRangeFirst !== this.cachedQuotaRangeFirst ||
      viewRangeLast !== this.cachedQuotaRangeLast) {
      this.cachedQuota = this.dataStore.getQuota(viewRangeFirst, viewRangeLast)
      this.cachedQuotaRangeFirst = viewRangeFirst
      this.cachedQuotaRangeLast = viewRangeLast
    }
    return this.cachedQuota.get(this.getDayIDOfCell(row, column))
  }

  private invalidateQuotaCache() {
    this.cachedQuota = undefined
  }
}
