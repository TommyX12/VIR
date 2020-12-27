import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core'
import {ItemNode} from '../items/items.component'
import {DataStore, ItemStatus} from '../data/data-store'
import {ItemID} from '../data/common'

const DRAG_REACTION_DELAY = 100
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
export class ItemComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('container') containerRef?: ElementRef
  @ViewChild('decorationContainer') decorationContainerRef?: ElementRef

  // @ts-ignore
  @Input() node: ItemNode

  /**
   * This is for correctly computing drag and drop
   */
  @Input() itemHeight: number = 35

  @Output() bodyClicked = new EventEmitter()
  @Output() itemDropped = new EventEmitter<ItemDroppedEvent>()

  private dragReactionDelayHandle?: any

  private onDragEnter = (event: DragEvent) => {
    event.preventDefault()
  }

  private onDragOver = (event: DragEvent) => {
    event.preventDefault()

    if (this.dragReactionDelayHandle !== undefined) return

    this.dragReactionDelayHandle = setTimeout(() => {
      this.onDragReact(event)
      this.dragReactionDelayHandle = undefined
    }, DRAG_REACTION_DELAY)
  }

  private onDragLeave = (event: DragEvent) => {
    if (this.dragReactionDelayHandle !== undefined) {
      clearTimeout(this.dragReactionDelayHandle)
      this.dragReactionDelayHandle = undefined
    }
    this.clearDragReact()
  }

  constructor(
    private readonly dataStore: DataStore,
    private readonly zone: NgZone,
  ) {
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.containerRef?.nativeElement?.addEventListener(
        'dragenter', this.onDragEnter)
      this.containerRef?.nativeElement?.addEventListener(
        'dragover', this.onDragOver)
      this.containerRef?.nativeElement?.addEventListener(
        'dragleave', this.onDragLeave)
    })
  }

  ngOnDestroy() {
    this.containerRef?.nativeElement?.removeEventListener(
      'dragenter', this.onDragEnter)
    this.containerRef?.nativeElement?.removeEventListener(
      'dragover', this.onDragOver)
    this.containerRef?.nativeElement?.removeEventListener(
      'dragleave', this.onDragLeave)
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
    if (this.dragReactionDelayHandle !== undefined) {
      clearTimeout(this.dragReactionDelayHandle)
      this.dragReactionDelayHandle = undefined
    }
    this.clearDragReact()

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

  onDragReact(event: DragEvent) {
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

  clearDragReact() {
    const element = this.decorationContainerRef?.nativeElement
    if (element) {
      element.style.borderTop = ''
      element.style.borderBottom = ''
      element.style.border = ''
    }
  }
}
