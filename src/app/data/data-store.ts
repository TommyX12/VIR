import Color from 'color'
import convert from 'color-convert'
import produce, {Draft, immerable} from 'immer'
import {arrayMove, getOrCreate, random, removeValue} from '../util/util'
import {
  DayID,
  DEFAULT_REPEATER_BY_ID,
  Item,
  ItemDraft,
  ItemID,
  ItemStatus,
  RepeatType,
  SessionType,
} from './common'
import {Injectable} from '@angular/core'
import {BehaviorSubject} from 'rxjs'
import {dayIDNow} from '../util/time-util'
import {Task} from './data-analyzer'

export interface InvalidItemError {
  type: string
  message: string
}

export interface InvalidSessionError {
  type: string
  message: string
}

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

  private static toDayID(partitionID: number) {
    return partitionID * DayMap.PARTITION_SIZE
  }

  private getPartition(dayID: DayID) {
    return this.partitions.get(DayMap.toPartitionID(dayID))
  }

  public getEarliestDayID() {
    let earliestPartitionID: number | undefined = undefined
    this.partitions.forEach((_, partitionID) => {
      if (earliestPartitionID === undefined || partitionID <
        earliestPartitionID) {
        earliestPartitionID = partitionID
      }
    })
    if (earliestPartitionID === undefined) return undefined

    let earliestDayID: number | undefined = undefined
    this.partitions.get(earliestPartitionID)!.forEach((_, dayID) => {
      if (earliestDayID === undefined || dayID < earliestDayID) {
        earliestDayID = dayID
      }
    })
    if (earliestDayID === undefined) return DayMap.toDayID(earliestPartitionID)
    return earliestDayID
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
  queue: ItemID[]
  rootItemIDs: ItemID[]
  timelineData: DayMap<DayData>
  nextID: number
  startOfDayMinutes: number
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

  constructor(dataStore: DataStore, filter?: (item: Item) => boolean) {
    // TODO: optimize: use DFS to reduce the amount of parent-tracing
    const keyCount = new Map<string, number>()
    dataStore.state.items.forEach((item) => {
      if (!filter || filter(item)) {
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
      return '[DONE] ' + dataStore.getQualifiedName(item)
    }
    return dataStore.getQualifiedName(item)
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

/**
 * NOTE: This will make sure that parent (i.e. prefix) is always after children.
 */
function lexicographicLessThan(a: number[], b: number[]) {
  let count = Math.min(a.length, b.length)
  for (let i = 0; i < count; ++i) {
    if (a[i] < b[i]) return true
    if (a[i] > b[i]) return false
  }
  return a.length >= b.length
}

export interface EffectiveItemInfo {
  deferDate?: DayID
  dueDate?: DayID
  repeat?: RepeatType
  repeatEndDate?: DayID
  repeatInterval: number
  repeatOnCompletion: boolean
  hasAncestorRepeat: boolean
  hasActiveAncestorRepeat: boolean
}

@Injectable()
export class DataStore {
  private _state: DataStoreState = {
    items: new Map<ItemID, Item>(),
    queue: [],
    nextID: 1,
    rootItemIDs: [],
    timelineData: new DayMap<DayData>(),
    startOfDayMinutes: 0,
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

    return id
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

    const oldStatus = item.status
    const newStatus = itemDraft.status

    itemDraft.applyToItem(item)

    // Apply status change to children
    if (oldStatus !== newStatus) {
      this.setDraftSubtreeStatus(draft, item, newStatus)
    }

    // Change parent
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

  private queueMoveReducer = (draft: Draft<DataStoreState>, itemID: ItemID,
                              index: number) => {
    const oldIndex = draft.queue.indexOf(itemID)
    if (oldIndex < 0) return
    arrayMove(draft.queue, oldIndex, index)
  }

  /**
   * Returns whether the repeat is successful (or simply marked as done)
   */
  private repeatSubtreeReducer = (draft: Draft<DataStoreState>,
                                  itemID: ItemID,
                                  subtree: ItemID[]): boolean => {
    const item = draft.items.get(itemID)
    if (item === undefined) return false

    const firstTask: Task = {
      cost: item.cost, end: item.dueDate, itemID, start: item.deferDate,
    }
    if (firstTask.end === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    // Move start and end to today
    let repeatOffset = 0
    if (item.repeatOnCompletion) {
      repeatOffset = this.getCurrentDayID() - firstTask.end
      firstTask.end += repeatOffset
      if (firstTask.start !== undefined) {
        firstTask.start += repeatOffset
      }
    }

    const repeat = item.repeat
    if (repeat === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    const repeater = DEFAULT_REPEATER_BY_ID.get(repeat.id)
    if (repeater === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    const nextTask = repeater(
      firstTask, this.getEffectiveInfo(item), dayIDNow() + 100000000)()

    if (nextTask === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    const count = subtree.length
    for (let i = 0; i < count; i++) {
      const subtreeItem = draft.items.get(subtree[i])
      if (subtreeItem === undefined) continue

      subtreeItem.status = ItemStatus.ACTIVE
      const startOffset = subtreeItem.deferDate === undefined ? undefined :
        firstTask.end - repeatOffset - subtreeItem.deferDate
      const endOffset = subtreeItem.dueDate === undefined ? 0 :
        firstTask.end - repeatOffset - subtreeItem.dueDate

      if (nextTask.end === undefined) {
        subtreeItem.deferDate = undefined
        subtreeItem.dueDate = undefined
        continue
      }

      subtreeItem.deferDate =
        startOffset === undefined ? undefined : nextTask.end - startOffset
      subtreeItem.dueDate =
        endOffset === undefined ? undefined : nextTask.end - endOffset

      if (nextTask.start !== undefined) {
        if (subtreeItem.deferDate !== undefined) {
          subtreeItem.deferDate =
            Math.max(subtreeItem.deferDate, nextTask.start)
        }
        if (subtreeItem.dueDate !== undefined) {
          subtreeItem.dueDate = Math.max(subtreeItem.dueDate, nextTask.start)
        }
      }
    }

    return true
  }

  /**
   * NOTE: This function searches for items in the given draft.
   * This is all thanks to the draft queue containing only primitives.
   */
  private smartInsertItemToQueueReducer = (draft: Draft<DataStoreState>,
                                           itemID: ItemID) => {
    // TODO improve this heuristic

    const item = this.getItem(itemID)
    if (item === undefined) return

    let queue = draft.queue
    let queueSize = queue.length

    let start = 0
    let end = queueSize // exclusive
    const selfDueDate = this.getEffectiveDueDate(item)
    if (selfDueDate === undefined) {
      // Search for the last item with deadline
      // for (let i = queueSize - 1; i >= 0; --i) {
      //   if (this.getItem(queue[i])!.dueDate !== undefined) {
      //     start = i + 1
      //     break
      //   }
      // }
    } else {
      let foundLowerBound = false
      let foundUpperBound = false
      start = 0
      end = 0
      for (let i = 0; i < queueSize; ++i) {
        const dueDate = this.getEffectiveDueDate(this.getItem(queue[i])!)
        if (dueDate === undefined) continue
        if (dueDate < selfDueDate) {
          start = i + 1
          end = start
        } else if (!foundLowerBound) { // dueDate === selfDueDate
          start = i
          end = start
          foundLowerBound = true
        }
      }
      for (let i = queueSize - 1; i > start; --i) {
        const dueDate = this.getEffectiveDueDate(this.getItem(queue[i])!)
        if (dueDate === undefined) continue
        if (dueDate > selfDueDate) {
          end = i
        } else if (!foundUpperBound) { // dueDate === selfDueDate
          end = i + 1
          foundUpperBound = true
        }
      }
    }

    if (start >= end) {
      draft.queue.splice(start, 0, itemID)
      return
    } else {
      const scores = this.getLexicographicScores()
      const selfScore = scores.get(itemID) || []
      // TODO draft.items.get(parentID)!.childrenIDs.indexOf(itemID)
      let candidate: number | undefined = undefined
      let candidateScore: number[] | undefined = undefined
      for (let i = start; i < end; ++i) {
        const score = scores.get(queue[i]) || []
        if (lexicographicLessThan(score, selfScore)) {
          if (candidateScore === undefined ||
            lexicographicLessThan(candidateScore, score)) {
            candidate = i
            candidateScore = score
          }
        }
      }

      if (candidate === undefined) {
        draft.queue.splice(start, 0, itemID)
        return
      } else {
        draft.queue.splice(candidate + 1, 0, itemID)
        return
      }
    }
  }

  private removeItemFromQueueReducer = (draft: Draft<DataStoreState>,
                                        itemID: ItemID) => {
    removeValue(draft.queue, itemID)
  }

  private removeItemsFromQueueReducer = (draft: Draft<DataStoreState>,
                                         itemIDs: ItemID[]) => {
    const itemIDSet = new Set(itemIDs)
    draft.queue = draft.queue.filter(value => !itemIDSet.has(value))
  }

  private autoAdjustQueueReducer = (draft: Draft<DataStoreState>) => {
    const queueSize = draft.queue.length
    const datedIndices: number[] = []
    const data: {
      itemID: ItemID,
      dueDate: DayID,
      originalIndex: number,
    }[] = []
    for (let i = 0; i < queueSize; ++i) {
      const itemID = draft.queue[i]
      const item = this.getItem(itemID)
      if (item === undefined) {
        throw new Error('Queue contained invalid itemID')
      }

      const dueDate = this.getEffectiveDueDate(item)
      if (dueDate !== undefined) {
        datedIndices.push(i)
        data.push({
          dueDate, itemID, originalIndex: i,
        })
      }
    }

    data.sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        return a.dueDate - b.dueDate
      }
      return a.originalIndex - b.originalIndex
    })

    const count = datedIndices.length
    for (let i = 0; i < count; ++i) {
      draft.queue[datedIndices[i]] = data[i].itemID
    }
  }

  /**
   * NOTE: This function searches for some items using the current state.
   * Keep this in mind before chaining reducers on drafts.
   */
  private updateAncestorChainStatisticsReducer = (draft: Draft<DataStoreState>,
                                                  initialItemID: ItemID) => {
    let lastUpdatedItemID: ItemID | undefined = undefined
    let itemID: ItemID | undefined = initialItemID
    while (itemID !== undefined) {
      const item = draft.items.get(itemID)
      if (item === undefined) break

      item.effectiveCost = 0
      const childrenIDs = item.childrenIDs
      const numChildren = childrenIDs.length
      for (let j = 0; j < numChildren; j++) {
        const childID = childrenIDs[j]
        const child = (childID === lastUpdatedItemID ?
          draft.items.get(childID) : this.getItem(childID))
        if (child === undefined) continue
        item.effectiveCost += child.effectiveCost
      }
      item.effectiveCost = Math.max(item.effectiveCost, item.cost)

      lastUpdatedItemID = itemID
      itemID = item.parentID
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

  validateItemDraft(draft: ItemDraft, isNewItem: boolean) {
    if (!isNewItem && draft.parentID !== undefined &&
      !this.canBeParentOf(draft.id, draft.parentID)) {
      throw {
        type: 'invalidParent',
        message: 'Error: Invalid parent',
      }
    }

    if (draft.name === '' || draft.name.indexOf(':') !== -1 ||
      draft.name.indexOf('#') !== -1 || draft.name.indexOf('[') !== -1) {
      throw {
        type: 'invalidName',
        message: 'Error: Invalid item name',
      }
    }

    if (draft.cost < 0) {
      throw {
        type: 'invalidCost',
        message: 'Error: Invalid cost',
      }
    }

    if (draft.repeat !== undefined && draft.repeatInterval <= 0) {
      throw {
        type: 'invalidRepeat',
        message: 'Error: Invalid repeat interval',
      }
    }

    if (draft.deferDate !== undefined && draft.dueDate !== undefined &&
      draft.deferDate > draft.dueDate) {
      throw {
        type: 'invalidDeferDateDueDate',
        message: 'Error: Defer date cannot be after due date',
      }
    }
  }

  public addItem(itemDraft: ItemDraft, skipValidation: boolean = false) {
    if (!skipValidation) {
      this.validateItemDraft(itemDraft, true)
    }
    this.pushUndo()
    let id = 0
    const newStatus = itemDraft.status
    this._state =
      produce(this._state, draft => {
        id = this.addItemReducer(draft, itemDraft)
      })
    if (newStatus === ItemStatus.ACTIVE) {
      this._state =
        produce(this._state, draft => {
          this.smartInsertItemToQueueReducer(draft, id)
        })
    }
    this._state =
      produce(this._state, draft => {
        this.updateAncestorChainStatisticsReducer(draft, id)
      })
    this.notify()
  }

  /**
   * Returns whether the item repeated.
   */
  public updateItem(itemDraft: ItemDraft, options: UpdateItemOptions = {},
                    skipValidation: boolean = false) {
    if (!skipValidation) {
      this.validateItemDraft(itemDraft, false)
    }
    this.pushUndo()
    let repeated = false
    const itemID = itemDraft.id
    const item = this.getItem(itemID)
    if (item === undefined) {
      throw new Error(`Item with ID ${itemID} does not exist`)
    }
    const oldStatus = item.status
    const newStatus = itemDraft.status
    const oldParentID = item.parentID
    const newParentID = itemDraft.parentID
    const shouldRepeat = (
      oldStatus !== ItemStatus.COMPLETED &&
      newStatus === ItemStatus.COMPLETED &&
      itemDraft.repeat !== undefined &&
      !this.getHasAncestorRepeat(item)
    )
    this._state = produce(
      this._state,
      draft => {
        this.updateItemReducer(draft, itemDraft, options)
      },
    )
    if (shouldRepeat) {
      const subtree = this.getSubtreeItems(itemID)
      let repeatSuccessful = false
      this._state = produce(this._state, draft => {
        repeatSuccessful = this.repeatSubtreeReducer(draft, itemID, subtree)
      })
      if (repeatSuccessful) {
        repeated = true
        this._state =
          produce(this._state, draft => {
            this.removeItemsFromQueueReducer(draft, subtree)
            subtree.forEach(itemID => {
              this.smartInsertItemToQueueReducer(draft, itemID)
            })
          })
      } else {
        this._state =
          produce(this._state, draft => {
            this.removeItemFromQueueReducer(draft, itemID)
          })
      }
    } else {
      if (oldStatus !== newStatus) {
        if (newStatus === ItemStatus.ACTIVE) {
          this._state =
            produce(this._state, draft => {
              this.smartInsertItemToQueueReducer(draft, itemID)
            })
        } else {
          this._state =
            produce(this._state, draft => {
              this.removeItemFromQueueReducer(draft, itemID)
            })
        }
      }
    }
    if (oldParentID !== newParentID && oldParentID !== undefined) {
      this._state = produce(this._state, draft => {
        this.updateAncestorChainStatisticsReducer(draft, oldParentID)
      })
    }
    this._state = produce(this._state, draft => {
      this.updateAncestorChainStatisticsReducer(draft, itemID)
      this.autoAdjustQueueReducer(draft)
    })
    this.notify()

    return repeated
  }

  public removeItem(itemID: ItemID) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.removeItemReducer(draft, itemID)
      })
    this._state =
      produce(this._state, draft => {
        this.removeItemFromQueueReducer(draft, itemID)
      })
    this.notify()
  }

  public getItem(itemID: ItemID) {
    return this._state.items.get(itemID)
  }

  public hasItem(itemID: ItemID) {
    return this._state.items.has(itemID)
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

  /**
   * Move item to before a specific anchor on queue.
   * NOTE: This function searches for itemID using the current state.
   * Keep this in mind before chaining reducers on drafts.
   */
  public queueMoveToBefore(itemID: ItemID, anchorItemID: ItemID) {
    const anchorIndex = this.state.queue.indexOf(anchorItemID)
    if (anchorIndex < 0) return
    this.queueMoveToIndex(itemID, anchorIndex)
  }

  /**
   * Move item to after a specific anchor on queue.
   * NOTE: This function searches for itemID using the current state.
   * Keep this in mind before chaining reducers on drafts.
   */
  public queueMoveToAfter(itemID: ItemID, anchorItemID: ItemID) {
    const anchorIndex = this.state.queue.indexOf(anchorItemID)
    if (anchorIndex < 0) return
    this.queueMoveToIndex(itemID, anchorIndex + 1)
  }

  /**
   * Move item to before the item pointed to by the given index.
   * NOTE: The item pointed to by the given index is considered *before* moving
   * the old item.
   */
  public queueMoveToIndex(itemID: ItemID, index: number) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.queueMoveReducer(draft, itemID, index)
      })
    this.notify()
  }

  public getDayData(dayID: DayID) {
    return this._state.timelineData.tryGet(dayID) || DataStore.defaultDayData
  }

  /**
   * Execute func without triggering any notification or undo.
   * Once func is returned, subscribers will be notified.
   * NOTE: Make sure to catch any error *inside* the func instead of putting try
   * outside of batchEdit.
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

  public getQueuePredecessor(itemID: ItemID) {
    const index = this.state.queue.indexOf(itemID)
    if (index <= 0) return undefined
    return this.state.queue[index - 1]
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

  getItemColor(item: Item): Color {
    let i: Item | undefined = item
    let result = i.color
    while (i !== undefined && i.tryUseParentColor && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i !== undefined) result = i.color
    }
    return result
  }

  getEffectiveDeferDate(item: Item): DayID | undefined {
    let i: Item | undefined = item
    let result = i.deferDate
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i !== undefined && i.deferDate !== undefined) {
        if (result === undefined) {
          result = i.deferDate
        } else {
          result = Math.max(result, i.deferDate)
        }
      }
    }
    return result
  }

  getEffectiveDueDate(item: Item): DayID | undefined {
    let i: Item | undefined = item
    let result = i.dueDate
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i !== undefined && i.dueDate !== undefined) {
        if (result === undefined) {
          result = i.dueDate
        } else {
          result = Math.min(result, i.dueDate)
        }
      }
    }
    return result
  }

  getHasAncestorRepeat(item: Item): boolean {
    let i: Item | undefined = item
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i !== undefined && i.repeat !== undefined) {
        return true
      }
    }
    return false
  }

  getEffectiveInfo(item: Item): EffectiveItemInfo {
    let i: Item | undefined = item
    let result: EffectiveItemInfo = {
      deferDate: i.deferDate,
      dueDate: i.dueDate,
      repeat: i.repeat,
      repeatEndDate: i.repeatEndDate,
      repeatInterval: i.repeatInterval,
      repeatOnCompletion: i.repeatOnCompletion,
      hasAncestorRepeat: false,
      hasActiveAncestorRepeat: false,
    }
    let minParentDueDate: DayID | undefined = undefined
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i !== undefined && i.deferDate !== undefined) {
        if (result.deferDate === undefined) {
          result.deferDate = i.deferDate
        } else {
          result.deferDate = Math.max(result.deferDate, i.deferDate)
        }
      }
      if (i !== undefined && i.dueDate !== undefined) {
        if (result.dueDate === undefined) {
          result.dueDate = i.dueDate
        } else {
          result.dueDate = Math.min(result.dueDate, i.dueDate)
        }
        if (minParentDueDate === undefined) {
          minParentDueDate = i.dueDate
        } else {
          minParentDueDate = Math.min(minParentDueDate, i.dueDate)
        }
      }
      if (i !== undefined && i.repeat !== undefined) {
        // Use ancestor repeat if exists
        result.repeat = i.repeat
        result.repeatEndDate = i.repeatEndDate
        result.repeatInterval = i.repeatInterval
        result.repeatOnCompletion = i.repeatOnCompletion
        result.hasAncestorRepeat = true
        result.hasActiveAncestorRepeat = i.status !== ItemStatus.COMPLETED
      }
    }
    // Clamp repeat end date to earliest parent due date
    if (minParentDueDate !== undefined) {
      if (result.repeatEndDate === undefined) {
        result.repeatEndDate = minParentDueDate
      } else {
        result.repeatEndDate = Math.min(result.repeatEndDate, minParentDueDate)
      }
    }
    return result
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

  /**
   * NOTE: This is created with current state.
   * Do not use if state is changed.
   */
  createAutoCompleter(filter?: (item: Item) => boolean) {
    return new DataStoreAutoCompleter(this, filter)
  }

  getQualifiedName(item: Item) {
    let result = item.name
    while (item.parentID !== undefined) {
      const parent = this.getItem(item.parentID)
      if (parent === undefined) {
        throw new Error(`Parent ID ${item.parentID} not found`)
      }
      item = parent
      result = item.name + ' : ' + result
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

  private getLexicographicScores(): Map<ItemID, number[]> {
    const result = new Map<ItemID, number[]>()
    const count = this.state.rootItemIDs.length
    for (let i = 0; i < count; i++) {
      const item = this.getItem(this.state.rootItemIDs[i])
      if (item === undefined) continue
      this.getLexicographicScoresInternal(item, [i], result)
    }
    return result
  }

  private getLexicographicScoresInternal(item: Item, temp: number[],
                                         result: Map<ItemID, number[]>) {
    result.set(item.id, [...temp])
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; i++) {
      const child = this.getItem(item.childrenIDs[i])
      if (child === undefined) continue
      temp.push(i)
      this.getLexicographicScoresInternal(child, temp, result)
      temp.pop()
    }
  }

  public getSubtreeItems(itemID: ItemID): ItemID[] {
    const item = this.getItem(itemID)
    if (item === undefined) return []

    const result: ItemID[] = []
    this.getSubtreeItemsInternal(item, result)
    return result
  }

  private getSubtreeItemsInternal(item: Item, result: ItemID[]) {
    result.push(item.id)
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; i++) {
      const childID = item.childrenIDs[i]
      const child = this.getItem(childID)
      if (child === undefined) continue
      this.getSubtreeItemsInternal(child, result)
    }
  }

  /**
   * NOTE: The returned list will be in bottom-top order.
   */
  public getAncestorsPlusSelf(itemID: ItemID): ItemID[] {
    const result: ItemID[] = []
    let i: Item | undefined = this.getItem(itemID)
    while (i !== undefined) {
      result.push(i.id)
      if (i.parentID === undefined) break
      i = this.getItem(i.parentID)
    }
    return result
  }

  private setDraftSubtreeStatus(draft: Draft<DataStoreState>, item: Draft<Item>,
                                status: ItemStatus) {
    // TODO optimize: This causes the children ID array to be drafted
    item.status = status
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; i++) {
      const childID = item.childrenIDs[i]
      const child = draft.items.get(childID)
      if (child === undefined) continue
      this.setDraftSubtreeStatus(draft, child, status)
    }
  }

  /**
   * Get the DayID of today, taking into account the "start of day" setting.
   */
  getCurrentDayID() {
    return dayIDNow(this.state.startOfDayMinutes)
  }
}
