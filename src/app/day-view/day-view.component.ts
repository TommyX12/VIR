import {
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import {dayIDNow, dayIDToDate} from '../util/time-util'
import {DataStore} from '../data/data-store'
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
import {Subscription} from 'rxjs'
import {getOrCreate} from '../util/util'
import {HomeComponent} from '../home/home.component'
import {ItemDetailsComponent} from '../item-details/item-details.component'
import {AnalyzerProjectionStrategy, DataAnalyzer} from '../data/data-analyzer'
import {MatSnackBar} from '@angular/material/snack-bar'
import {QuickQuotaEditComponent} from '../quick-quota-edit/quick-quota-edit.component'

interface Session {
  isOnDue: boolean
  canItemRepeat: boolean
  scheduled: boolean
  projected: boolean
  type: SessionType
  item: Item
  count: number
  color: Color
  done: boolean
  itemDone: boolean
}

interface SessionGroup {
  type: SessionType
  displayName: string
  expanded: boolean
  count: number
}

@Component({
  selector: 'app-day-view',
  templateUrl: './day-view.component.html',
  styleUrls: ['./day-view.component.scss'],
})
export class DayViewComponent implements OnInit, OnDestroy {
  private _dayID = dayIDNow()

  @Input() home?: HomeComponent

  @ViewChild('background') backgroundRef?: ElementRef

  sessions = new Map<SessionType, Session[]>()

  sessionGroups: SessionGroup[] = [
    {
      type: SessionType.COMPLETED,
      displayName: 'Completed',
      expanded: true,
      count: 0,
    },
    {
      type: SessionType.SCHEDULED,
      displayName: 'Scheduled',
      expanded: true,
      count: 0,
    },
    {
      type: SessionType.PROJECTED,
      displayName: 'Projected',
      expanded: true,
      count: 0,
    },
  ]

  private dataStoreChangeSubscription?: Subscription
  private dataAnalyzerChangeSubscription?: Subscription

  quota = 0
  totalCount = 0
  doneCount = 0

  private onDataChanged = (dataStore: DataStore) => {
    this.refresh()
  }

  private onAnalyzerChanged = (dataAnalyzer: DataAnalyzer) => {
    // TODO implement me
    this.refresh()
  }

  constructor(
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly dialog: MatDialog,
    private readonly snackBar: MatSnackBar,
  ) {
  }

  get dayID() {
    return this._dayID
  }

  @Input() set dayID(value) {
    if (value === this._dayID) return
    this._dayID = value
    this.refresh()
  }

  ngOnInit(): void {
    this.subscribeToData()
  }

  ngOnDestroy() {
    this.unsubscribeFromData()
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

  getDate() {
    // TODO optimize: cache this evrey time dayID is set
    return dayIDToDate(this.dayID)
  }

  getCheckBoxIcon(session: Session) {
    if (session.itemDone) {
      return 'check_circle'
    }
    return session.canItemRepeat ? 'loop' : 'radio_button_unchecked'
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

  getSessionTypeIcon(type: SessionType): string {
    return SESSION_TYPE_TO_ICON[type] || ''
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

  private refresh() {
    this.sessions = new Map<SessionType, Session[]>()
    const dayData = this.dataStore.getDayData(this.dayID)
    this.totalCount = 0
    this.doneCount = 0
    dayData.sessions.forEach((sessions, type) => {
      sessions.forEach((count, itemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item !== undefined) {
          getOrCreate(this.sessions, type, () => []).push({
            isOnDue: this.dataAnalyzer.isItemDueOn(item.id, this.dayID),
            canItemRepeat: item.repeat !== undefined &&
              !this.dataStore.getHasAncestorRepeat(item),
            scheduled: type === SessionType.SCHEDULED,
            projected: type === SessionType.PROJECTED,
            type,
            item,
            count,
            color: this.dataStore.getItemColor(item),
            done: type === SessionType.COMPLETED,
            itemDone: item.status === ItemStatus.COMPLETED,
          })

          if (type === SessionType.COMPLETED) {
            this.doneCount += count
          }

          this.totalCount += count
        }
      })
    })

    const projections = this.dataAnalyzer.getProjections(
      AnalyzerProjectionStrategy.FORWARD, this.dayID)
    if (projections !== undefined) {
      projections.forEach((count, itemID) => {
        const item = this.dataStore.getItem(itemID)
        if (item !== undefined) {
          getOrCreate(this.sessions, SessionType.PROJECTED, () => []).push({
            isOnDue: this.dataAnalyzer.isItemDueOn(item.id, this.dayID),
            canItemRepeat: item.repeat !== undefined &&
              !this.dataStore.getHasAncestorRepeat(item),
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

    this.sessions.forEach(sessions => {
      sessions.sort((a, b) => {
        if (a.count !== b.count) return b.count - a.count
        return a.item.name.localeCompare(b.item.name)
      })
    })

    this.sessionGroups.forEach(group => {
      group.count = 0
      this.getSessions(group.type).forEach(session => {
        group.count += session.count
      })
    })

    this.quota =
      this.dataStore.getQuota(this.dayID, this.dayID).get(this.dayID) || 0
  }

  toggleItemDone(session: Session) {
    const draft = this.dataStore.getItem(session.item.id)!.toDraft()
    draft.status = session.itemDone ? ItemStatus.ACTIVE : ItemStatus.COMPLETED
    if (this.dataStore.updateItem(draft)) { // Repeated
      this.snackBar.open('Item repeated.', 'OK', {
        duration: 3000,
      })
    }
  }

  getSessions(type: SessionType): Session[] {
    return this.sessions.get(type) || []
  }

  completeOne(session: Session) {
    this.dataStore.batchEdit(it => {
      if (session.type !== SessionType.COMPLETED) {
        it.removeSession(this.dayID, session.type, session.item.id, 1)
      }
      it.addSession(this.dayID, SessionType.COMPLETED, session.item.id, 1)
    })
  }

  showInItems(session: Session) {
    this.home?.showInItems(session.item.id)
  }

  showInQueue(session: Session) {
    this.home?.showInQueue(session.item.id)
  }

  getQuotaHtml() {
    if (this.dayID >= this.dataStore.getCurrentDayID() && this.quota > 0) {
      if (this.doneCount > 0) {
        if (this.doneCount >= this.quota) {
          return `<b>${this.doneCount} / ${this.quota}</b>`
        }
        return `<b>${this.doneCount}</b> / ${this.quota}`
      }
      return `${this.quota}`
    } else {
      if (this.doneCount > 0) {
        return `<b>${this.doneCount}</b>`
      }
      return ''
    }
  }

  get progress() {
    if (this.dayID < this.dataStore.getCurrentDayID() || this.quota <= 0) {
      return 0
    }
    return Math.min(Math.max(this.totalCount / this.quota, 0), 1)
  }

  get progressDone() {
    if (this.dayID < this.dataStore.getCurrentDayID() || this.quota <= 0) {
      return 0
    }
    return Math.min(Math.max(this.doneCount / this.quota, 0), 1)
  }

  editQuota() {
    const dialogRef = this.dialog.open(QuickQuotaEditComponent, {
      width: QuickQuotaEditComponent.DIALOG_WIDTH,
      data: {
        dayID: this.dayID,
        initialValue: this.quota,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  onCompleteItemButtonClicked(event: MouseEvent, session: Session) {
    this.toggleItemDone(session)
    event.preventDefault()
  }
}
