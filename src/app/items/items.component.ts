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
import Color from 'color'
import {FlatTreeControl} from '@angular/cdk/tree'
import {MatTreeFlatDataSource, MatTreeFlattener} from '@angular/material/tree'
import {DataStore, DataStoreAutoCompleter} from '../data/data-store'
import {BehaviorSubject, Subscription} from 'rxjs'
import {MatDialog} from '@angular/material/dialog'
import {ItemDetailsComponent} from '../item-details/item-details.component'
import {DayID, Item, ItemID, ItemStatus} from '../data/common'
import {debounceTime} from 'rxjs/operators'
import {CdkVirtualScrollViewport} from '@angular/cdk/scrolling'
import {
  ItemDroppedEvent,
  ItemDroppedInsertionType,
} from '../item/item.component'
import {DataAnalyzer, TaskProblemType} from '../data/data-analyzer'

const SEARCH_IDLE_DELAY = 200

export interface ItemNode {
  problem?: TaskProblemType
  estimatedDoneDate?: DayID
  effectiveDeferDate?: DayID
  effectiveDueDate?: DayID
  expandable: boolean
  id: ItemID
  level: number
  name: string
  status: ItemStatus
  effectiveCost: number
  cost: number
  isIndirect: boolean
  color: Color
  canRepeat: boolean
  effectiveProgress: number
}

class ItemFilter {
  showCompleted = false
  showActive = true
  searchQuery: string = ''
  autocompleter?: DataStoreAutoCompleter

  get isSearching() {
    return this.searchQuery !== ''
  }

  process(items: Item[]): Item[] {
    if (!this.showCompleted) {
      items = items.filter(item => item.status !== ItemStatus.COMPLETED)
    }

    if (!this.showActive) {
      items = items.filter(item => item.status !== ItemStatus.ACTIVE)
    }

    if (this.autocompleter !== undefined && this.searchQuery !== '') {
      const resultIDs = new Set(
        this.autocompleter.queryIDs(this.searchQuery))
      items = items.filter(item => resultIDs.has(item.id))
    }

    return items
  }

  onDataStoreUpdated(dataStore: DataStore) {
    this.autocompleter = dataStore.createAutoCompleter()
  }
}

@Component({
  selector: 'app-items',
  templateUrl: './items.component.html',
  styleUrls: ['./items.component.scss'],
})
export class ItemsComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollViewport') scrollViewport?: CdkVirtualScrollViewport
  @ViewChild(
    'scrollViewport', {read: ElementRef}) scrollViewportElement?: ElementRef

  itemHeight = 30
  indentation: number = 20

  filter: ItemFilter = new ItemFilter()
  allowedItemIDs = new Set<ItemID>()
  indirectAllowedItemIDs = new Set<ItemID>()

  private _getChildren = (node: Item) => {
    // NOTE: This will always return a new array, so we can directly modify
    // it
    const children = this.dataStore.getChildren(node)
    return children.filter(item => this.allowedItemIDs.has(item.id))
  }

  private _transformer = (item: Item, level: number): ItemNode => {
    let hasAllowedChild = false
    const childrenIDs = item.childrenIDs
    const numChildren = childrenIDs.length
    for (let i = 0; i < numChildren; ++i) {
      if (this.allowedItemIDs.has(childrenIDs[i])) {
        hasAllowedChild = true
        break
      }
    }
    const tasks = this.dataAnalyzer.getTasks(item.id)
    const problems = this.dataAnalyzer.getTaskProblems(item.id)
    const firstTask = tasks === undefined ? undefined : tasks[0]
    const effectiveInfo = this.dataStore.getEffectiveInfo(item)
    return {
      problem: (problems !== undefined && problems.length > 0 &&
        problems[0].task === firstTask) ? problems[0].type : undefined,
      estimatedDoneDate: this.dataAnalyzer.getEstimatedDoneDate(item.id),
      effectiveDeferDate: effectiveInfo.deferDate,
      effectiveDueDate: effectiveInfo.dueDate,
      expandable: hasAllowedChild,
      id: item.id,
      level: level,
      name: item.name,
      status: item.status,
      effectiveCost: item.effectiveCost,
      cost: item.cost,
      isIndirect: this.indirectAllowedItemIDs.has(item.id),
      color: this.dataStore.getItemColor(item),
      canRepeat: item.repeat !== undefined &&
        !effectiveInfo.hasAncestorRepeat,
      effectiveProgress: this.dataAnalyzer.getEffectiveProgress(
        item.id) || 0,
    }
  }

  treeControl = new FlatTreeControl<ItemNode, ItemID>(
    node => node.level, node => node.expandable,
    {
      trackBy: (node) => node.id,
    },
  )

  treeFlattener = new MatTreeFlattener<Item, ItemNode, ItemID>(
    this._transformer, node => node.level, node => node.expandable,
    this._getChildren,
  )

  dataSource = new MatTreeFlatDataSource(this.treeControl, this.treeFlattener)

  private onDataChanged = (dataStore: DataStore) => {
    this.filter.onDataStoreUpdated(dataStore)
    this.refresh()
  }

  private onAnalyzerChanged = (dataAnalyzer: DataAnalyzer) => {
    // TODO implement me
    this.refresh()
  }

  private dataStoreChangeSubscription?: Subscription
  private dataAnalyzerChangeSubscription?: Subscription
  private searchQueryChangeSubscription?: Subscription
  private _searchQuery: string = ''
  private searchQueryValue = new BehaviorSubject<string>(this._searchQuery)

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly dialog: MatDialog,
    private readonly zone: NgZone,
  ) {
    this.dataSource.data = []
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

  hasChild = (_: number, node: ItemNode) => node.expandable

  getPadding(node: ItemNode) {
    return this.treeControl.getLevel(node) * this.indentation + 'px'
  }

  get showCompleted() {
    return this.filter.showCompleted
  }

  set showCompleted(value: boolean) {
    this.filter.showCompleted = value
    this.refresh()
  }

  get showActive() {
    return this.filter.showActive
  }

  set showActive(value: boolean) {
    this.filter.showActive = value
    this.refresh()
  }

  get statusFilter() {
    if (this.filter.showActive) {
      if (this.filter.showCompleted) {
        return 'all'
      } else {
        return 'active'
      }
    } else {
      if (this.filter.showCompleted) {
        return 'completed'
      } else {
        return 'none'
      }
    }
  }

  set statusFilter(value: string) {
    this.filter.showActive = false
    this.filter.showCompleted = false
    if (value == 'all') {
      this.filter.showActive = true
      this.filter.showCompleted = true
    } else if (value == 'active') {
      this.filter.showActive = true
    } else if (value == 'completed') {
      this.filter.showCompleted = true
    }
    this.refresh()
  }

  get searchQuery() {
    return this._searchQuery
  }

  set searchQuery(value: string) {
    this._searchQuery = value
    this.searchQueryValue.next(value)
  }

  newItem(parentID?: ItemID) {
    const dialogRef = this.dialog.open(ItemDetailsComponent, {
      width: ItemDetailsComponent.DIALOG_WIDTH,
      data: {
        initialParent: parentID,
      },
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })

    dialogRef.afterClosed().subscribe(result => {
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

    dialogRef.afterClosed().subscribe(result => {
    })
  }

  expandAll() {
    this.treeControl.expandAll()
  }

  collapseAll() {
    this.treeControl.collapseAll()
  }

  addChildItem(node: ItemNode) {
    this.newItem(node.id)
  }

  removeItem(node: ItemNode) {
    this.dataStore.removeItem(node.id)
  }

  /**
   * NOTE: The items tab must be open already
   */
  locateNodeByID(itemID: ItemID) {
    const node = this.getNodeByID(itemID)
    if (node === undefined) return

    this.expandParents(node)
    // TODO This is a hack
    setTimeout(() => {
      const index = this.getDisplayIndex(node) || 0
      this.scrollViewport?.scrollToIndex(index)
    })
  }

  getNodeByID(itemID: ItemID) {
    const {treeControl} = this

    const dataNodes = treeControl.dataNodes
    const size = dataNodes.length
    for (let i = 0; i < size; ++i) {
      const dataNode = dataNodes[i]
      if (dataNode.id === itemID) {
        return dataNode
      }
    }
    return undefined
  }

  getDisplayIndex(node: ItemNode): number | undefined {
    const nodes = this.dataSource._expandedData.value
    const size = nodes.length
    const itemID = node.id
    for (let i = 0; i < size; ++i) {
      if (nodes[i].id === itemID) {
        return i
      }
    }
    return undefined
  }

  expandParents(node: ItemNode) {
    const parent = this.getParent(node)

    if (parent) {
      this.treeControl.expand(parent)
      this.expandParents(parent)
    }
  }

  getParent(node: ItemNode) {
    const {treeControl} = this
    const currentLevel = treeControl.getLevel(node)

    if (currentLevel < 1) {
      return null
    }

    const startIndex = treeControl.dataNodes.indexOf(node) - 1

    for (let i = startIndex; i >= 0; i--) {
      const currentNode = treeControl.dataNodes[i]

      if (treeControl.getLevel(currentNode) < currentLevel) {
        return currentNode
      }
    }
  }

  updateAllowedItems() {
    const items: Item[] = []
    this.dataStore.state.items.forEach((item) => {
      items.push(item)
    })
    const allowedItems = this.filter.process(items)
    this.allowedItemIDs = new Set(allowedItems.map(item => item.id))
    this.indirectAllowedItemIDs = new Set()

    // If an item is allowed, its parents should too
    const size = allowedItems.length
    for (let i = 0; i < size; i++) {
      let parentID = allowedItems[i].parentID
      while (parentID !== undefined) {
        if (!this.allowedItemIDs.has(parentID)) {
          this.allowedItemIDs.add(parentID)
          this.indirectAllowedItemIDs.add(parentID)
        }
        const parent = this.dataStore.getItem(parentID)
        if (parent !== undefined) {
          parentID = parent.parentID
        } else {
          parentID = undefined
        }
      }
    }
  }

  private refresh() {
    this.updateAllowedItems()
    this.dataSource.data = this.dataStore.getRootItems()
      .filter(item => this.allowedItemIDs.has(item.id))
    if (this.filter.isSearching) {
      this.treeControl.expandAll()
    }
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
    this.treeControl.collapse(node)
    event.dataTransfer?.setData('text', 'itemID ' + node.id.toString())
  }

  onItemDropped(event: ItemDroppedEvent) {
    const {draggedItemID, receiverItemID, insertionType} = event
    if (insertionType === ItemDroppedInsertionType.CHILD) {
      if (!this.dataStore.canBeParentOf(
        draggedItemID, receiverItemID)) {
        return
      }
      const item = this.dataStore.getItem(draggedItemID)
      if (item !== undefined) {
        const draft = item.toDraft()
        draft.parentID = receiverItemID
        this.dataStore.updateItem(draft)
      }
    } else {
      if (draggedItemID === receiverItemID) return
      const parentID = this.dataStore.getItem(receiverItemID)?.parentID
      const item = this.dataStore.getItem(draggedItemID)
      if (item !== undefined) {
        const draft = item.toDraft()
        const insert = insertionType ===
        ItemDroppedInsertionType.BELOW ?
          'below' : 'above'
        draft.parentID = parentID
        this.dataStore.updateItem(
          draft, {anchor: receiverItemID, insert})
      }
    }
  }
}
