import Color from 'color'
import convert from 'color-convert'
import produce, {Draft, immerable} from 'immer'
import {random, removeValue} from '../util/util'
import {DayID, ItemID, SessionData} from './common'
import {Injectable} from '@angular/core'
import {BehaviorSubject} from 'rxjs'
import Fuse from 'fuse.js'

export enum ItemStatus {
  ACTIVE,
  COMPLETED,
}

export class Item {
  [immerable] = true

  constructor(
    public readonly id: ItemID,
    public readonly name: string = '',
    public readonly status: ItemStatus = ItemStatus.ACTIVE,
    public readonly cost: number = 1,
    public readonly priority: number = 0,
    public readonly childrenIDs: ItemID[] = [],
    public readonly color?: Color,
    public readonly parentID?: ItemID,
  ) {
  }

  toDraft() {
    return new ItemDraft(
      this.id,
      this.name,
      this.status,
      this.cost,
      this.priority,
      this.color,
      this.parentID,
    )
  }
}

export class ItemDraft {

  constructor(
    public id: ItemID = -1,
    public name: string = '',
    public status: ItemStatus = ItemStatus.ACTIVE,
    public cost: number = 1,
    public priority: number = 0,
    public color?: Color,
    public parentID?: ItemID,
  ) {
  }

  toNewItem(id: ItemID) {
    return new Item(
      id,
      this.name,
      this.status,
      this.cost,
      this.priority,
      [],
      this.color,
      this.parentID,
    )
  }

  applyToItem(item: Draft<Item>) {
    item.name = this.name
    item.status = this.status
    item.cost = this.cost
    item.priority = this.priority
    item.color = this.color
    item.parentID = this.parentID
  }
}

export class DayMap<T> {
  [immerable] = true

  private partitions = new Map<number, Map<DayID, T>>()

  private static readonly PARTITION_SIZE = 30

  constructor(
    private readonly defaultValue?: T,
  ) {
  }

  private static toPartitionID(dayID: DayID) {
    return Math.floor(dayID / DayMap.PARTITION_SIZE)
  }

  private getPartition(dayID: DayID) {
    return this.partitions.get(DayMap.toPartitionID(dayID))
  }

  public get(dayID: DayID) {
    const partition = this.getPartition(dayID)
    if (partition === undefined) {
      return this.defaultValue
    }

    return partition.get(dayID)
  }

  public static set<T>(draft: Draft<DayMap<T>>, dayID: DayID,
                       value: T) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      partition = new Map<DayID, T>()
      // @ts-ignore
      draft.partitions.set(partitionID, partition)
    }

    partition.set(dayID, value)
  }

  public static get<T>(draft: Draft<DayMap<T>>, dayID: DayID) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      // @ts-ignore
      return draft.defaultValue
    }

    return partition.get(dayID)
  }

  public static remove<T>(draft: Draft<DayMap<T>>, dayID: DayID) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      return
    }

    partition.delete(dayID)
    if (partition.size === 0) {
      // @ts-ignore
      draft.partitions.delete(partitionID)
    }
  }
}

export class DayData {
  [immerable] = true

  completed: SessionData[] = []
  scheduled: SessionData[] = []
}

export interface DataStoreState {
  items: Map<ItemID, Item>
  rootItemIDs: ItemID[]
  timelineData: DayMap<DayData>
  nextID: number
}

type DataStoreAutoCompleterData = {
  key: string,
  id: ItemID
}

/**
 * If numCandidates is 0, then no limit will be imposed on the result.
 */
export class DataStoreAutoCompleter {
  private data: DataStoreAutoCompleterData[] = []

  private fuse: Fuse<DataStoreAutoCompleterData>

  private _keyToID = new Map<string, ItemID>()
  private _idToKey = new Map<ItemID, string>()

  constructor(
    dataStore: DataStore,
    public numCandidates: number = 10,
  ) {
    // TODO: optimize: use DFS to reduce the amount of parent-tracing
    const keyCount = new Map<string, number>()
    dataStore.state.items.forEach((item) => {
      const key = DataStoreAutoCompleter.getKey(dataStore, item)
      this.data.push({
        key: key,
        id: item.id,
      })

      if (keyCount.has(key)) {
        keyCount.set(key, keyCount.get(key)! + 1)
      } else {
        keyCount.set(key, 1)
      }
    })

    const numItems = this.data.length
    for (let i = 0; i < numItems; i++) {
      const entry = this.data[i]
      if (keyCount.get(entry.key)! > 1) {
        entry.key += ` (#${entry.id})`
      }
      this._keyToID.set(entry.key, entry.id)
      this._idToKey.set(entry.id, entry.key)
    }

    this.fuse = new Fuse(this.data, {
      keys: ['key'],
      includeScore: true,
      ignoreLocation: true,
      sortFn: (a, b) => {
        if (a.score != b.score) {
          return a.score - b.score
        }
        // @ts-ignore
        return a.item[0].v.localeCompare(b.item[0].v)
      },
    })
  }

  private static getKey(dataStore: DataStore, item: Item) {
    if (item.status === ItemStatus.COMPLETED) {
      return '[DONE] ' + dataStore.getQualifiedString(item)
    }
    return dataStore.getQualifiedString(item)
  }

  queryKeys(pattern: string) {
    let result = this.fuse.search(pattern)
    if (this.numCandidates > 0) {
      result = result.slice(0, this.numCandidates)
    }
    return result.map((entry) => {
      return entry.item.key
    })
  }

  queryIDs(pattern: string) {
    let result = this.fuse.search(pattern)
    if (this.numCandidates > 0) {
      result = result.slice(0, this.numCandidates)
    }
    return result.map((entry) => {
      return entry.item.id
    })
  }

  keyToID(key: string) {
    return this._keyToID.get(key)
  }

  idToKey(itemID: ItemID) {
    return this._idToKey.get(itemID)
  }
}

@Injectable()
export class DataStore {
  private _state: DataStoreState = {
    items: new Map<ItemID, Item>(),
    nextID: 1,
    rootItemIDs: [],
    timelineData: new DayMap<DayData>(new DayData()),
  }

  private undoHistory: DataStoreState[] = []
  private redoHistory: DataStoreState[] = []

  private defaultColor = Color('#000000')

  private onChangeSubject = new BehaviorSubject<DataStore>(this)

  onChange = this.onChangeSubject.asObservable()

  private addItemReducer = produce(
    (draft: Draft<DataStoreState>, itemDraft: ItemDraft) => {
      const id = draft.nextID
      const item = itemDraft.toNewItem(id)
      draft.nextID++
      if (draft.items.has(item.id)) {
        throw new Error(`Item with ID ${item.id} already exists`)
      }
      draft.items.set(item.id, item)
      if (item.parentID === undefined) {
        draft.rootItemIDs.push(item.id)
      } else {
        const parent = draft.items.get(item.parentID)
        if (parent === undefined) {
          throw new Error(`Parent ID ${item.parentID} does not exist`)
        }
        parent.childrenIDs.push(item.id)
      }
    })

  private updateItemReducer = produce(
    (draft: Draft<DataStoreState>, itemDraft: ItemDraft) => {
      const itemID = itemDraft.id
      const item = draft.items.get(itemID)
      if (item === undefined) {
        throw new Error(`Item with ID ${itemID} does not exist`)
      }

      const oldParentID = item.parentID
      const newParentID = itemDraft.parentID

      itemDraft.applyToItem(item)

      if (newParentID !== oldParentID) {
        // Remove from old
        if (oldParentID === undefined) {
          removeValue(draft.rootItemIDs, itemID)
        } else {
          const parent = draft.items.get(oldParentID)
          if (parent === undefined) {
            throw new Error(`Parent ID ${oldParentID} does not exist`)
          }
          removeValue(parent.childrenIDs, itemID)
        }

        // Add to new
        if (newParentID === undefined) {
          draft.rootItemIDs.push(item.id)
        } else {
          const parent = draft.items.get(newParentID)
          if (parent === undefined) {
            throw new Error(`Parent ID ${newParentID} does not exist`)
          }
          parent.childrenIDs.push(item.id)
        }
      }
    })

  private removeItemReducer = produce(
    (draft: Draft<DataStoreState>, itemID: ItemID) => {
      const item = draft.items.get(itemID)
      if (item === undefined) {
        throw new Error(`Item with ID ${itemID} does not exist`)
      }
      this._removeAllChildrenOf(draft, item)
      if (item.parentID === undefined) {
        removeValue(draft.rootItemIDs, itemID)
      } else {
        const parent = draft.items.get(item.parentID)
        if (parent === undefined) {
          throw new Error(`Parent ID ${item.parentID} does not exist`)
        }
        removeValue(parent.childrenIDs, itemID)
      }
      draft.items.delete(itemID)
    })

  /**
   * NOTE: This method will always return a new array.
   */
  getChildren = (item: Item) => {
    const children: Item[] = []
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; ++i) {
      const childID = item.childrenIDs[i]
      const child = this.getItem(childID)
      if (child === undefined) {
        throw new Error(`Child ${childID} not found`)
      }
      children.push(child)
    }
    return children
  }

  private _freezeNotifyAndUndo = false

  maxUndoHistory = 50

  constructor() {
    // TODO remove this
    this.batchEdit(() => {
      let draft = new ItemDraft(-1, 'Hello')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      this.addItem(draft)
      draft = new ItemDraft(-1, 'World')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      this.addItem(draft)
      draft = new ItemDraft(-1, 'Okay')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      this.addItem(draft)
      draft = new ItemDraft(-1, 'QWER')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      draft.parentID = 2
      this.addItem(draft)
      draft = new ItemDraft(-1, 'POIUPOIQWUE')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      draft.parentID = 4
      this.addItem(draft)
      draft = new ItemDraft(-1, 'qvqqvqvq')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      draft.parentID = 2
      this.addItem(draft)
      draft = new ItemDraft(-1, '324142124')
      draft.color =
        Color.rgb(Math.random() * 255, Math.random() * 255, Math.random() * 255)
      draft.parentID = 1
      this.addItem(draft)
      for (let i = 0; i < 200; ++i) {
        let draft = new ItemDraft(-1, 'Hello' + i.toString())
        draft.color =
          Color.rgb(
            Math.random() * 255, Math.random() * 255, Math.random() * 255)
        this.addItem(draft)
      }
    })
  }

  public get state() {
    return this._state
  }

  public addItem(itemDraft: ItemDraft) {
    this.pushUndo()
    this._state = this.addItemReducer(this._state, itemDraft)
    this.notify()
  }

  public updateItem(itemDraft: ItemDraft) {
    this.pushUndo()
    this._state = this.updateItemReducer(this._state, itemDraft)
    this.notify()
  }

  public removeItem(itemID: ItemID) {
    this.pushUndo()
    this._state = this.removeItemReducer(this._state, itemID)
    this.notify()
  }

  public getItem(itemID: ItemID) {
    return this._state.items.get(itemID)
  }

  /**
   * Execute func without triggering any notification or undo.
   * Once func is returned, subscribers will be notified.
   */
  public batchEdit(func: () => void) {
    this._freezeNotifyAndUndo = true
    func()
    this._freezeNotifyAndUndo = false
    this.notify()
  }

  private pushUndo() {
    if (this._freezeNotifyAndUndo) return

    // TODO optimize: use a ring
    this.undoHistory.push(this._state)
    if (this.undoHistory.length > this.maxUndoHistory) {
      this.undoHistory.shift()
    }
    this.redoHistory = []
  }

  canUndo() {
    return this.undoHistory.length > 0
  }

  undo() {
    if (this._freezeNotifyAndUndo) return

    if (this.undoHistory.length > 0) {
      this.redoHistory.push(this._state)
      this._state = this.undoHistory.pop()!
    }
    this.notify()
  }

  canRedo() {
    return this.redoHistory.length > 0
  }

  redo() {
    if (this._freezeNotifyAndUndo) return

    if (this.redoHistory.length > 0) {
      this.undoHistory.push(this._state)
      this._state = this.redoHistory.pop()!
    }
    this.notify()
  }

  private notify() {
    if (this._freezeNotifyAndUndo) return

    this.onChangeSubject.next(this)
  }

  private _removeAllChildrenOf(draft: Draft<DataStoreState>,
                               item: Draft<Item>) {
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; ++i) {
      const childID = item.childrenIDs[i]
      const child = draft.items.get(childID)
      if (child === undefined) {
        throw new Error(`Child ${childID} not found`)
      }
      this._removeAllChildrenOf(draft, child)
      draft.items.delete(childID)
    }
    item.childrenIDs = []
  }

  getItemColor(itemID: ItemID | undefined): Color {
    let result: Color | undefined = undefined
    do {
      if (itemID === undefined) {
        break
      }

      const item = this.getItem(itemID)
      if (item !== undefined) {
        result = item.color
        itemID = item.parentID
      }
    } while (result === undefined)
    return result || this.defaultColor
  }

  getRootItems() {
    const result: Item[] = []
    const numRootItems = this._state.rootItemIDs.length
    for (let i = 0; i < numRootItems; i++) {
      result.push(this.getItem(this._state.rootItemIDs[i])!)
    }
    return result
  }

  generateColor() {
    const [r, g, b] = convert.hsl.rgb(
      random(0, 360), random(50, 100), random(50, 75))
    return Color.rgb(r, g, b)
  }

  getAutoCompleter() {
    return new DataStoreAutoCompleter(this)
  }

  getQualifiedString(item: Item) {
    let result = item.name
    while (item.parentID !== undefined) {
      const parent = this.getItem(item.parentID)
      if (parent === undefined) {
        throw new Error(`Parent ID ${item.parentID} not found`)
      }
      item = parent
      result = item.name + ':' + result
    }
    return result
  }

  canBeParentOf(itemID: ItemID, parentID: ItemID) {
    let p: ItemID | undefined = parentID
    while (p !== undefined) {
      if (itemID === p) return false
      const parent = this.getItem(p)
      if (parent === undefined) {
        break
      }
      p = parent.parentID
    }

    return true
  }
}
