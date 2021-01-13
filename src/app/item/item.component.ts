import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core'
import {ItemNode} from '../items/items.component'
import {DataStore} from '../data/data-store'
import {ItemID, ItemStatus} from '../data/common'
import {dayIDToDate} from '../util/time-util'
import {MatSnackBar} from '@angular/material/snack-bar'
import {TaskProblemType} from '../data/data-analyzer'

const DROP_THRESHOLDS_WITH_CHILD_DROP = [0.4, 0.666]

export enum ItemDroppedInsertionType {
  ABOVE,
  BELOW,
  CHILD,
}

export interface ItemDroppedEvent {
  draggedItemID: ItemID
  receiverItemID: ItemID
  insertionType: ItemDroppedInsertionType
}

@Component({
  selector: 'app-item',
  templateUrl: './item.component.html',
  styleUrls: ['./item.component.scss'],
})
export class ItemComponent implements OnInit {
  @ViewChild('decorationContainer') decorationContainerRef?: ElementRef

  // @ts-ignore
  @Input() node: ItemNode

  /**
   * This is for correctly computing drag and drop
   */
  @Input() itemHeight: number = 35

  @Input() allowChildDrop = false

  @Output() bodyClicked = new EventEmitter()
  @Output() itemDropped = new EventEmitter<ItemDroppedEvent>()

  problemType = TaskProblemType

  constructor(
    private readonly dataStore: DataStore,
    private readonly zone: NgZone,
    private readonly snackBar: MatSnackBar,
  ) {
  }

  ngOnInit(): void {
  }

  onBodyClicked() {
    this.bodyClicked.emit()
  }

  getChipColor() {
    return this.done ? '#00000000' : this.node.color.string()
  }

  get done() {
    return this.node.status === ItemStatus.COMPLETED
  }

  getCheckBoxIcon() {
    if (this.node.status === ItemStatus.COMPLETED) {
      return 'check_circle'
    }
    return this.node.canRepeat ? 'loop' : 'radio_button_unchecked'
  }

  set done(value: boolean) {
    const draft = this.dataStore.getItem(this.node.id)!.toDraft()
    draft.status = value ? ItemStatus.COMPLETED : ItemStatus.ACTIVE
    if (this.dataStore.updateItem(draft)) { // Repeated
      this.snackBar.open('Item repeated.', 'OK', {
        duration: 3000,
      })
    }
  }

  toggleDone() {
    this.done = !this.done
  }

  onDrop(event: DragEvent) {
    const data = event.dataTransfer?.getData('text')
    if (!data || !data.startsWith('itemID ')) return

    const itemID = Number(data.substring(7))

    // @ts-ignore
    const rect = event.target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const yPercent = y / this.itemHeight
    let insertionType: ItemDroppedInsertionType
    const drop_thresholds = this.allowChildDrop ?
      DROP_THRESHOLDS_WITH_CHILD_DROP : [0.5, 0.5]
    if (yPercent < drop_thresholds[0]) {
      insertionType = ItemDroppedInsertionType.ABOVE
    } else if (yPercent >= drop_thresholds[1]) {
      insertionType = ItemDroppedInsertionType.BELOW
    } else {
      insertionType = ItemDroppedInsertionType.CHILD
    }

    this.itemDropped.emit({
      draggedItemID: itemID,
      receiverItemID: this.node.id,
      insertionType,
    })
  }

  onDragReact = (event: DragEvent) => {
    // @ts-ignore
    const rect = event.target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const yPercent = y / this.itemHeight
    const element = this.decorationContainerRef?.nativeElement
    if (element) {
      element.style.borderTop = ''
      element.style.borderBottom = ''
      element.style.border = ''
      const drop_thresholds = this.allowChildDrop ?
        DROP_THRESHOLDS_WITH_CHILD_DROP : [0.5, 0.5]
      if (yPercent < drop_thresholds[0]) {
        element.style.borderTop = '5px solid #4488ff'
      } else if (yPercent >= drop_thresholds[1]) {
        element.style.borderBottom = '5px solid #4488ff'
      } else {
        element.style.border = '5px solid #44ff44'
      }
    }
  }

  clearDragReact = () => {
    const element = this.decorationContainerRef?.nativeElement
    if (element) {
      element.style.borderTop = ''
      element.style.borderBottom = ''
      element.style.border = ''
    }
  }

  get overdue() {
    return this.node.effectiveDueDate ?
      (this.node.effectiveDueDate < this.dataStore.getCurrentDayID()) : false
  }

  get etaWarningLevel() {
    if (this.node.estimatedDoneDate === undefined ||
      this.node.effectiveDueDate === undefined) {
      return 0
    }
    const delta = this.node.effectiveDueDate - this.node.estimatedDoneDate
    if (delta <= 2) return 2
    if (delta <= 7) return 1
    return 0
  }

  getEffectiveDeferDate() {
    return this.node.effectiveDeferDate ?
      dayIDToDate(this.node.effectiveDeferDate) : undefined
  }

  getEffectiveDueDate() {
    return this.node.effectiveDueDate ?
      dayIDToDate(this.node.effectiveDueDate) : undefined
  }

  getCostHtml() {
    if (this.node.effectiveProgress > 0) {
      if (this.node.effectiveProgress >= this.node.effectiveCost) {
        return `<b>${this.node.effectiveProgress} / ${this.node.effectiveCost}</b>`
      }
      return `<b>${this.node.effectiveProgress}</b> / ${this.node.effectiveCost}`
    }
    return `${this.node.effectiveCost}`
  }

  getEstimatedDoneDate() {
    return this.node.estimatedDoneDate ?
      dayIDToDate(this.node.estimatedDoneDate) : undefined
  }

  getEstimatedDoneDateDeltaText() {
    let value = this.node.estimatedDoneDate ?
      this.node.estimatedDoneDate - this.dataStore.getCurrentDayID() : 0
    return value >= 0 ? `+${value}` : `${value}`
  }

  getEffectiveDueDateDeltaText() {
    let value = this.node.effectiveDueDate ?
      this.node.effectiveDueDate - this.dataStore.getCurrentDayID() : 0
    return value >= 0 ? `+${value}` : `${value}`
  }

  getEffectiveDeferDateDeltaText() {
    let value = this.node.effectiveDeferDate ?
      this.node.effectiveDeferDate - this.dataStore.getCurrentDayID() : 0
    return value >= 0 ? `+${value}` : `${value}`
  }
}
