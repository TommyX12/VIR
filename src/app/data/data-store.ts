import Color from 'color'
import convert from 'color-convert'
import produce, {Draft, immerable} from 'immer'
import {
  arrayMove,
  clampedLinearMap,
  getOrCreate,
  longestIncreasingSubsequence,
  optionalClamp,
  random,
  removeValue,
} from '../util/util'
import {
  ConstantQuotaRule,
  DayID,
  DEFAULT_QUOTA_RULE_APPLIER_BY_TYPE,
  DEFAULT_REPEATER_BY_TYPE,
  deserializeQuotaRuleFromObject,
  draftToQuotaRule,
  isConstantQuotaRule,
  Item,
  ItemDraft,
  ItemID,
  ItemStatus,
  QuotaRule,
  QuotaRuleDraft,
  QuotaRuleID,
  quotaRuleToDraft,
  RepeatType,
  serializeQuotaRuleToObject,
  SessionType,
} from './common'
import {Injectable} from '@angular/core'
import {BehaviorSubject} from 'rxjs'
import {dayIDNow} from '../util/time-util'
import {Task} from './data-analyzer'
import {MetadataStore} from './metadata-store'
import {
  deserializeMapFromObject,
  deserializeNumberFromObject,
  deserializeNumberFromString,
  parseSerializedObject,
  quickDeserializeRequired,
  serializeArrayToObject,
  SerializedObject,
  SerializedObjectMap,
  serializeMapToObject,
  serializePrimitiveToObject,
  serializePrimitiveToString,
  stringifySerializedObject,
} from '../util/serialization'
import {FsUtil} from '../util/fs-util'
import {debounceTime} from 'rxjs/operators'

export const DATA_FILE_NAME = 'vir-data.json'
export const TEMP_DATA_FILE_NAME_1 = 'vir-data.tmp1.json'
export const TEMP_DATA_FILE_NAME_2 = 'vir-data.tmp2.json'

export const AUTO_SAVE_IDLE_DELAY = 5000 // 5 seconds after change
export const AUTO_SAVE_INTERVAL = 60000 // Every minute

export interface InvalidItemError {
  type: string
  message: string
}

export interface InvalidQuotaRuleError {
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

/**
 * NOTE: Array is used instead of object for performance reasons.
 * "Less than" means earlier in queue (i.e. higher priority)
 */
export type QueuePriorityProxy = [
  dueDate: DayID | undefined,
  special: number, // This is used to force unnatural ordering
  postOrderIndex: number,
]

export function getQueuePriorityProxy(effectiveDueDate: DayID | undefined,
                                      postOrderIndex: number): QueuePriorityProxy {
  return [effectiveDueDate, 0, postOrderIndex]
}

export function queuePriorityProxyCompare(a: QueuePriorityProxy,
                                          b: QueuePriorityProxy) {
  if (a[0] !== b[0]) {
    if (b[0] === undefined) return -1
    if (a[0] === undefined) return 1
    return a[0] - b[0]
  }
  if (a[1] !== b[1]) {
    return a[1] - b[1]
  }
  return a[2] - b[2]
}

/**
 * @deprecated Legacy
 */
export interface QueueItemInfo {
  itemID: ItemID
  postOrderIndex: number
  effectiveDueDate?: DayID
}

/**
 * @deprecated Legacy
 */
export function getSmartQueueInsertionIndex(queueInfo: QueueItemInfo[],
                                            queueItemInfo: QueueItemInfo) {
  // TODO improve this heuristic

  let queueSize = queueInfo.length

  let start = 0
  let end = queueSize // exclusive
  const selfDueDate = queueItemInfo.effectiveDueDate
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
      const dueDate = queueInfo[i].effectiveDueDate
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
      const dueDate = queueInfo[i].effectiveDueDate
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
    return start
  } else {
    const selfScore = queueItemInfo.postOrderIndex
    // TODO draft.items.get(parentID)!.childrenIDs.indexOf(itemID)
    let candidate: number | undefined = undefined
    let candidateScore: number | undefined = undefined
    for (let i = start; i < end; ++i) {
      const score = queueInfo[i].postOrderIndex
      if (score < selfScore) {
        if (candidateScore === undefined || candidateScore < score) {
          candidate = i
          candidateScore = score
        }
      }
    }

    if (candidate === undefined) {
      return start
    } else {
      return candidate + 1
    }
  }
}

export interface SubtreeRepetitionInfo {
  itemID: ItemID

  /**
   * The number of days to place defer date before root due date
   */
  startOffset?: number

  /**
   * The number of days to place self due date before root due date
   */
  endOffset?: number
}

export interface SubtreeRepetitionResult {
  itemID: ItemID
  deferDate?: DayID
  dueDate?: DayID
}

export function generateSubtreeRepetition(
  nextTask: Task, rootItemID: ItemID, subtreeInfo: SubtreeRepetitionInfo[],
) {
  const result: SubtreeRepetitionResult[] = []
  const count = subtreeInfo.length
  for (let i = 0; i < count; i++) {
    const info = subtreeInfo[i]
    if (info === undefined) continue

    if (nextTask.end === undefined) { // Probably won't happen
      result.push({itemID: info.itemID})
      continue
    }

    if (info.itemID === rootItemID) { // This is the subtree root
      // Only the startOffset is used
      result.push({
        itemID: info.itemID,
        deferDate: info.startOffset === undefined ? nextTask.start :
          optionalClamp(
            nextTask.end - info.startOffset, nextTask.start, nextTask.end),
        dueDate: nextTask.end,
      })
    } else {
      // Simply shift defer and due date accordingly
      result.push({
        itemID: info.itemID,
        deferDate: info.startOffset === undefined ? undefined :
          nextTask.end - info.startOffset,
        dueDate: info.endOffset === undefined ? undefined :
          nextTask.end - info.endOffset,
      })

      // if (nextTask.start !== undefined) {
      //   if (info.deferDate !== undefined) {
      //     info.deferDate =
      //       Math.max(info.deferDate, nextTask.start)
      //   } else {
      //     info.deferDate = nextTask.start
      //   }
      //   if (info.dueDate !== undefined) {
      //     info.dueDate = Math.max(info.dueDate,
      // nextTask.start) } else { info.dueDate = nextTask.start } }
    }
  }
  return result
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

  static serializeToObject<T>(dayMap: DayMap<T>,
                              valueToObject: (value: T) => SerializedObject): SerializedObject {
    return {
      partitions:
        serializeMapToObject(
          dayMap.partitions, serializePrimitiveToString,
          (value) =>
            serializeMapToObject(
              value, serializePrimitiveToString, valueToObject),
        ),
    }
  }

  static deserializeFromObject<T>(obj: SerializedObject,
                                  valueFromObject: (obj: SerializedObject) => T): DayMap<T> {
    const map = obj as SerializedObjectMap
    const result = new DayMap<T>()
    result.partitions = deserializeMapFromObject(
      map.partitions as SerializedObject, deserializeNumberFromString,
      (value) =>
        deserializeMapFromObject(
          value, deserializeNumberFromString, valueFromObject),
    )
    return result
  }
}

export class DayData {
  [immerable] = true

  sessions = new Map<SessionType, Map<ItemID, number>>()

  static deserializeFromObject(obj: SerializedObject): DayData {
    const map = obj as SerializedObjectMap
    const result = new DayData()
    result.sessions = deserializeMapFromObject(
      map.sessions as SerializedObject, deserializeNumberFromString,
      (value) =>
        deserializeMapFromObject(
          value, deserializeNumberFromString, deserializeNumberFromObject),
    )
    return result
  }

  static serializeToObject(value: DayData): SerializedObject {
    return {
      sessions:
        serializeMapToObject(
          value.sessions, serializePrimitiveToString,
          (value) =>
            serializeMapToObject(
              value, serializePrimitiveToString, serializePrimitiveToObject),
        ),
    }
  }
}

export interface DataStoreState {
  items: Map<ItemID, Item>
  queue: ItemID[]
  rootItemIDs: ItemID[]
  timelineData: DayMap<DayData>
  nextItemID: number
  nextQuotaRuleID: number
  quotaRules: Map<QuotaRuleID, QuotaRule>
  quotaRuleOrder: QuotaRuleID[]
  settings: {
    startOfDayMinutes: number
    quotaRuleAutoDeleteDays: number
  }
}

function serializeDataStoreStateToObject(state: DataStoreState): SerializedObject {
  return {
    items: serializeMapToObject(state.items, serializePrimitiveToString,
      Item.serializeToObject,
    ),
    queue: serializeArrayToObject(state.queue, serializePrimitiveToObject),
    rootItemIDs:
      serializeArrayToObject(state.rootItemIDs, serializePrimitiveToObject),
    timelineData:
      DayMap.serializeToObject(state.timelineData, DayData.serializeToObject),
    nextItemID: serializePrimitiveToObject(state.nextItemID),
    nextQuotaRuleID: serializePrimitiveToObject(state.nextQuotaRuleID),
    quotaRules:
      serializeMapToObject(state.quotaRules, serializePrimitiveToString,
        serializeQuotaRuleToObject,
      ),
    quotaRuleOrder:
      serializeArrayToObject(state.quotaRuleOrder, serializePrimitiveToObject),
    settings: {
      startOfDayMinutes: serializePrimitiveToObject(
        state.settings.startOfDayMinutes),
      quotaRuleAutoDeleteDays: serializePrimitiveToObject(
        state.settings.quotaRuleAutoDeleteDays),
    },
  }
}

function deserializeDataStoreStateFromObject(obj: SerializedObject): DataStoreState {
  const map = obj as SerializedObjectMap
  const settings = map.settings as SerializedObjectMap
  return {
    items: map.items === undefined ? new Map<ItemID, Item>() :
      deserializeMapFromObject(map.items, deserializeNumberFromString,
        Item.deserializeFromObject,
      ),
    queue: quickDeserializeRequired(map.queue),
    rootItemIDs: quickDeserializeRequired(map.rootItemIDs),
    timelineData: DayMap.deserializeFromObject(
      map.timelineData as SerializedObject, DayData.deserializeFromObject),
    nextItemID: quickDeserializeRequired(map.nextItemID),
    nextQuotaRuleID: quickDeserializeRequired(map.nextQuotaRuleID),
    quotaRules: map.quotaRules === undefined ?
      new Map<QuotaRuleID, QuotaRule>() :
      deserializeMapFromObject(map.quotaRules, deserializeNumberFromString,
        deserializeQuotaRuleFromObject,
      ),
    quotaRuleOrder: quickDeserializeRequired(map.quotaRuleOrder),
    settings: {
      startOfDayMinutes: quickDeserializeRequired(settings.startOfDayMinutes),
      quotaRuleAutoDeleteDays: quickDeserializeRequired(
        settings.quotaRuleAutoDeleteDays),
    },
  }
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
            forwardScore += 2.0
          } else {
            forwardScore += 1.0 + (1.0 / (b - lastMatchedB))
          }
          lastMatchedB = b
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
            backwardScore += 2.0
          } else {
            backwardScore += 1.0 + (1.0 / (lastMatchedB - b))
          }
          lastMatchedB = b
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
    return this.query(pattern, numCandidates).map(entry => entry.key)
  }

  queryIDs(pattern: string, numCandidates: number = 0) {
    return this.query(pattern, numCandidates).map(entry => entry.id)
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

function lexicographicLessThan(a: number[], b: number[]) {
  let count = Math.min(a.length, b.length)
  for (let i = 0; i < count; ++i) {
    if (a[i] < b[i]) return true
    if (a[i] > b[i]) return false
  }
  return a.length <= b.length
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
    nextItemID: 1,
    nextQuotaRuleID: 1,
    rootItemIDs: [],
    timelineData: new DayMap<DayData>(),
    quotaRules: new Map<QuotaRuleID, QuotaRule>(),
    quotaRuleOrder: [],
    settings: {
      startOfDayMinutes: 0,
      quotaRuleAutoDeleteDays: 7,
    },
  }

  private undoHistory: DataStoreState[] = []
  private redoHistory: DataStoreState[] = []

  private defaultColor = Color('#888888')

  static readonly defaultDayData = new DayData()

  private onChangeSubject = new BehaviorSubject<DataStore>(this)
  private onReloadSubject = new BehaviorSubject<DataStore>(this)

  onChange = this.onChangeSubject.asObservable()
  onReload = this.onReloadSubject.asObservable()

  private addItemReducer = (draft: Draft<DataStoreState>,
                            itemDraft: ItemDraft) => {
    const id = draft.nextItemID
    const item = itemDraft.toNewItem(id)
    draft.nextItemID++
    if (draft.nextItemID <= id) {
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
   * NOTE: This root item must be self-repeatable.
   * Returns whether the repeat is successful (or simply marked as done)
   */
  private repeatSubtreeReducer = (draft: Draft<DataStoreState>,
                                  rootItemID: ItemID,
                                  subtree: ItemID[],
                                  currentDate: DayID): boolean => {
    const item = draft.items.get(rootItemID)
    if (item === undefined) return false

    const firstTask: Task = {
      cost: item.cost,
      end: item.dueDate,
      itemID: rootItemID,
      start: item.deferDate,
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

    const repeater = DEFAULT_REPEATER_BY_TYPE.get(repeat.type)
    if (repeater === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    const iterator = repeater(
      firstTask, this.getEffectiveInfo(item), dayIDNow() + 100000000)
    let nextTask: Task | undefined = undefined
    while (true) {
      nextTask = iterator()
      if (nextTask === undefined || nextTask.end === undefined ||
        nextTask.end >= currentDate) {
        break
      }
    }

    if (nextTask === undefined) {
      item.status = ItemStatus.COMPLETED
      return false
    }

    const subtreeInfo: SubtreeRepetitionInfo[] = []

    const count = subtree.length
    for (let i = 0; i < count; i++) {
      const subtreeItemID = subtree[i]
      const subtreeItem = draft.items.get(subtreeItemID)
      if (subtreeItem === undefined) continue

      subtreeItem.status = ItemStatus.ACTIVE

      if (subtreeItemID === rootItemID) { // Is root item
        const startOffset = subtreeItem.repeatDeferOffset === undefined ?
          undefined : subtreeItem.repeatDeferOffset
        const endOffset = 0

        subtreeInfo.push({
          itemID: subtreeItemID,
          startOffset,
          endOffset,
        })
      } else {
        const startOffset = subtreeItem.deferDate === undefined ? undefined :
          firstTask.end - repeatOffset - subtreeItem.deferDate
        const endOffset = subtreeItem.dueDate === undefined ? 0 :
          firstTask.end - repeatOffset - subtreeItem.dueDate

        subtreeInfo.push({
          itemID: subtreeItemID,
          startOffset,
          endOffset,
        })
      }
    }

    const repetitionResults = generateSubtreeRepetition(
      nextTask, rootItemID, subtreeInfo)

    const numResults = repetitionResults.length
    for (let i = 0; i < numResults; ++i) {
      const result = repetitionResults[i]
      const subtreeItem = draft.items.get(result.itemID)
      if (subtreeItem === undefined) continue

      subtreeItem.deferDate = result.deferDate
      subtreeItem.dueDate = result.dueDate
    }

    return true
  }

  /**
   * NOTE: This function searches for item information in the current state.
   * However, it does use the queue array from the given draft, since the queue
   * array contains only primitives.
   */
  private smartInsertItemsToQueueReducer = (draft: Draft<DataStoreState>,
                                            itemIDs: ItemID[]) => {
    // TODO optimize for single item insertion (without the need to sort)

    const postOrderIndices = this.getPostOrderIndices()

    const proxyQueue = this.computeQueuePriorityProxies(
      draft.queue, postOrderIndices)

    itemIDs.forEach(itemID => {
      const item = this.getItem(itemID)
      if (item === undefined) return

      proxyQueue.push({
        itemID: item.id,
        priorityProxy: getQueuePriorityProxy(
          this.getEffectiveDueDate(item), postOrderIndices.get(item.id) || 0),
      })
    })

    proxyQueue.sort(
      (a, b) => queuePriorityProxyCompare(a.priorityProxy, b.priorityProxy))

    draft.queue = proxyQueue.map(item => item.itemID)
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

      if (!item.autoAdjustPriority) continue

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

      let childrenCost = 0
      const childrenIDs = item.childrenIDs
      const numChildren = childrenIDs.length
      for (let j = 0; j < numChildren; j++) {
        const childID = childrenIDs[j]
        const child = (childID === lastUpdatedItemID ?
          draft.items.get(childID) : this.getItem(childID))
        if (child === undefined) continue
        childrenCost += child.effectiveCost
      }
      if (numChildren === 0) {
        item.effectiveCost = Math.max(childrenCost, item.cost)
        item.residualCost = item.effectiveCost - childrenCost
      } else { // When there's children, assume self cost is 0
        item.effectiveCost = childrenCost
        item.residualCost = 0
      }

      lastUpdatedItemID = itemID
      itemID = item.parentID
    }
  }

  private addQuotaRuleReducer = (draft: Draft<DataStoreState>,
                                 quotaRuleDraft: QuotaRuleDraft<QuotaRule>) => {
    const id = draft.nextQuotaRuleID
    const quotaRule = draftToQuotaRule(quotaRuleDraft)
    quotaRule.id = id
    draft.nextQuotaRuleID++
    if (draft.nextQuotaRuleID <= id) {
      throw new Error('QuotaRule ID overflow')
    }
    if (draft.quotaRules.has(quotaRule.id)) {
      throw new Error(`QuotaRule with ID ${quotaRule.id} already exists`)
    }
    draft.quotaRules.set(quotaRule.id, quotaRule)
    draft.quotaRuleOrder.push(quotaRule.id)
  }

  private updateQuotaRuleReducer = (draft: Draft<DataStoreState>,
                                    quotaRuleDraft: QuotaRuleDraft<QuotaRule>) => {
    const quotaRuleID = quotaRuleDraft.id
    const quotaRule = draftToQuotaRule(quotaRuleDraft)
    if (!draft.quotaRules.has(quotaRuleID)) {
      throw new Error(`QuotaRule with ID ${quotaRuleID} does not exist`)
    }

    draft.quotaRules.set(quotaRuleID, quotaRule)
  }

  private removeQuotaRuleReducer = (draft: Draft<DataStoreState>,
                                    quotaRuleID: QuotaRuleID) => {
    draft.quotaRules.delete(quotaRuleID)
    removeValue(draft.quotaRuleOrder, quotaRuleID)
  }

  private removeQuotaRulesReducer = (draft: Draft<DataStoreState>,
                                     quotaRuleIDs: QuotaRuleID[]) => {
    quotaRuleIDs.forEach(quotaRuleID => {
      draft.quotaRules.delete(quotaRuleID)
    })
    const quotaRuleIDSet = new Set(quotaRuleIDs)
    draft.quotaRuleOrder =
      draft.quotaRuleOrder.filter(value => !quotaRuleIDSet.has(value))
  }

  private quotaRuleMoveReducer = (draft: Draft<DataStoreState>,
                                  quotaRuleID: QuotaRuleID,
                                  index: number) => {
    const oldIndex = draft.quotaRuleOrder.indexOf(quotaRuleID)
    if (oldIndex < 0) return
    arrayMove(draft.quotaRuleOrder, oldIndex, index)
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
  private autoSaveStarted = false
  lastSavedMs = new BehaviorSubject(new Date())

  constructor(private readonly metadataStore: MetadataStore,
              private readonly fsUtil: FsUtil) {
    // TODO remove this
    /*
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
      // for (let i = 0; i < 200; ++i) {
      //   let draft = new ItemDraft(-1, 'Hello' + i.toString())
      //   draft.color =
      //     Color.rgb(
      //       Math.random() * 255, Math.random() * 255, Math.random() * 255)
      //   this.addItem(draft)
      // }

      // this.addSession(dayIDNow(), SessionType.COMPLETED, 1, 3)
      // this.addSession(dayIDNow(), SessionType.PROJECTED, 2, 4)
      // this.addSession(dayIDNow() + 1, SessionType.SCHEDULED, 3, 6)

      this.addQuotaRule({
        type: 'constant',
        id: -1,
        value: 5,
        dayOfWeek: [],
      } as ConstantQuotaRule)

      this.addQuotaRule({
        type: 'constant',
        id: -1,
        value: 4,
        dayOfWeek: [1, 2, 3, 4, 5],
      } as ConstantQuotaRule)

      this.addQuotaRule({
        type: 'constant',
        id: -1,
        value: 8,
        dayOfWeek: [0, 6],
      } as ConstantQuotaRule)
    })
    this.clearUndo()
    */
  }

  startAutoSave() {
    if (this.autoSaveStarted) return
    this.autoSaveStarted = true

    // Idle save
    this.onChange.pipe(debounceTime(AUTO_SAVE_IDLE_DELAY)).subscribe(() => {
      this.save()
    })

    // Interval save
    setInterval(() => {
      const now = Date.now()
      if (now - this.lastSavedMs.value.getTime() >= AUTO_SAVE_INTERVAL - 5000) {
        this.save()
      }
    }, AUTO_SAVE_INTERVAL)

    // Save on quit
    window.addEventListener('beforeunload', () => {
      this.save()
    })
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

    if (draft.cost < 0 || !Number.isInteger(draft.cost)) {
      throw {
        type: 'invalidCost',
        message: 'Error: Invalid cost',
      }
    }

    if (draft.repeat !== undefined &&
      (draft.repeatInterval <= 0 || !Number.isInteger(draft.repeatInterval))) {
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

    if (draft.repeatDeferOffset !== undefined && (draft.repeatDeferOffset < 0 ||
      !Number.isInteger(draft.repeatDeferOffset))) {
      throw {
        type: 'invalidRepeatDeferOffset',
        message: 'Error: Invalid repeat defer offset',
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
          this.smartInsertItemsToQueueReducer(draft, [id])
        })
    }
    this._state =
      produce(this._state, draft => {
        this.updateAncestorChainStatisticsReducer(draft, id)
      })
    this.notify()
    return id
  }

  /**
   * Returns whether the item repeated.
   */
  public updateItem(itemDraft: ItemDraft, options: UpdateItemOptions = {},
                    skipValidation: boolean = false, skipEffortCheck = false) {
    if (!skipValidation) {
      this.validateItemDraft(itemDraft, false)
    }
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
    /*
    const oldDueDate = item.dueDate
    const newDueDate = itemDraft.dueDate
    if (!skipEffortCheck && this.metadataStore.increasePostponementEffort &&
      oldDueDate !== undefined &&
      (newDueDate === undefined || newDueDate > oldDueDate)) {
      var str = ''
      for (var i = 0; i < 20; ++i) {
        str += Math.floor(Math.random() * 10).toString(10)
      }
      this.simplePrompt(
        'You are postponing a due date. Please enter the following text to proceed: ' +
        str).then(input => {
        if (input === str) {
          this.updateItem(itemDraft, options, skipValidation, skipEffortCheck)
        } else {
          alert('Error: wrong input.')
        }
      }).catch(err => {
        alert(err)
        console.log(err)
      })
      return
    }
    */
    this.pushUndo()
    this._state = produce(
      this._state,
      draft => {
        this.updateItemReducer(draft, itemDraft, options)
      },
    )
    if (shouldRepeat) {
      const subtree = this.getSubtreeItems(itemID)
      let repeatSuccessful = false
      const currentDate = this.getCurrentDayID()
      this._state = produce(this._state, draft => {
        repeatSuccessful =
          this.repeatSubtreeReducer(draft, itemID, subtree, currentDate)
      })
      if (repeatSuccessful) {
        repeated = true
        this._state =
          produce(this._state, draft => {
            this.removeItemsFromQueueReducer(draft, subtree)
            this.smartInsertItemsToQueueReducer(draft, subtree)
          })
      } else {
        this._state =
          produce(this._state, draft => {
            this.removeItemFromQueueReducer(draft, itemID)
          })
      }
    } else {
      if (oldStatus !== newStatus) {
        const subtree = this.getSubtreeItems(itemID)
        if (newStatus === ItemStatus.ACTIVE) {
          this._state =
            produce(this._state, draft => {
              this.removeItemsFromQueueReducer(draft, subtree)
              this.smartInsertItemsToQueueReducer(draft, subtree)
            })
        } else {
          this._state =
            produce(this._state, draft => {
              this.removeItemsFromQueueReducer(draft, subtree)
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

  private simplePrompt(prompt: string) {
    // TODO
  }

  public removeItem(itemID: ItemID) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.removeItemReducer(draft, itemID)
        // This will automatically remove things from queue as well
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

  public addQuotaRule(quotaRuleDraft: QuotaRuleDraft<QuotaRule>) {
    this.validateQuotaRuleDraft(quotaRuleDraft)
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.addQuotaRuleReducer(draft, quotaRuleDraft)
      })
    this.cleanUpQuotaRules()
    this.notify()
  }

  public getQuotaRule(quotaRuleID: QuotaRuleID) {
    return this._state.quotaRules.get(quotaRuleID)
  }

  public updateQuotaRule(quotaRuleDraft: QuotaRuleDraft<QuotaRule>) {
    this.validateQuotaRuleDraft(quotaRuleDraft)
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.updateQuotaRuleReducer(draft, quotaRuleDraft)
      })
    this.cleanUpQuotaRules()
    this.notify()
  }

  public removeQuotaRule(quotaRuleID: QuotaRuleID) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.removeQuotaRuleReducer(draft, quotaRuleID)
      })
    this.cleanUpQuotaRules()
    this.notify()
  }

  public quickEditQuotaRule(dayID: DayID, value: number) {
    value = Math.max(0, Math.round(value))
    const numQuotaRules = this.state.quotaRuleOrder.length
    const tempMap = new Map<DayID, number>()
    for (let i = numQuotaRules - 1; i >= 0; i--) {
      const ruleID = this.state.quotaRuleOrder[i]
      const rule = this.getQuotaRule(ruleID)
      if (rule === undefined) continue
      if (rule.firstDate !== undefined && rule.lastDate !== undefined &&
        rule.firstDate === rule.lastDate && isConstantQuotaRule(rule) &&
        rule.firstDate === dayID) {
        // The quota for the given day is affected by a single-day rule.
        const draft = quotaRuleToDraft(rule)
        draft.value = value
        this.batchEdit(it => {
          this.updateQuotaRule(draft)
          this.quotaRuleMoveToIndex(ruleID, numQuotaRules)
        })
        return
      }
    }
    const draft: QuotaRuleDraft<ConstantQuotaRule> = {
      type: 'constant',
      id: -1,
      firstDate: dayID,
      lastDate: dayID,
      value,
      dayOfWeek: [],
    }
    this.addQuotaRule(draft)
  }

  private cleanUpQuotaRules() {
    const rulesToDelete: QuotaRuleID[] = []
    const thresholdDayID = this.getCurrentDayID() -
      this.state.settings.quotaRuleAutoDeleteDays
    this.state.quotaRules.forEach(quotaRule => {
      if (quotaRule.lastDate !== undefined && quotaRule.lastDate <
        thresholdDayID) {
        rulesToDelete.push(quotaRule.id)
      }
    })
    this._state = produce(this._state, draft => {
      this.removeQuotaRulesReducer(draft, rulesToDelete)
    })
  }

  /**
   * Move quotaRule to before a specific anchor on quotaRuleOrder.
   * NOTE: This function searches for quotaRuleID using the current state.
   * Keep this in mind before chaining reducers on drafts.
   */
  public quotaRuleMoveToBefore(quotaRuleID: QuotaRuleID,
                               anchorQuotaRuleID: QuotaRuleID) {
    const anchorIndex = this.state.quotaRuleOrder.indexOf(anchorQuotaRuleID)
    if (anchorIndex < 0) return
    this.quotaRuleMoveToIndex(quotaRuleID, anchorIndex)
  }

  /**
   * Move quotaRule to after a specific anchor on quotaRuleOrder.
   * NOTE: This function searches for quotaRuleID using the current state.
   * Keep this in mind before chaining reducers on drafts.
   */
  public quotaRuleMoveToAfter(quotaRuleID: QuotaRuleID,
                              anchorQuotaRuleID: QuotaRuleID) {
    const anchorIndex = this.state.quotaRuleOrder.indexOf(anchorQuotaRuleID)
    if (anchorIndex < 0) return
    this.quotaRuleMoveToIndex(quotaRuleID, anchorIndex + 1)
  }

  /**
   * Move quotaRule to before the quotaRule pointed to by the given index.
   * NOTE: The quotaRule pointed to by the given index is considered *before*
   * moving the old quotaRule.
   */
  public quotaRuleMoveToIndex(quotaRuleID: QuotaRuleID, index: number) {
    this.pushUndo()
    this._state =
      produce(this._state, draft => {
        this.quotaRuleMoveReducer(draft, quotaRuleID, index)
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
    removeValue(draft.queue, itemID)
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

  getRelativeEffectiveDateRange(item: Item, ancestorID: ItemID): {
    deferDate?: DayID,
    dueDate?: DayID,
  } {
    if (item.id === ancestorID) return {}

    let i: Item | undefined = item
    let result = {
      dueDate: i.dueDate,
      deferDate: i.deferDate,
    }
    while (i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i === undefined) break
      if (i.id === ancestorID) break

      if (result.deferDate === undefined) {
        result.deferDate = i.deferDate
      } else {
        result.deferDate =
          optionalClamp(result.deferDate, i.deferDate, i.dueDate)
      }

      if (result.dueDate === undefined) {
        result.dueDate = i.dueDate
      } else {
        result.dueDate = optionalClamp(result.dueDate, i.deferDate, i.dueDate)
      }
    }
    return result
  }

  getEffectiveDeferDate(item: Item): DayID | undefined {
    let i: Item | undefined = item
    let result = i.deferDate
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i === undefined) continue
      if (result === undefined) {
        result = i.deferDate
      } else {
        result = optionalClamp(result, i.deferDate, i.dueDate)
      }
    }
    return result
  }

  getEffectiveDueDate(item: Item): DayID | undefined {
    let i: Item | undefined = item
    let result = i.dueDate
    while (i !== undefined && i.parentID !== undefined) {
      i = this.getItem(i.parentID)
      if (i === undefined) continue
      if (result === undefined) {
        result = i.dueDate
      } else {
        result = optionalClamp(result, i.deferDate, i.dueDate)
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

  getAllEffectiveInfo(): Map<ItemID, EffectiveItemInfo> {
    // TODO optimize: use DFS
    const result = new Map<ItemID, EffectiveItemInfo>()
    this.state.items.forEach(item => {
      result.set(item.id, this.getEffectiveInfo(item))
    })
    return result
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
      if (i === undefined) continue

      if (result.deferDate === undefined) {
        result.deferDate = i.deferDate
      } else {
        result.deferDate =
          optionalClamp(result.deferDate, i.deferDate, i.dueDate)
      }

      if (result.dueDate === undefined) {
        result.dueDate = i.dueDate
      } else {
        result.dueDate = optionalClamp(result.dueDate, i.deferDate, i.dueDate)
      }

      if (i.dueDate !== undefined) {
        if (minParentDueDate === undefined) {
          minParentDueDate = i.dueDate
        } else {
          minParentDueDate = Math.min(minParentDueDate, i.dueDate)
        }
      }

      if (i.repeat !== undefined) {
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

  /**
   * The indices are guaranteed to be non-negative.
   * Higher index means an item comes later in post-order tree traversal.
   */
  getPostOrderIndices(): Map<ItemID, number> {
    const result = new Map<ItemID, number>()
    const count = this.state.rootItemIDs.length
    const counter = {value: 1}
    for (let i = 0; i < count; i++) {
      const item = this.getItem(this.state.rootItemIDs[i])
      if (item === undefined) continue
      this.getPostOrderIndicesInternal(item, counter, result)
    }
    return result
  }

  private getPostOrderIndicesInternal(item: Item, counter: { value: number },
                                      result: Map<ItemID, number>) {
    const numChildren = item.childrenIDs.length
    for (let i = 0; i < numChildren; i++) {
      const child = this.getItem(item.childrenIDs[i])
      if (child === undefined) continue
      this.getPostOrderIndicesInternal(child, counter, result)
    }
    result.set(item.id, counter.value)
    counter.value++
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
    return dayIDNow(this.state.settings.startOfDayMinutes)
  }

  /**
   * TODO optimize: use draw-based method instead of query-based method
   */
  getQuota(rangeFirst: DayID, rangeLast: DayID) {
    if (rangeFirst > rangeLast) {
      return new Map<DayID, number>()
    }

    const result = new Map<DayID, number>()
    for (let d = rangeFirst; d <= rangeLast; d++) {
      result.set(d, 0)
    }

    for (let i = 0; i < this.state.quotaRuleOrder.length; i++) {
      const quotaRule = this.getQuotaRule(this.state.quotaRuleOrder[i])
      if (quotaRule === undefined) continue

      const applier = DEFAULT_QUOTA_RULE_APPLIER_BY_TYPE.get(quotaRule.type)
      if (applier === undefined) continue

      applier.apply(quotaRule, rangeFirst, rangeLast, result)
    }

    return result
  }

  validateQuotaRuleDraft(quotaRuleDraft: QuotaRuleDraft<QuotaRule>) {
    if (quotaRuleDraft.firstDate !== undefined && quotaRuleDraft.lastDate !==
      undefined && quotaRuleDraft.firstDate > quotaRuleDraft.lastDate) {
      throw {
        type: 'invalidRange',
        message: 'Error: Invalid range',
      }
    }
    if (isConstantQuotaRule(quotaRuleDraft)) {
      if (quotaRuleDraft.value < 0 || !Number.isInteger(quotaRuleDraft.value)) {
        throw {
          type: 'invalidValue',
          message: 'Error: Invalid quota value',
        }
      }
    }
  }

  /**
   * NOTE: This is only valid as long as items are not changed/added/deleted.
   */
  computeQueuePriorityProxies(
    queue: ItemID[],
    postOrderIndices?: Map<ItemID, number>, /* For optional performance*/
  ): {
    itemID: ItemID,
    priorityProxy: QueuePriorityProxy,
  }[] {
    if (postOrderIndices === undefined) {
      postOrderIndices = this.getPostOrderIndices()
    }

    const currentDayID = this.getCurrentDayID()

    const result: {
      itemID: ItemID,
      priorityProxy: QueuePriorityProxy,
    }[] = []

    const queueSize = queue.length
    for (let i = 0; i < queueSize; i++) {
      const itemID = queue[i]
      const item = this.getItem(itemID)
      if (item === undefined) continue
      result.push({
        itemID,
        priorityProxy: getQueuePriorityProxy(
          this.getEffectiveDueDate(item), postOrderIndices.get(itemID) || 0),
      })
    }

    // NOTE: Below makes the assumption that items in the queue are unique

    const pivots = result.map(
      (item, index) => ({index, priorityProxy: item.priorityProxy}))
      .filter(item => item.priorityProxy[0] !== undefined)

    const lisIndices = longestIncreasingSubsequence(
      pivots,
      (a, b) => queuePriorityProxyCompare(a.priorityProxy, b.priorityProxy),
    )

    // Interpolate due dates between pivots

    if (lisIndices.length > 0) {
      // Note that both pivot 1 and pivot 2 are exclusive.
      const interpolateDueDates = (pivot1: number, pivot2: number,
                                   dueDate1: DayID, dueDate2?: DayID) => {
        for (let i = pivot1 + 1; i < pivot2; i++) {
          if (dueDate2 === undefined) {
            result[i].priorityProxy[0] = undefined
          } else {
            result[i].priorityProxy[0] = Math.round(
              clampedLinearMap(pivot1, pivot2, dueDate1, dueDate2, i))
          }
        }
      }

      let pivot = pivots[lisIndices[0]]
      interpolateDueDates(
        -1, pivot.index, Math.min(currentDayID, pivot.priorityProxy[0]!),
        pivot.priorityProxy[0]!,
      )

      for (let i = 1; i < lisIndices.length; ++i) {
        const pivot1 = pivots[lisIndices[i - 1]]
        const pivot2 = pivots[lisIndices[i]]
        interpolateDueDates(
          pivot1.index, pivot2.index, pivot1.priorityProxy[0]!,
          pivot2.priorityProxy[0]!,
        )
      }

      pivot = pivots[lisIndices[lisIndices.length - 1]]
      interpolateDueDates(
        pivot.index, result.length,
        pivot.priorityProxy[0]!,
        undefined,
      )
    }

    // Fix unnatural orderings

    for (let i = 1; i < result.length; ++i) {
      const item1 = result[i - 1]
      const item2 = result[i]
      if (queuePriorityProxyCompare(item1.priorityProxy, item2.priorityProxy)
        >= 0) { // Unnatural order
        item2.priorityProxy[1] = item1.priorityProxy[1] + 1
      }
    }

    return result
  }

  getSaveFilePath() {
    return this.fsUtil.path.join(
      this.metadataStore.dataDir, DATA_FILE_NAME)
  }

  save() {
    this.lastSavedMs.next(new Date())
    const filePath = this.getSaveFilePath()
    const serializedObject = serializeDataStoreStateToObject(this.state)
    const text = stringifySerializedObject(serializedObject)
    this.fsUtil.safeWriteFileSync(
      filePath, text, TEMP_DATA_FILE_NAME_1, TEMP_DATA_FILE_NAME_2)
  }

  /**
   * Return if load successful
   */
  load() {
    const filePath = this.getSaveFilePath()
    try {
      const text = this.fsUtil.readFileTextSync(filePath)
      if (text === undefined) return false
      const serializedObject = parseSerializedObject(text)
      this._state = deserializeDataStoreStateFromObject(serializedObject)
      this.clearUndo()
      this.onReloadSubject.next(this)
      this.notify()
    } catch (e) {
      console.log(e)
      return false
    }
    return true
  }
}
