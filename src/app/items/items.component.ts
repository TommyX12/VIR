import {ChangeDetectorRef, Component, OnDestroy, OnInit} from '@angular/core'
import Color from 'color'
import {FlatTreeControl} from '@angular/cdk/tree'
import {MatTreeFlatDataSource, MatTreeFlattener} from '@angular/material/tree'
import {
  DataStore,
  DataStoreAutoCompleter,
  DataStoreState,
  Item,
  ItemStatus,
} from '../data/data-store'
import {BehaviorSubject, Subscription} from 'rxjs'
import {MatDialog} from '@angular/material/dialog'
import {ItemDetailsComponent} from '../item-details/item-details.component'
import {ItemID} from '../data/common'
import {debounceTime} from 'rxjs/operators'
import {CdkDragRelease, CdkDragStart} from '@angular/cdk/drag-drop'

const DIALOG_WIDTH = '500px'

const SEARCH_IDLE_DELAY = 200

export interface ItemNode {
  expandable: boolean
  id: ItemID
  level: number
  name: string
  status: ItemStatus
  cost: number
  priority: number
  isIndirect: boolean
  color: Color
  isDragging: boolean
}

class ItemFilter {
  showCompleted = false
  searchQuery: string = ''
  autocompleter?: DataStoreAutoCompleter

  get isSearching() {
    return this.searchQuery !== ''
  }

  process(items: Item[]): Item[] {
    if (!this.showCompleted) {
      items = items.filter(item => item.status !== ItemStatus.COMPLETED)
    }

    if (this.autocompleter !== undefined && this.searchQuery !== '') {
      const resultIDs = new Set(this.autocompleter.queryIDs(this.searchQuery))
      items = items.filter(item => resultIDs.has(item.id))
    }

    return items
  }

  onDataStoreUpdated(dataStore: DataStore) {
    this.autocompleter = dataStore.getAutoCompleter()
  }
}

@Component({
  selector: 'app-items',
  templateUrl: './items.component.html',
  styleUrls: ['./items.component.scss'],
})
export class ItemsComponent implements OnInit, OnDestroy {
  itemHeight = 35
  indentation: number = 20

  filter: ItemFilter = new ItemFilter()
  allowedItemIDs = new Set<ItemID>()
  indirectAllowedItemIDs = new Set<ItemID>()

  private _getChildren = (node: Item) => {
    // NOTE: This will always return a new array, so we can directly modify it
    const children = this.dataStore.getChildren(node)
    return children.filter(item => this.allowedItemIDs.has(item.id))
  }

  private _transformer = (node: Item, level: number): ItemNode => {
    let hasAllowedChild = false
    const childrenIDs = node.childrenIDs
    const numChildren = childrenIDs.length
    for (let i = 0; i < numChildren; ++i) {
      if (this.allowedItemIDs.has(childrenIDs[i])) {
        hasAllowedChild = true
        break
      }
    }
    return {
      expandable: hasAllowedChild,
      id: node.id,
      level: level,
      name: node.name,
      status: node.status,
      cost: node.cost,
      priority: node.priority,
      isIndirect: this.indirectAllowedItemIDs.has(node.id),
      color: node.color || this.dataStore.getItemColor(node.parentID),
      isDragging: false,
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

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataStore: DataStore,
    private readonly dialog: MatDialog,
  ) {
    this.dataSource.data = []
  }

  ngOnInit() {
    this.dataStoreChangeSubscription =
      this.dataStore.onChange.subscribe(this.onDataChanged)
    this.searchQueryChangeSubscription = this.searchQueryValue.pipe(
      debounceTime(SEARCH_IDLE_DELAY),
    ).subscribe((value) => {
      this.filter.searchQuery = value
      this.refresh()
    })
  }

  ngOnDestroy() {
    this.dataStoreChangeSubscription?.unsubscribe()
    this.searchQueryChangeSubscription?.unsubscribe()
  }

  hasChild = (_: number, node: ItemNode) => node.expandable

  get showCompleted() {
    return this.filter.showCompleted
  }

  set showCompleted(value: boolean) {
    this.filter.showCompleted = value
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
      width: DIALOG_WIDTH,
      data: {
        initialColor: parentID === undefined ? this.dataStore.generateColor() :
          undefined,
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
      width: DIALOG_WIDTH,
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

  locateNodeByID(itemID: ItemID) {
    // TODO
  }

  expandParents(node: ItemNode) {
    const parent = this.getParent(node)

    if (parent && parent.level > 0) {
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

  refresh() {
    this.updateAllowedItems()
    this.dataSource.data = this.dataStore.getRootItems()
      .filter(item => this.allowedItemIDs.has(item.id))
    if (this.filter.isSearching) {
      this.treeControl.expandAll()
    }
    this.changeDetectorRef.detectChanges()
  }

  onDragStarted(node: ItemNode, event: CdkDragStart) {
    this.treeControl.collapse(node)
    node.isDragging = true
  }

  onDragReleased(node: ItemNode, event: CdkDragRelease) {
    // This prevents click events from firing
    setTimeout(() => {
      node.isDragging = false
    })
    event.source.reset()
  }
}
