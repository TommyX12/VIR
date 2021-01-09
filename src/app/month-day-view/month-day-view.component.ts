import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core'
import {dayIDNow, dayIDToDate} from '../util/time-util'
import {DataStore, DayData} from '../data/data-store'
import {MatDialog} from '@angular/material/dialog'
import {SessionDetailsComponent} from '../session-details/session-details.component'
import Color from 'color'
import {
  DayID,
  Item,
  ItemID,
  ItemStatus,
  SESSION_TYPE_TO_ICON,
  SessionType,
} from '../data/common'
import {DayViewDialogComponent} from '../day-view-dialog/day-view-dialog.component'
import {HomeComponent} from '../home/home.component'
import {ItemDetailsComponent} from '../item-details/item-details.component'
import {QuickQuotaEditComponent} from '../quick-quota-edit/quick-quota-edit.component'
import {DataAnalyzer} from '../data/data-analyzer'

interface Session {
  scheduled: boolean
  projected: boolean
  type: SessionType
  item: Item
  count: number
  color: Color
  done: boolean
  itemDone: boolean
}

@Component({
  selector: 'app-month-day-view',
  templateUrl: './month-day-view.component.html',
  styleUrls: ['./month-day-view.component.scss'],
})
export class MonthDayViewComponent implements OnInit {
  @Input() dayID = dayIDNow()
  @Input() todayDayID = dayIDNow()
  @Input() forceDisplayMonth = false
  @Input() quota?: number
  @Input() home?: HomeComponent

  @ViewChild('background') backgroundRef?: ElementRef

  sessions: Session[] = []

  private _dayData?: DayData

  totalCount = 0

  constructor(
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly dialog: MatDialog,
  ) {
  }

  /**
   * TODO improve:
   * Note that this has to be synced up with data store state, otherwise there
   * will be inconsistencies
   */
  @Input() set dayData(value: DayData) {
    if (value !== this._dayData) {
      this._dayData = value
      this.processData()
    }
  }

  /**
   * Called on data store change as well as on data analyzer change.
   */
  processData() {
    const dayData = this._dayData
    if (dayData === undefined) return
    this.sessions = []
    this.totalCount = 0
    dayData.sessions.forEach((sessions, type) => {
      sessions.forEach((count, itemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item !== undefined) {
          this.sessions.push({
            scheduled: type === SessionType.SCHEDULED,
            projected: type === SessionType.PROJECTED,
            type,
            item,
            count,
            color: this.dataStore.getItemColor(item),
            done: type === SessionType.COMPLETED,
            itemDone: item.status === ItemStatus.COMPLETED,
          })

          this.totalCount += count
        }
      })
    })

    const projections = this.dataAnalyzer.getProjections(this.dayID)
    if (projections !== undefined) {
      projections.forEach((count, itemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item !== undefined) {
          this.sessions.push({
            scheduled: false,
            projected: true,
            type: SessionType.PROJECTED,
            item,
            count,
            color: this.dataStore.getItemColor(item),
            done: false,
            itemDone: item.status === ItemStatus.COMPLETED,
          })

          this.totalCount += count
        }
      })
    }

    this.sessions.sort((a, b) => {
      if (a.type !== b.type) return a.type - b.type
      if (a.count !== b.count) return b.count - a.count
      return a.item.name.localeCompare(b.item.name)
    })
  }

  getDate() {
    // TODO optimize: cache this evrey time dayID is set
    return dayIDToDate(this.dayID)
  }

  ngOnInit(): void {
  }

  get isToday() {
    return this.todayDayID === this.dayID
  }

  get isOnOrAfterToday() {
    return this.dayID >= this.todayDayID
  }

  get isBeforeToday() {
    return !this.isOnOrAfterToday
  }

  getDateFormat() {
    const date = this.getDate()
    if (date.getMonth() === 0 && date.getDate() === 1) {
      return 'yyyy'
    }
    if (date.getDate() === 1) {
      return 'MMM'
    }
    if (this.forceDisplayMonth) {
      return 'MMM dd'
    }
    return 'dd'
  }

  get isStartOfMonth() {
    return this.getDate().getDate() === 1
  }

  onAddButtonClicked(event: MouseEvent) {
    event.preventDefault()
  }

  addCompletedSession() {
    this.addSession(SessionType.COMPLETED)
  }

  addScheduledSession() {
    this.addSession(SessionType.SCHEDULED)
  }

  addSession(type?: SessionType) {
    const dialogRef = this.dialog.open(SessionDetailsComponent, {
      width: SessionDetailsComponent.DIALOG_WIDTH,
      data: {
        isEditing: false,
        dayID: this.dayID,
        type,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  editQuota() {
    const dialogRef = this.dialog.open(QuickQuotaEditComponent, {
      width: QuickQuotaEditComponent.DIALOG_WIDTH,
      data: {
        dayID: this.dayID,
        initialValue: this.quota || 0,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  openDayView() {
    const dialogRef = this.dialog.open(DayViewDialogComponent, {
      width: DayViewDialogComponent.DIALOG_WIDTH,
      data: {
        dayID: this.dayID,
        home: this.home,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  getSessionTypeIcon(type: SessionType): string {
    return SESSION_TYPE_TO_ICON[type] || ''
  }

  getChipColor(session: Session) {
    return session.type === SessionType.COMPLETED ? '#00000000' :
      session.color.string()
  }

  markSessionComplete(session: Session) {
    this.dataStore.batchEdit(() => {
      this.dataStore.removeSession(
        this.dayID, session.type, session.item.id, session.count)
      this.dataStore.addSession(
        this.dayID, SessionType.COMPLETED, session.item.id, session.count)
    })
  }

  editSession(session: Session) {
    const dialogRef = this.dialog.open(SessionDetailsComponent, {
      width: SessionDetailsComponent.DIALOG_WIDTH,
      data: {
        isEditing: true,
        itemID: session.item.id,
        dayID: this.dayID,
        count: session.count,
        type: session.type,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  editItem(session: Session) {
    const {item} = session
    const dialogRef = this.dialog.open(ItemDetailsComponent, {
      width: ItemDetailsComponent.DIALOG_WIDTH,
      data: {item},
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  markSessionScheduled(session: Session) {
    this.dataStore.batchEdit(() => {
      this.dataStore.removeSession(
        this.dayID, session.type, session.item.id, session.count)
      this.dataStore.addSession(
        this.dayID, SessionType.SCHEDULED, session.item.id, session.count)
    })
  }

  deleteSession(session: Session) {
    this.dataStore.removeSession(
      this.dayID, session.type, session.item.id, session.count)
  }

  onSessionDragStart(event: DragEvent, session: Session) {
    event.dataTransfer?.setData('text', 'session ' + JSON.stringify(
      {
        dayID: this.dayID,
        itemID: session.item.id,
        type: session.type,
        count: session.count,
      }))
  }

  onDragReact = (event: DragEvent) => {
    const element = this.backgroundRef?.nativeElement
    if (element) {
      element.style.border = '5px solid #4488ff'
    }
  }

  clearDragReact = () => {
    const element = this.backgroundRef?.nativeElement
    if (element) {
      element.style.border = ''
    }
  }

  onDrop(event: DragEvent) {
    const data = event.dataTransfer?.getData('text')
    if (!data) return

    if (data.startsWith('session ')) {
      const {count, dayID, itemID, type}: {
        count: number,
        dayID: DayID,
        itemID: ItemID,
        type: SessionType,
      } = JSON.parse(data.substring(8))

      this.dataStore.batchEdit(() => {
        this.dataStore.removeSession(
          dayID, type, itemID, count)
        this.dataStore.addSession(
          this.dayID, type, itemID, count)
      })
    } else if (data.startsWith('itemID ')) {
      const itemID = Number(data.substring(7))
      this.dataStore.addSession(this.dayID, SessionType.SCHEDULED, itemID, 1)
    }
  }

  showInItems(session: Session) {
    this.home?.showInItems(session.item.id)
  }

  showInQueue(session: Session) {
    this.home?.showInQueue(session.item.id)
  }

  getQuotaHtml() {
    let result = `${this.totalCount}`
    if (this.quota !== undefined) {
      result += ` / <b>${this.quota}</b>`
    }
    return result
  }

  get progress() {
    if (this.quota === undefined || this.quota <= 0) {
      return 0
    }
    return Math.min(Math.max(this.totalCount / this.quota, 0), 1)
  }

  sessionTrackByFn(index: number, session: Session) {
    return session.item.id
  }
}
