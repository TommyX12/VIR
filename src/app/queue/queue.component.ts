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
import {
  DataStore,
  DataStoreAutoCompleter,
  DataStoreState,
} from '../data/data-store'
import {BehaviorSubject, Subscription} from 'rxjs'
import {MatDialog} from '@angular/material/dialog'
import {ItemDetailsComponent} from '../item-details/item-details.component'
import {Item, ItemID} from '../data/common'
import {debounceTime} from 'rxjs/operators'
import {CdkVirtualScrollViewport} from '@angular/cdk/scrolling'
import {
  ItemDroppedEvent,
  ItemDroppedInsertionType,
} from '../item/item.component'
import {ItemNode} from '../items/items.component'

const SEARCH_IDLE_DELAY = 200

class ItemFilter {
  searchQuery: string = ''
  autocompleter?: DataStoreAutoCompleter

  get isSearching() {
    return this.searchQuery !== ''
  }

  process(items: Item[]): Item[] {
    if (this.autocompleter !== undefined && this.searchQuery !== '') {
      const resultIDs = new Set(this.autocompleter.queryIDs(this.searchQuery))
      items = items.filter(item => resultIDs.has(item.id))
    }

    return items
  }

  onDataStoreUpdated(dataStore: DataStore) {
    this.autocompleter = dataStore.createAutoCompleter()
  }
}

@Component({
  selector: 'app-queue',
  templateUrl: './queue.component.html',
  styleUrls: ['./queue.component.scss'],
})
export class QueueComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollViewport') scrollViewport?: CdkVirtualScrollViewport
  @ViewChild(
    'scrollViewport', {read: ElementRef}) scrollViewportElement?: ElementRef

  itemHeight = 35

  filter: ItemFilter = new ItemFilter()
  allowedItemIDs = new Set<ItemID>()

  private lastState?: DataStoreState

  private onDataChanged = (dataStore: DataStore) => {
    if (dataStore.state === this.lastState) {
      return
    }
    this.lastState = dataStore.state
    this.filter.onDataStoreUpdated(dataStore)
    this.refresh()
  }

  private dataStoreChangeSubscription?: Subscription
  private searchQueryChangeSubscription?: Subscription
  private _searchQuery: string = ''
  private searchQueryValue = new BehaviorSubject<string>(this._searchQuery)

  data: ItemNode[] = []

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataStore: DataStore,
    private readonly dialog: MatDialog,
    private readonly zone: NgZone,
  ) {
  }

  ngOnInit() {
    this.subscribeToData()

    this.searchQueryChangeSubscription = this.searchQueryValue.pipe(
      debounceTime(SEARCH_IDLE_DELAY),
    ).subscribe((value) => {
      this.filter.searchQuery = value
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

  newItem(priorityPredecessor?: ItemID) {
    const dialogRef = this.dialog.open(ItemDetailsComponent, {
      width: ItemDetailsComponent.DIALOG_WIDTH,
      data: {
        initialColor: this.dataStore.generateColor(),
        initialPriorityPredecessor: priorityPredecessor,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  openDetails(id: ItemID) {
    const item = this.dataStore.getItem(id)
    const dialogRef = this.dialog.open(ItemDetailsComponent, {
      width: ItemDetailsComponent.DIALOG_WIDTH,
      data: {item},
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  removeItem(node: ItemNode) {
    this.dataStore.removeItem(node.id)
  }

  /**
   * NOTE: The queue tab must be open already
   */
  locateNodeByID(itemID: ItemID) {
    // TODO This is a hack
    setTimeout(() => {
      const index = this.getDisplayIndex(itemID) || 0
      this.scrollViewport?.scrollToIndex(index)
    })
  }

  getDisplayIndex(itemID: ItemID): number | undefined {
    const size = this.data.length
    for (let i = 0; i < size; ++i) {
      if (this.data[i].id === itemID) {
        return i
      }
    }
    return undefined
  }

  updateAllowedItems() {
    const items: Item[] = []
    this.dataStore.state.items.forEach((item) => {
      items.push(item)
    })
    const allowedQueue = this.filter.process(items)
    this.allowedItemIDs = new Set(allowedQueue.map(item => item.id))
  }

  private refresh() {
    this.updateAllowedItems()
    this.data = this.dataStore.state.queue.filter(
      itemID => this.allowedItemIDs.has(itemID)).map(itemID => {
      const item = this.dataStore.getItem(itemID)!
      return {
        isIndirect: false,
        level: 0,
        expandable: item.childrenIDs.length > 0,
        id: item.id,
        name: this.dataStore.getQualifiedName(item),
        status: item.status,
        cost: item.cost,
        color: this.dataStore.getItemColor(item),
      }
    })
    this.changeDetectorRef.detectChanges()
  }

  trackByFn(index, node: ItemNode) {
    return node.id
  }

  subscribeToData() {
    if (this.dataStoreChangeSubscription === undefined) {
      this.dataStoreChangeSubscription =
        this.dataStore.onChange.subscribe(this.onDataChanged)
    }
  }

  unsubscribeFromData() {
    this.dataStoreChangeSubscription?.unsubscribe()
    this.dataStoreChangeSubscription = undefined
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

  onNodeDragStart(node: ItemNode, event: DragEvent) {
    event.dataTransfer?.setData('text', 'itemID ' + node.id.toString())
  }

  onItemDropped(event: ItemDroppedEvent) {
    if (event.insertionType === ItemDroppedInsertionType.ABOVE) {
      this.dataStore.queueMoveToBefore(
        event.draggedItemID, event.receiverItemID)
    } else if (event.insertionType === ItemDroppedInsertionType.BELOW) {
      this.dataStore.queueMoveToAfter(event.draggedItemID, event.receiverItemID)
    }
  }

  addItemAfter(node: ItemNode) {
    this.newItem(node.id)
  }
}
