import {Component, Input, OnInit} from '@angular/core'
import {dayIDNow, dayIDToDate} from '../util/time-util'
import {
  DataStore,
  DayData,
  Item,
  ItemStatus,
  SessionType,
} from '../data/data-store'
import {MatDialog} from '@angular/material/dialog'
import {SessionDetailsComponent} from '../session-details/session-details.component'
import Color from 'color'

interface Session {
  isProjected: boolean
  type: SessionType
  item: Item
  count: number
  color: Color
  done: boolean
  itemDone: boolean
}

const SESSION_TYPE_TO_ICON = {
  [SessionType.COMPLETED]: 'done',
  [SessionType.SCHEDULED]: 'schedule',
  [SessionType.PROJECTED]: 'explore',
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

  sessions: Session[] = []

  private _dayData?: DayData

  constructor(
    private readonly dataStore: DataStore,
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
      this.processData(value)
    }
  }

  processData(dayData?: DayData) {
    dayData = dayData || this._dayData
    if (dayData === undefined) return
    this.sessions = []
    dayData.sessions.forEach((sessions, type) => {
      sessions.forEach((count, itemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item !== undefined) {
          this.sessions.push({
            isProjected: type === SessionType.PROJECTED,
            type,
            item,
            count,
            color: item.color || this.dataStore.getItemColor(item.parentID),
            done: type === SessionType.COMPLETED,
            itemDone: item.status === ItemStatus.COMPLETED,
          })
        }
      })
    })

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

  markSessionScheduled(session: Session) {
    this.dataStore.batchEdit(() => {
      this.dataStore.removeSession(
        this.dayID, session.type, session.item.id, session.count)
      this.dataStore.addSession(
        this.dayID, SessionType.SCHEDULED, session.item.id, session.count)
    })
  }

  deleteSession(session: Session) {
    this.dataStore.setSession(this.dayID, session.type, session.item.id, 0)
  }
}
