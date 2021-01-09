import {Injectable} from '@angular/core'
import {
  DataStore,
  DataStoreState,
  EffectiveItemInfo,
  generateSubtreeRepetition,
  getQueuePriorityProxy,
  QueuePriorityProxy,
  queuePriorityProxyCompare,
  SubtreeRepetitionInfo,
} from './data-store'
import {BehaviorSubject} from 'rxjs'
import {
  DayID,
  DEFAULT_REPEATERS,
  INF_DAY_ID,
  Item,
  ItemID,
  ItemStatus,
  NEG_INF_DAY_ID,
  Repeater,
  SessionType,
} from './common'
import {debounceTime} from 'rxjs/operators'
import {
  arrayToMap,
  Counter,
  getOrCreate,
  optionalClamp,
  PriorityQueue,
} from '../util/util'

const ANALYZER_UPDATE_DELAY = 500

const EMPTY_LIST_CREATOR = (): any[] => []

export interface Task {
  itemID: ItemID

  cost: number

  /**
   * Defer date.
   */
  start?: DayID

  /**
   * Due date.
   */
  end?: DayID

  progress?: number
  plannedProgress?: number

  inactive?: boolean
}

export interface TaskSchedulingInfo {
  itemID: ItemID
  priorityProxy: QueuePriorityProxy
  remainingCost: number
}

export interface TaskSchedulingEndpoint {
  taskInfo: TaskSchedulingInfo
  dayID: DayID
  isEnd: boolean
}

export interface ProjectionResult {
  sessions: Map<DayID, Map<ItemID, number>>
}

export abstract class ProjectionStrategy {
  /**
   * @param firstDayID
   * @param lastDayID
   * @param taskInfoList
   * @param taskInfoEndpoints Must be sorted in ascending order by time.
   *     Also, due dates must be 1 + original value.
   * @param sessionSlots
   */
  abstract generate(firstDayID: DayID, lastDayID: DayID,
                    taskInfoList: TaskSchedulingInfo[],
                    taskInfoEndpoints: TaskSchedulingEndpoint[],
                    sessionSlots: Map<DayID, number>): ProjectionResult
}

export class GreedyProjectionStrategy extends ProjectionStrategy {
  generate(firstDayID: DayID, lastDayID: DayID,
           taskInfoList: TaskSchedulingInfo[],
           taskInfoEndpoints: TaskSchedulingEndpoint[],
           sessionSlots: Map<DayID, number>): ProjectionResult {
    const result = {
      sessions: new Map<DayID, Map<ItemID, number>>(),
    }
    const {sessions} = result

    const q = new PriorityQueue<TaskSchedulingInfo>({
      comparator: (a, b) => queuePriorityProxyCompare(
        a.priorityProxy, b.priorityProxy),
    })

    let endpointPtr = 0 // Number of events processed

    const sessionOfDayCreator = () => new Map<ItemID, number>()

    interface AuxiliaryInfo {
      deleted: boolean,

      /**
       * Number of projected sessions already planned
       */
      count: number,
    }

    const auxiliaryInfoCreator = (): AuxiliaryInfo => ({
      deleted: false,
      count: 0,
    })
    const auxiliaryInfoMap = new Map<TaskSchedulingInfo, AuxiliaryInfo>()

    for (let d = firstDayID; d <= lastDayID; ++d) {
      // Process endpoints
      while (endpointPtr < taskInfoEndpoints.length) {
        const endpoint = taskInfoEndpoints[endpointPtr]
        if (endpoint.dayID > d) {
          break
        }

        if (endpoint.isEnd) {
          getOrCreate(
            auxiliaryInfoMap, endpoint.taskInfo, auxiliaryInfoCreator).deleted =
            true
        } else {
          q.queue(endpoint.taskInfo)
        }

        endpointPtr++
      }

      let quota = sessionSlots.get(d) || 0
      while (quota > 0) {
        while (
          q.length > 0 &&
          getOrCreate(auxiliaryInfoMap, q.peek(), auxiliaryInfoCreator).deleted
          ) {
          q.dequeue()
        }
        if (q.length <= 0) break
        const info = q.peek()
        const auxInfo = getOrCreate(
          auxiliaryInfoMap, info, auxiliaryInfoCreator)
        let count = Math.min(
          Math.max(info.remainingCost - auxInfo.count, 0), quota)
        if (count > 0) {
          const sessionsOfDay = getOrCreate(sessions, d, sessionOfDayCreator)
          sessionsOfDay.set(
            info.itemID, (sessionsOfDay.get(info.itemID) || 0) + count)
          quota -= count
          auxInfo.count += count
        }
        if (auxInfo.count >= info.remainingCost) {
          q.dequeue()
        }
      }
    }

    return result
  }
}

/**
 * NOTE: When data store updates, any user of analyzer data must query the
 * analyzer again, since the information might be out of date.
 *
 * This task also need to make sure that when it's not up to date, any query
 * result should still *make sense*.
 */
@Injectable()
export class DataAnalyzer {

  private onChangeSubject = new BehaviorSubject<DataAnalyzer>(this)
  onChange = this.onChangeSubject.asObservable()

  private currentDataStoreState?: DataStoreState

  private repeaters = new Map<string, Repeater>()

  private maxProjectionRange = 365

  private itemIDToTasks = new Map<ItemID, Task[]>()
  private dayIDToProjections = new Map<DayID, Map<ItemID, number>>()

  constructor(
    private readonly dataStore: DataStore,
  ) {
    this.subscribeToDataStore()
    this.registerDefaultRepeaters()
  }

  private subscribeToDataStore() {
    this.dataStore.onChange.pipe(
      debounceTime(ANALYZER_UPDATE_DELAY),
    ).subscribe(dataStore => {
      this.processDataStore()
    })
  }

  private registerDefaultRepeaters() {
    for (const {type, repeater} of DEFAULT_REPEATERS) {
      this.repeaters.set(type, repeater)
    }
  }

  private processDataStore() {
    // TODO use web worker

    // Clean-up

    this.itemIDToTasks.clear()
    this.dayIDToProjections.clear()

    // Caching auxiliary info

    const currentDate = this.dataStore.getCurrentDayID()
    const maxProjectionEndDate = currentDate + this.maxProjectionRange
    const effectiveInfoCache = this.dataStore.getAllEffectiveInfo()
    const postOrderIndices = this.dataStore.getPostOrderIndices()
    const parentChains = this.cacheParentChains()
    const sessionSlots = this.cacheSessionSlots(
      currentDate, maxProjectionEndDate)


    // Generate tasks

    const itemIDToTasks = this.generateTasks(
      effectiveInfoCache, currentDate, maxProjectionEndDate)
    this.itemIDToTasks = itemIDToTasks

    const tasks: Task[] = []
    itemIDToTasks.forEach(list => {
      for (let i = 0; i < list.length; i++) {
        tasks.push(list[i])
      }
    })

    // console.log(tasks) // TODO remove me

    // Track progress. Modifies tasks in-place

    this.trackProgress(tasks, parentChains, maxProjectionEndDate)

    // Generate projections

    this.generateProjections(
      itemIDToTasks, postOrderIndices, sessionSlots, currentDate,
      maxProjectionEndDate,
    )

    // Finalize

    this.currentDataStoreState = this.dataStore.state
    this.onChangeSubject.next(this)
  }

  private trackProgress(tasks: Task[], parentChains: Map<ItemID, ItemID[]>,
                        maxProjectionEndDate: DayID) {
    const doneCounter = new Counter<ItemID>()
    const plannedCounter = new Counter<ItemID>()

    // TODO improve this
    const earliestDayID = this.dataStore.state.timelineData.getEarliestDayID()

    if (earliestDayID === undefined) {
      // There is no record at all.
      tasks.forEach(task => {
        task.progress = 0
        task.plannedProgress = 0
      })
      return
    }

    interface Endpoint {
      task: Task
      doneCount: number
      plannedCount: number
      dayID: DayID
      startEndpoint?: Endpoint // If undefined, this endpoint is a due date
                               // endpoint
    }

    // Start of search range
    let searchStartDayID: number | undefined = undefined

    let endpoints: Endpoint[] = []
    let count = tasks.length
    for (let i = 0; i < count; i++) {
      const task = tasks[i]
      const end = task.end === undefined ? maxProjectionEndDate : task.end

      const startDayID = task.start === undefined ?
        Math.min(earliestDayID, end) :
        task.start

      if (searchStartDayID === undefined || startDayID < searchStartDayID) {
        searchStartDayID = startDayID
      }

      const startEndpoint = {
        doneCount: 0,
        plannedCount: 0,
        dayID: startDayID,
        task,
      }
      endpoints.push(startEndpoint)
      endpoints.push({
        doneCount: 0,
        plannedCount: 0,
        dayID: end + 1, // Note that we add 1 here so the due date
        // endpoint comes after counting the progress on
        // the due date.
        startEndpoint,
        task,
      })
    }

    endpoints.sort((a, b) => a.dayID - b.dayID)

    let ptr = searchStartDayID === undefined ? earliestDayID :
      Math.max(searchStartDayID, earliestDayID)

    count = endpoints.length
    for (let i = 0; i < count; i++) {
      const endpoint = endpoints[i]
      // TODO optimize: maybe use map key access to skip over empty day data
      while (ptr < endpoint.dayID) {
        const dayData = this.dataStore.getDayData(ptr)
        dayData.sessions.get(SessionType.COMPLETED)
          ?.forEach((count, itemID) => {
            const parentChain = parentChains.get(itemID)
            if (parentChain !== undefined) {
              const length = parentChain.length
              for (let j = 0; j < length; j++) {
                const id = parentChain[j]
                doneCounter.add(id, count)
                plannedCounter.add(id, count)
              }
            }
            // If undefined, this item isn't needed for counting anyways
          })
        dayData.sessions.get(SessionType.SCHEDULED)
          ?.forEach((count, itemID) => {
            const parentChain = parentChains.get(itemID)
            if (parentChain !== undefined) {
              const length = parentChain.length
              for (let j = 0; j < length; j++) {
                const id = parentChain[j]
                plannedCounter.add(id, count)
              }
            }
            // If undefined, this item isn't needed for counting anyways
          })

        ptr++
      }

      if (endpoint.startEndpoint !== undefined) {
        endpoint.task.progress = doneCounter.get(endpoint.task.itemID) -
          endpoint.startEndpoint.doneCount
        endpoint.task.plannedProgress =
          plannedCounter.get(endpoint.task.itemID) -
          endpoint.startEndpoint.plannedCount
      } else {
        endpoint.doneCount = doneCounter.get(endpoint.task.itemID)
        endpoint.plannedCount = plannedCounter.get(endpoint.task.itemID)
      }
    }
  }

  /**
   * NOTE: The tasks are generated in due date order per each item
   */
  private generateTasks(effectiveInfoCache: Map<ItemID, EffectiveItemInfo>,
                        currentDate: DayID,
                        maxProjectionEndDate: DayID) {
    const result = new Map<ItemID, Task[]>()
    this.dataStore.state.items.forEach(item => {
      this.generateFirstTaskForItem(
        item, effectiveInfoCache, result)
    })
    this.dataStore.state.items.forEach(item => {
      const tasks = result.get(item.id)
      if (tasks === undefined || tasks.length === 0) return
      this.generateRepeatedTasksForItem(
        item, tasks[0], effectiveInfoCache, currentDate, maxProjectionEndDate,
        result,
      )
    })
    return result
  }

  private generateFirstTaskForItem(item: Item,
                                   effectiveInfoCache: Map<ItemID, EffectiveItemInfo>,
                                   result: Map<ItemID, Task[]>) {
    const itemInfo = effectiveInfoCache.get(item.id)
    if (itemInfo === undefined) return

    const firstTask = {
      itemID: item.id,
      cost: item.residualCost,
      start: itemInfo.deferDate,
      end: itemInfo.dueDate,
      inactive: item.status === ItemStatus.COMPLETED,
    }

    if (firstTask.start !== undefined && firstTask.end !== undefined) {
      firstTask.start = Math.min(firstTask.start, firstTask.end)
    }

    getOrCreate(result, item.id, EMPTY_LIST_CREATOR).push(firstTask)
  }

  private generateRepeatedTasksForItem(item: Item,
                                       firstTask: Task,
                                       effectiveInfoCache: Map<ItemID, EffectiveItemInfo>,
                                       currentDate: DayID,
                                       maxProjectionEndDate: DayID,
                                       result: Map<ItemID, Task[]>) {
    const itemInfo = effectiveInfoCache.get(item.id)
    if (itemInfo === undefined) return

    if (itemInfo.repeat === undefined || itemInfo.hasAncestorRepeat ||
      firstTask.end === undefined) { // Cannot self repeat
      return
    }
    // if (itemInfo.repeat === undefined ||
    //   (!itemInfo.hasActiveAncestorRepeat &&
    //     item.status === ItemStatus.COMPLETED)) {
    //   return
    // }

    const repeater = this.repeaters.get(itemInfo.repeat.type)
    if (repeater === undefined) {
      console.log(
        `WARNING: Repeater for repeat type ${itemInfo.repeat.type} not found`)
      return
    }

    const r = repeater(firstTask, itemInfo, maxProjectionEndDate)

    const subtree = this.dataStore.getSubtreeItems(item.id)

    const subtreeInfo: SubtreeRepetitionInfo[] = []

    const count = subtree.length
    for (let i = 0; i < count; i++) {
      const subtreeItemID = subtree[i]
      const subtreeItemInfo = effectiveInfoCache.get(subtreeItemID)
      if (subtreeItemInfo === undefined) continue

      const startOffset = subtreeItemInfo.deferDate === undefined ? undefined :
        firstTask.end - subtreeItemInfo.deferDate
      const endOffset = subtreeItemInfo.dueDate === undefined ? 0 :
        firstTask.end - subtreeItemInfo.dueDate

      subtreeInfo.push({
        itemID: subtreeItemID,
        startOffset,
        endOffset,
      })
    }

    while (true) {
      const nextTask = r()
      if (nextTask === undefined) break
      // Skip tasks ending before today
      if (!(nextTask.end === undefined || nextTask.end >= currentDate)) {
        continue
      }

      const repetitionResults = generateSubtreeRepetition(
        nextTask, item.id, subtreeInfo)

      if (subtreeInfo.length === 1) { // No children
        getOrCreate(result, item.id, EMPTY_LIST_CREATOR).push(nextTask)
      } else {
        const numResults = repetitionResults.length
        for (let i = 0; i < numResults; ++i) {
          const repResult = repetitionResults[i]
          const subtreeItem = this.dataStore.getItem(repResult.itemID)
          if (subtreeItem === undefined) continue
          getOrCreate(result, subtreeItem.id, EMPTY_LIST_CREATOR).push({
            itemID: subtreeItem.id,
            cost: subtreeItem.residualCost,
            start: repResult.deferDate === undefined ? nextTask.start :
              optionalClamp(repResult.deferDate, nextTask.start, nextTask.end),
            end: repResult.dueDate === undefined ? nextTask.end :
              optionalClamp(repResult.dueDate, nextTask.start, nextTask.end),
          })
        }
      }
    }
  }

  private isUpToDate() {
    return this.currentDataStoreState === this.dataStore.state
  }

  getTasks(itemID: ItemID): Task[] | undefined {
    if (!this.dataStore.hasItem(itemID)) {
      return undefined
    }
    return this.itemIDToTasks.get(itemID)
  }

  getProjections(dayID: DayID): Map<ItemID, number> | undefined {
    const result = this.dayIDToProjections.get(dayID)
    if (result === undefined) return undefined

    let invalidItemIDs: number[] | null = null
    result.forEach((_, itemID) => {
      if (!this.dataStore.hasItem(itemID)) {
        if (invalidItemIDs === null) invalidItemIDs = []
        invalidItemIDs.push(itemID)
      }
    })
    if (invalidItemIDs !== null) {
      // NOTE: There's a compiler issue forcing the use of ! here.
      invalidItemIDs!.forEach(itemID => result.delete(itemID))
    }
    return result
  }

  private generateProjections(itemIDToTasks: Map<ItemID, Task[]>,
                              postOrderIndices: Map<ItemID, number>,
                              sessionSlots: Map<DayID, number>,
                              currentDate: DayID,
                              maxProjectionEndDate: DayID) {
    const existingPriorityProxiesMap = arrayToMap(
      this.dataStore.computeQueuePriorityProxies(
        this.dataStore.state.queue,
        postOrderIndices,
      ), item => item.itemID, item => item.priorityProxy)

    const taskInfoList: TaskSchedulingInfo[] = []
    const taskInfoEndpoints: TaskSchedulingEndpoint[] = []

    itemIDToTasks.forEach((tasks, itemID) => {
      let isFirstTask = true
      const size = tasks.length
      for (let i = 0; i < size; ++i) {
        const task = tasks[i]

        if (task.inactive) {
          isFirstTask = false
          continue
        }

        const existingPriorityProxy = existingPriorityProxiesMap.get(itemID)

        const taskInfo: TaskSchedulingInfo = {
          itemID,
          priorityProxy: isFirstTask && existingPriorityProxy !== undefined ?
            existingPriorityProxy :
            getQueuePriorityProxy(task.end, postOrderIndices.get(itemID) || 0),
          remainingCost: Math.max(0, task.cost - (task.plannedProgress || 0)),
        }

        taskInfoList.push(taskInfo)

        // Left endpoint
        taskInfoEndpoints.push({
          taskInfo,
          dayID: task.start === undefined ? NEG_INF_DAY_ID : task.start,
          isEnd: false,
        })

        // Right endpoint
        taskInfoEndpoints.push({
          taskInfo,
          dayID: task.end === undefined ? INF_DAY_ID : task.end + 1,
          isEnd: true,
        })

        isFirstTask = false
      }
    })

    taskInfoEndpoints.sort((a, b) => {
      return a.dayID - b.dayID
    })

    const strategy = new GreedyProjectionStrategy()

    const result = strategy.generate(
      currentDate, maxProjectionEndDate, taskInfoList, taskInfoEndpoints,
      sessionSlots,
    )

    this.dayIDToProjections = result.sessions
  }

  private cacheParentChains() {
    // TODO optimize with DFS, and try not to access done tasks?

    const result = new Map<ItemID, ItemID[]>()
    this.dataStore.state.items.forEach(item => {
      if (!result.has(item.id)) {
        result.set(item.id, this.dataStore.getAncestorsPlusSelf(item.id))
      }
    })

    return result
  }

  private cacheSessionSlots(currentDate: DayID,
                            maxProjectionEndDate: DayID) {
    const result = this.dataStore.getQuota(currentDate, maxProjectionEndDate)

    for (let d = currentDate; d <= maxProjectionEndDate; ++d) {
      const dayData = this.dataStore.getDayData(d)
      let quota = result.get(d) || 0
      dayData.sessions.forEach(sessions => {
        sessions.forEach(count => {
          quota = Math.max(0, quota - count)
        })
      })
      result.set(d, quota)
    }

    return result
  }
}
