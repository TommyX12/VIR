import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnInit,
  ViewChild,
} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {DataStore, DataStoreAutoCompleter} from '../data/data-store'
import {BehaviorSubject} from 'rxjs'
import {DayID, ItemID, SessionType} from '../data/common'

export interface SessionDetailsConfig {
  isEditing?: boolean
  itemID?: ItemID
  dayID: DayID
  count?: number
  type?: SessionType
}

const SESSION_TYPE_OPTIONS = [
  {
    type: SessionType.COMPLETED,
    displayName: 'Completed',
  },
  {
    type: SessionType.SCHEDULED,
    displayName: 'Scheduled',
  },
]

@Component({
  selector: 'app-session-details',
  templateUrl: './session-details.component.html',
  styleUrls: ['./session-details.component.scss'],
})
export class SessionDetailsComponent implements OnInit, AfterViewInit {
  static readonly DIALOG_WIDTH = '500px'
  @ViewChild('itemKeyInput') itemKeyInput?: ElementRef
  @ViewChild('countInput') countInput?: ElementRef

  type: SessionType
  count: number = 1

  private autoCompleter: DataStoreAutoCompleter
  filteredItemKeys = new BehaviorSubject<string[]>([])
  private _itemKey = ''

  sessionTypeOptions = SESSION_TYPE_OPTIONS

  dayID: number

  isEditing: boolean

  originalItemID?: number
  originalItemKey?: string
  originalType?: SessionType
  originalCount?: number

  constructor(
    public dialogRef: MatDialogRef<SessionDetailsComponent>,
    private readonly dataStore: DataStore,
    @Inject(MAT_DIALOG_DATA) public data: SessionDetailsConfig,
  ) {
    this.dayID = data.dayID
    this.type = data.type === undefined ? SessionType.SCHEDULED : data.type
    this.count = data.count === undefined ? 1 : data.count
    this.isEditing = !!data.isEditing

    this.autoCompleter = dataStore.createAutoCompleter()
    if (this.isEditing) {
      if (data.itemID === undefined) {
        throw new Error('Item ID not given when isEditing is true')
      }
      this.originalItemID = data.itemID
      this.originalItemKey =
        this.autoCompleter.idToKey(this.originalItemID)
      if (this.originalItemKey === undefined) {
        throw new Error('Item key not found')
      }
      this._itemKey = this.originalItemKey
      this.originalType = data.type
      this.originalCount = data.count
    }
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      const inputElement = this.isEditing ? this.countInput?.nativeElement :
        this.itemKeyInput?.nativeElement
      inputElement?.focus()
      inputElement?.select()
    })
  }

  get countString() {
    return this.count.toString()
  }

  set countString(value: string) {
    let v = Number(value)
    if (isNaN(v) || v < 0) {
      v = 0
    }
    this.count = v
  }

  close() {
    this.dialogRef.close()
  }

  save() {
    // Validation
    // TODO refactor: move this
    if (!this.itemKey) {
      this.errorInvalidItemKey()
      return
    }
    const itemID = (this.originalItemKey !== undefined &&
      this.itemKey === this.originalItemKey) ?
      this.originalItemID :
      this.autoCompleter.keyToID(this._itemKey)
    if (itemID === undefined) {
      this.errorItemNotFound()
      return
    }
    if (this.count < 0) {
      this.errorInvalidCount()
      return
    }

    // Finalize
    if (this.isEditing) {
      this.dataStore.batchEdit((it) => {
        it.removeSession(
          this.dayID, this.originalType!, this.originalItemID!,
          this.originalCount!,
        )
        it.addSession(this.dayID, this.type, itemID, this.count)
      })
    } else {
      this.dataStore.addSession(this.dayID, this.type, itemID, this.count)
    }
    this.close()
  }

  private errorInvalidCount() {
    alert('Error: Invalid count')
  }

  get itemKey() {
    return this._itemKey
  }

  set itemKey(value: string) {
    this._itemKey = value
    this.filteredItemKeys.next(this.autoCompleter.queryKeys(value, 10))
  }

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.save()
    }
  }

  private errorInvalidItemKey() {
    alert('Error: Invalid item')
  }

  private errorItemNotFound() {
    alert('Error: Item not found')
  }

  delete() {
    if (this.originalType === undefined || this.originalItemID === undefined) {
      throw new Error('Trying to delete but nothing is being edited')
    }
    this.dataStore.removeSession(
      this.dayID, this.originalType, this.originalItemID, this.originalCount!)
    this.close()
  }
}
