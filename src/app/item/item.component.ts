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

const DROP_THRESHOLDS = [0.4, 0.666]

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

  @Output() bodyClicked = new EventEmitter()
  @Output() itemDropped = new EventEmitter<ItemDroppedEvent>()

  constructor(
    private readonly dataStore: DataStore,
    private readonly zone: NgZone,
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

  set done(value: boolean) {
    const draft = this.dataStore.getItem(this.node.id)!.toDraft()
    draft.status = value ? ItemStatus.COMPLETED : ItemStatus.ACTIVE
    this.dataStore.updateItem(draft)
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
    if (yPercent < DROP_THRESHOLDS[0]) {
      insertionType = ItemDroppedInsertionType.ABOVE
    } else if (yPercent > DROP_THRESHOLDS[1]) {
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
      if (yPercent < DROP_THRESHOLDS[0]) {
        element.style.borderTop = '5px solid #4488ff'
      } else if (yPercent > DROP_THRESHOLDS[1]) {
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
}
