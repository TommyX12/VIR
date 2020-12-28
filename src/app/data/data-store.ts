import Color from 'color'
import convert from 'color-convert'
import produce, {Draft, immerable} from 'immer'
import {getOrCreate, random, removeValue} from '../util/util'
import {DayID, Item, ItemDraft, ItemID, ItemStatus, SessionType} from './common'
import {Injectable} from '@angular/core'
import {BehaviorSubject} from 'rxjs'
import {dayIDNow} from '../util/time-util'

export enum SessionModificationType {
  SET,
  ADD,
}

function applySessionModification(existingCount: number,
                                  modification: SessionModificationType,
                                  count: number): number {
  let result = 0
  if (modification === SessionModificationType.SET) {
    result = count
  } else if (modification === SessionModificationType.ADD) {
    result = existingCount + count
  } else {
    result = existingCount
  }
  return Math.max(0, result)
}

export class DayMap<T> {
  [immerable] = true

  private partitions = new Map<number, Map<DayID, T>>()

  private static readonly PARTITION_SIZE = 30

  constructor() {
  }

  private static toPartitionID(dayID: DayID) {
    return Math.floor(dayID / DayMap.PARTITION_SIZE)
  }

  private getPartition(dayID: DayID) {
    return this.partitions.get(DayMap.toPartitionID(dayID))
  }

  public tryGet(dayID: DayID) {
    const partition = this.getPartition(dayID)
    if (partition === undefined) {
      return undefined
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

  public static tryGet<T>(draft: Draft<DayMap<T>>, dayID: DayID) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      return undefined
    }

    return partition.get(dayID)
  }

  public static getOrCreate<T>(draft: Draft<DayMap<T>>, dayID: DayID,
                               creator: () => T) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      partition = new Map<DayID, T>()
      // @ts-ignore
      draft.partitions.set(partitionID, partition)
    }

    let result = partition.get(dayID)
    if (result === undefined) {
      result = creator()
      partition.set(dayID, result)
    }
    return result
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

  forEach(func: (item: T, dayID: DayID) => void) {
    this.partitions.forEach(partition => {
      partition.forEach(func)
    })
  }
}

export class DayData {
  [immerable] = true

  sessions = new Map<SessionType, Map<ItemID, number>>()
}

export interface DataStoreState {
  items: Map<ItemID, Item>
  rootItemIDs: ItemID[]
  timelineData: DayMap<DayData>
  nextID: number
}

export interface DataStoreAutoCompleterData {
  key: string
  id: ItemID
}

export interface DataStoreAutoCompleterResult {
  key: string
  id: ItemID
  score: number
}

/**
 * If numCandidates is 0, then no limit will be imposed on the result.
 */
export class DataStoreAutoCompleter {
  private data: DataStoreAutoCompleterData[] = []

  private _keyToID = new Map<string, ItemID>()
  private _idToKey = new Map<ItemID, string>()

  constructor(
    dataStore: DataStore,
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
  }

  private static getKey(dataStore: DataStore, item: Item) {
    if (item.status === ItemStatus.COMPLETED) {
      return '[DONE] ' + dataStore.getQualifiedString(item)
    }
    return dataStore.getQualifiedString(item)
  }

  query(pattern: string,
        numCandidates: number = 0): DataStoreAutoCompleterResult[] {
    let result: DataStoreAutoCompleterResult[] = []

    pattern = pattern.toLowerCase()

    const numEntries = this.data.length
    for (let i = 0; i < numEntries; ++i) {
      const data = this.data[i]
      const key = data.key.toLowerCase()
      const patternLen = pattern.length
      const keyLen = key.length

      let forwardScore = 0
      let a = 0
      let b = 0
      let lastMatchedB = -1
      while (a < patternLen && b < keyLen) {
        if (pattern.charAt(a) === key.charAt(b)) {
          ++a
          if (lastMatchedB === -1) {
            ++forwardScore
          } else {
            forwardScore += 1.0 / (b - lastMatchedB)
            lastMatchedB = b
          }
        }
        ++b
      }

      if (a !== patternLen) continue // No match

      let backwardScore = 0
      a = patternLen - 1
      b = keyLen - 1
      lastMatchedB = -1
      while (a >= 0 && b >= 0) {
        if (pattern.charAt(a) === key.charAt(b)) {
          --a
          if (lastMatchedB === -1) {
            ++backwardScore
          } else {
            backwardScore += 1.0 / (lastMatchedB - b)
            lastMatchedB = b
          }
        }
        --b
      }

      const lengthScore = patternLen / keyLen
      const score = Math.max(forwardScore, backwardScore) + lengthScore

      result.push({
        key: data.key, id: data.id, score,
      })
    }

    result.sort((a, b) => {
      if (a.score != b.score) {
        return b.score - a.score
      }
      return a.key.localeCompare(b.key)
    })

    if (numCandidates > 0) {
      result = result.slice(0, numCandidates)
    }

    return result
  }

  queryKeys(pattern: string, numCandidates: number = 0) {
    return this.query(pattern, numCandidates).map((entry) => {
      return entry.key
    })
  }

  queryIDs(pattern: string, numCandidates: number = 0) {
    return this.query(pattern, numCandidates).map((entry) => {
      return entry.id
    })
  }

  keyToID(key: string) {
    return this._keyToID.get(key)
  }

  idToKey(itemID: ItemID) {
    return this._idToKey.get(itemID)
  }
}

function insertWithOptions(array: ItemID[], entry: ItemID,
                           options: UpdateItemOptions) {
  let anchorIndex = -1
  if (options.anchor !== undefined) {
    anchorIndex = array.indexOf(options.anchor)
  }

  if (anchorIndex >= 0) {
    const insert = options.insert || 'above'
    if (insert === 'below') {
      anchorIndex++
    }
    array.splice(anchorIndex, 0, entry)
  } else {
    array.push(entry)
  }
}

export interface UpdateItemOptions {
  anchor?: ItemID
  insert?: 'above' | 'below'
}

@Injectable()
export class DataStore {
  private _state: DataStoreState = {
    items: new Map<ItemID, Item>(),
    nextID: 1,
    rootItemIDs: [],
    timelineData: new DayMap<DayData>(),
  }

  private undoHistory: DataStoreState[] = []
  private redoHistory: DataStoreState[] = []

  private defaultColor = Color('#888888')

  static readonly defaultDayData = new DayData()

  private onChangeSubject = new BehaviorSubject<DataStore>(this)

  onChange = this.onChangeSubject.asObservable()

  private addItemReducer = (draft: Draft<DataStoreState>,
                            itemDraft: ItemDraft) => {
    const id = draft.nextID
    const item = itemDraft.toNewItem(id)
    draft.nextID++
    if (draft.nextID <= id) {
      throw new Error('Item ID overflow')
    }
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
  }

  private updateItemReducer = (draft: Draft<DataStoreState>,
                               itemDraft: ItemDraft,
                               options: UpdateItemOptions) => {
    const itemID = itemDraft.id
    const item = draft.items.get(itemID)
    if (item === undefined) {
      throw new Error(`Item with ID ${itemID} does not exist`)
    }

    const oldParentID = item.parentID
    const newParentID = itemDraft.parentID

    itemDraft.applyToItem(item)

    if (newParentID !== oldParentID || options.anchor !== undefined) {
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
        insertWithOptions(draft.rootItemIDs, item.id, options)
      } else {
        const parent = draft.items.get(newParentID)
        if (parent === undefined) {
          throw new Error(`Parent ID ${newParentID} does not exist`)
        }
        insertWithOptions(parent.childrenIDs, item.id, options)
      }
    }
  }

  private removeItemReducer = (draft: Draft<DataStoreState>,
                               itemID: ItemID) => {
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
    this.invalidateItemID(draft, itemID)
  }

  private editSessionReducer = (draft: Draft<DataStoreState>, dayID: DayID,
                                type: SessionType, itemID: ItemID,
                                modification: SessionModificationType,
                                count: number) => {
    // TODO optimize: remove day data that is equal to default/empty

    const dayData = DayMap.getOrCreate(
      draft.timelineData, dayID, () => new DayData())

    const sessionsOfType = getOrCreate(
      dayData.sessions, type,
      () => new Map<ItemID, number>(),
    )
    const existingCount = getOrCreate(sessionsOfType, itemID, () => 0)
    const newCount = applySessionModification(
      existingCount, modification, count)
    if (newCount === 0) {
      sessionsOfType.delete(itemID)
    } else {
      sessionsOfType.set(itemID, newCount)
    }
  }

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

  private _freezeNotifyAndUndo = 0

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

      this.addSession(dayIDNow(), SessionType.COMPLETED, 1, 3)
      this.addSession(dayIDNow(), SessionType.PROJECTED, 2, 4)
      this.addSession(dayIDNow() + 1, SessionType.SCHEDULED, 3, 6)
    })
    this.clearUndo()
  }

  public get state() {
    return this._state
  }

  public addItem(itemDraft: ItemDraft) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.addItemReducer(draft, itemDraft)
      })
    this.notify()
  }

  public updateItem(itemDraft: ItemDraft, options: UpdateItemOptions = {}) {
    this.pushUndo()
    this._state = produce(
      this._state,
      draft => {
        this.updateItemReducer(draft, itemDraft, options)
      },
    )
    this.notify()
  }

  public removeItem(itemID: ItemID) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.removeItemReducer(draft, itemID)
      })
    this.notify()
  }

  public getItem(itemID: ItemID) {
    return this._state.items.get(itemID)
  }

  private editSession(dayID: DayID, type: SessionType, itemID: ItemID,
                      modification: SessionModificationType,
                      count: number = 1) {
    this.pushUndo()
    this._state = produce(
      this._state,
      draft => {
        this.editSessionReducer(draft, dayID, type, itemID, modification, count)
      },
    )
    this.notify()
  }

  public addSession(dayID: DayID, type: SessionType, itemID: ItemID,
                    count: number = 1) {
    this.editSession(dayID, type, itemID, SessionModificationType.ADD, count)
  }

  public removeSession(dayID: DayID, type: SessionType, itemID: ItemID,
                       count: number = 1) {
    this.editSession(dayID, type, itemID, SessionModificationType.ADD, -count)
  }

  private setSession(dayID: DayID, type: SessionType, itemID: ItemID,
                     count: number = 1) {
    this.editSession(dayID, type, itemID, SessionModificationType.SET, count)
  }

  public getDayData(dayID: DayID) {
    return this._state.timelineData.tryGet(dayID) || DataStore.defaultDayData
  }

  /**
   * Execute func without triggering any notification or undo.
   * Once func is returned, subscribers will be notified.
   */
  public batchEdit(func: (dataStore: DataStore) => void) {
    if (this._freezeNotifyAndUndo === 0) {
      this.pushUndo()
    }
    this._freezeNotifyAndUndo++
    func(this)
    this._freezeNotifyAndUndo--
    if (this._freezeNotifyAndUndo === 0) {
      this.notify()
    }
  }

  clearUndo() {
    this.undoHistory = []
    this.redoHistory = []
  }

  private pushUndo() {
    if (this._freezeNotifyAndUndo > 0) return

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
    if (this._freezeNotifyAndUndo > 0) return

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
    if (this._freezeNotifyAndUndo > 0) return

    if (this.redoHistory.length > 0) {
      this.undoHistory.push(this._state)
      this._state = this.redoHistory.pop()!
    }
    this.notify()
  }

  private notify() {
    if (this._freezeNotifyAndUndo > 0) return

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
      this.invalidateItemID(draft, childID)
    }
    item.childrenIDs = []
  }

  /**
   * NOTE: This function searches for itemID references (e.g. sessions) using
   * the current state, not the given draft.
   * Keep this in mind before chaining reducers on drafts.
   */
  private invalidateItemID(draft: Draft<DataStoreState>, itemID: ItemID) {
    this._state.timelineData.forEach((dayData, dayID) => {
      dayData.sessions.forEach((sessions, type) => {
        sessions.forEach((count, sessionItemID) => {
          if (sessionItemID === itemID) {
            draft.timelineData.tryGet(dayID)!.sessions.get(type)!.delete(itemID)
          }
        })
      })
    })
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
