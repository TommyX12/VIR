import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  ViewChild,
} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {
  DataStore,
  DataStoreAutoCompleter,
  InvalidItemError,
} from '../data/data-store'
import Color from 'color'
import {
  Item,
  ItemDraft,
  ItemID,
  ItemStatus,
  REPEAT_TYPE_FACTORY_BY_TYPE,
} from '../data/common'
import {BehaviorSubject} from 'rxjs'
import {MatDatepickerInputEvent} from '@angular/material/datepicker'
import {
  dateAddDay,
  dayIDToDate,
  parseMatDatePicker,
  startOfWeek,
} from '../util/time-util'

export interface ItemDetailsConfig {
  item?: Item

  /**
   * When item is present, this field is ignored.
   */
  initialColor?: Color

  /**
   * When item is present, this field is ignored.
   */
  initialParent?: ItemID

  /**
   * When item is present, this field is ignored.
   */
  initialPriorityPredecessor?: ItemID
}

const REPEAT_TYPE_OPTIONS = [
  {
    type: 'day',
    displayName: 'Day',
  },
  {
    type: 'week',
    displayName: 'Week',
  },
  {
    type: 'month',
    displayName: 'Month',
  },
  {
    type: 'year',
    displayName: 'Year',
  },
]

const REPEAT_DAY_OF_WEEK_OPTIONS = (() => {
  const result: { value: number, dowDate: Date }[] = []
  const start = startOfWeek(new Date())
  for (let i = 0; i < 7; ++i) {
    result.push({value: i, dowDate: dateAddDay(start, i)})
  }
  return result
})()

@Component({
  selector: 'app-item-details',
  templateUrl: './item-details.component.html',
  styleUrls: ['./item-details.component.scss'],
})
export class ItemDetailsComponent implements AfterViewInit {
  static readonly DIALOG_WIDTH = '500px'

  // @ts-ignore
  @ViewChild('nameInput') nameInput: ElementRef

  draft: ItemDraft
  isAddingNewItem = false

  parentAutoCompleter: DataStoreAutoCompleter
  originalParentItemKey?: string
  originalParentItemID?: ItemID
  private _parentItemKey: string = ''
  filteredParentKeys = new BehaviorSubject<string[]>([])

  priorityPredecessorAutoCompleter: DataStoreAutoCompleter
  private _priorityPredecessorItemKey: string = ''
  filteredPriorityPredecessorKeys = new BehaviorSubject<string[]>([])

  deferDate: Date | null = null
  dueDate: Date | null = null
  repeatEndDate: Date | null = null
  repeatTypeOptions = REPEAT_TYPE_OPTIONS
  repeatDayOfWeekOptions = REPEAT_DAY_OF_WEEK_OPTIONS

  repeatDayOfWeek: any

  constructor(
    public dialogRef: MatDialogRef<ItemDetailsComponent>,
    private readonly dataStore: DataStore,
    @Inject(MAT_DIALOG_DATA) public data: ItemDetailsConfig) {
    const item = data.item
    if (item === undefined) {
      this.draft = new ItemDraft()
      if (data.initialColor !== undefined) {
        this.draft.color = data.initialColor
      }
      this.draft.parentID = data.initialParent
      this.isAddingNewItem = true
    } else {
      this.draft = item.toDraft()
      this.isAddingNewItem = false
    }

    this.parentAutoCompleter = dataStore.createAutoCompleter()
    if (this.draft.parentID !== undefined) {
      this.originalParentItemID = this.draft.parentID
      this.originalParentItemKey =
        this.parentAutoCompleter.idToKey(this.draft.parentID)
      if (this.originalParentItemKey === undefined) {
        throw new Error('Parent item key not found')
      }
      this._parentItemKey = this.originalParentItemKey
    }

    // Setting up dates
    this.deferDate =
      this.draft.deferDate ? dayIDToDate(this.draft.deferDate) : null
    this.dueDate = this.draft.dueDate ? dayIDToDate(this.draft.dueDate) : null
    this.repeatEndDate =
      this.draft.repeatEndDate ? dayIDToDate(this.draft.repeatEndDate) : null

    // Setting up priority predecessor
    // TODO deal with things that have the same key, just like how parent is
    //  done
    const queueSet = new Set(dataStore.state.queue)
    this.priorityPredecessorAutoCompleter =
      dataStore.createAutoCompleter(item => queueSet.has(item.id))
    let predecessorID: ItemID | undefined = undefined
    if (this.isAddingNewItem) {
      if (data.initialPriorityPredecessor !== undefined) {
        this.draft.autoAdjustPriority = false
        predecessorID = data.initialPriorityPredecessor
      }
    } else {
      this.dataStore.getQueuePredecessor(this.draft.id)
    }
    if (predecessorID !== undefined) {
      this._priorityPredecessorItemKey =
        this.priorityPredecessorAutoCompleter.idToKey(predecessorID) || ''
    } else {
      this._priorityPredecessorItemKey = ''
    }
  }

  get colorString() {
    return this.draft.color.hex()
  }

  set colorString(value: string) {
    this.draft.color = Color(value)
  }

  get completed() {
    return this.draft.status === ItemStatus.COMPLETED
  }

  set completed(value: boolean) {
    this.draft.status = value ? ItemStatus.COMPLETED : ItemStatus.ACTIVE
  }

  get cost() {
    return this.draft.cost.toString()
  }

  set cost(value: string) {
    let v = Number(value)
    if (isNaN(v) || v < 0) {
      v = 0
    }
    this.draft.cost = v
  }

  get parentItemKey() {
    return this._parentItemKey
  }

  set parentItemKey(value: string) {
    this._parentItemKey = value
    this.filteredParentKeys.next(this.parentAutoCompleter.queryKeys(value, 10))
  }

  get priorityPredecessorItemKey() {
    return this._priorityPredecessorItemKey
  }

  set priorityPredecessorItemKey(value: string) {
    this._priorityPredecessorItemKey = value
    this.filteredPriorityPredecessorKeys.next(
      this.priorityPredecessorAutoCompleter.queryKeys(value, 10))
  }

  get repeatEnabled() {
    return this.dueDate !== null && this.draft.repeat !== undefined
  }

  set repeatEnabled(value: boolean) {
    if (value) {
      if (this.draft.repeat === undefined) {
        this.draft.repeat =
          REPEAT_TYPE_FACTORY_BY_TYPE.get(REPEAT_TYPE_OPTIONS[0].type)?.create()
      }
    } else {
      this.draft.repeat = undefined
    }
  }

  get repeatType() {
    const repeatType = this.draft.repeat
    if (repeatType === undefined) return undefined
    return repeatType.type
  }

  set repeatType(value: string | undefined) {
    if (value === undefined) {
      this.draft.repeat = undefined
    } else {
      if (this.draft.repeat === undefined || this.draft.repeat.type !== value) {
        this.draft.repeat =
          REPEAT_TYPE_FACTORY_BY_TYPE.get(value)?.create()
      }
    }
  }

  get repeatIntervalString() {
    return this.draft.repeatInterval.toString()
  }

  set repeatIntervalString(value: string) {
    let v = Number(value)
    if (isNaN(v) || v <= 0) {
      v = 1
    }
    this.draft.repeatInterval = v
  }

  close(): void {
    this.dialogRef.close()
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.nameInput?.nativeElement?.focus()
      this.nameInput?.nativeElement?.select()
    })
  }

  save() {
    // Validation
    // TODO refactor: move this
    let parentID: ItemID | undefined = undefined
    if (this.parentItemKey !== '') {
      parentID = (this.originalParentItemKey !== undefined &&
        this.parentItemKey === this.originalParentItemKey) ?
        this.originalParentItemID :
        this.parentAutoCompleter.keyToID(this._parentItemKey)
      if (parentID === undefined) {
        this.errorParentNotFound()
        return
      }
    }
    this.draft.parentID = parentID

    const priorityPredecessorID = this.priorityPredecessorAutoCompleter.keyToID(
      this._priorityPredecessorItemKey)
    const autoAdjustPriority = this.draft.autoAdjustPriority
    const itemID = this.draft.id

    // Finalize
    try {
      this.dataStore.validateItemDraft(this.draft, this.isAddingNewItem)
    } catch (e) {
      this.errorInvalidItem(e)
      return
    }
    this.dataStore.batchEdit(it => {
      if (this.isAddingNewItem) {
        it.addItem(this.draft)
      } else {
        it.updateItem(this.draft)
      }

      if (!autoAdjustPriority) {
        if (priorityPredecessorID) {
          it.queueMoveToAfter(itemID, priorityPredecessorID)
        } else {
          it.queueMoveToIndex(itemID, 0)
        }
      }
    })
    this.close()
  }

  private errorParentNotFound() {
    alert('Error: parent not found')
  }

  private errorInvalidCost() {
    alert('Error: invalid cost')
  }

  private errorInvalidParent() {
    alert('Error: parent is invalid')
  }

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.save()
    }
  }

  private errorInvalidName() {
    alert('Error: invalid name')
  }

  setRandomColor() {
    this.draft.color = this.dataStore.generateColor()
  }

  onDeferDateChanged(event: MatDatepickerInputEvent<unknown, unknown>) {
    let dayID = parseMatDatePicker(event)
    if (dayID === undefined) {
      this.clearDeferDate()
    } else {
      this.draft.deferDate = dayID
      this.deferDate = dayIDToDate(this.draft.deferDate)
    }
  }

  onDueDateChanged(event: MatDatepickerInputEvent<unknown, unknown>) {
    let dayID = parseMatDatePicker(event)
    if (dayID === undefined) {
      this.clearDueDate()
    } else {
      this.draft.dueDate = dayID
      this.dueDate = dayIDToDate(this.draft.dueDate)
    }
  }

  onRepeatEndDateChanged(event: MatDatepickerInputEvent<unknown, unknown>) {
    let dayID = parseMatDatePicker(event)
    if (dayID === undefined) {
      this.clearRepeatEndDate()
    } else {
      this.draft.repeatEndDate = dayID
      this.repeatEndDate = dayIDToDate(this.draft.repeatEndDate)
    }
  }

  clearDeferDate() {
    this.draft.deferDate = undefined
    this.deferDate = null
  }

  clearDueDate() {
    this.draft.dueDate = undefined
    this.dueDate = null
  }

  clearRepeatEndDate() {
    this.draft.repeatEndDate = undefined
    this.repeatEndDate = null
  }

  private errorInvalidRepeatInterval() {
    alert('Error: Invalid repeat interval')
  }

  private errorInvalidItem(error: any) {
    alert((error as InvalidItemError).message)
  }

  delete() {
    if (this.isAddingNewItem) return
    this.dataStore.removeItem(this.draft.id)
    this.close()
  }
}
