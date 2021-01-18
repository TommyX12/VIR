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

  /**
   * The residual cost of the item.
   */
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
  pastProgress?: number
  plannedProgress?: number

  inactive?: boolean
}

export interface TaskSchedulingInfo {
  itemID: ItemID
  task: Task
  priorityProxy: QueuePriorityProxy
  unplannedCost: number
}

export interface TaskSchedulingEndpoint {
  taskInfo: TaskSchedulingInfo
  dayID: DayID
  isEnd: boolean
}

export interface ProjectionResult {
  sessions: Map<DayID, Map<ItemID, number>>
  impossibleTasks: Task[]
}

export abstract class ProjectionStrategy {
  /**
   * @param firstDayID
   * @param lastDayID
   * @param taskInfoList
   * @param taskInfoEndpoints Must be sorted in ascending order by time.
   *   Also, due dates must be 1 + original value.
   * @param sessionSlots
   */
  abstract generate(firstDayID: DayID, lastDayID: DayID,
                    taskInfoList: TaskSchedulingInfo[],
                    taskInfoEndpoints: TaskSchedulingEndpoint[],
                    sessionSlots: Map<DayID, number>): ProjectionResult
}

export class GreedyProjectionStrategy extends ProjectionStrategy {
  /**
   * @param backward Use backward scheduling strategy.
   *   Forward scheduling uses the queue priority, while backward scheduling
   *   uses the due and defer dates.
   *   Additionally, backward scheduling ignores all tasks that are not due
   *   within the scheduling range.
   */
  constructor(
    readonly backward: boolean,
  ) {
    super()
  }

  generate(firstDayID: DayID, lastDayID: DayID,
           taskInfoList: TaskSchedulingInfo[],
           taskInfoEndpoints: TaskSchedulingEndpoint[],
           sessionSlots: Map<DayID, number>): ProjectionResult {
    const result: ProjectionResult = {
      sessions: new Map<DayID, Map<ItemID, number>>(),
      impossibleTasks: [],
    }
    const {sessions, impossibleTasks} = result

    const q = new PriorityQueue<TaskSchedulingInfo>({
      comparator: this.backward ?
        (a, b) => {
          // Latest defer date first
          const aStart = a.task.start
          const bStart = b.task.start
          let result = (bStart === undefined ? NEG_INF_DAY_ID : bStart) -
            (aStart === undefined ? NEG_INF_DAY_ID : aStart)
          if (result !== 0) return result
          if (a.unplannedCost !== b.unplannedCost) {
            return a.unplannedCost - b.unplannedCost
          }
          return a.itemID - b.itemID
        } :
        (a, b) => queuePriorityProxyCompare(
          a.priorityProxy, b.priorityProxy),
    })

    // Next event to process
    let endpointPtr = this.backward ? taskInfoEndpoints.length - 1 : 0

    const sessionOfDayCreator = () => new Map<ItemID, number>()

    interface AuxiliaryInfo {
      deleted: boolean,

      /**
       * Number of projected sessions planned
       */
      plannedCount: number,
    }

    const auxiliaryInfoCreator = (): AuxiliaryInfo => ({
      deleted: false,
      plannedCount: 0,
    })
    const auxiliaryInfoMap = new Map<TaskSchedulingInfo, AuxiliaryInfo>()

    let start = this.backward ? lastDayID : firstDayID
    let stop = this.backward ? firstDayID : lastDayID
    let step = this.backward ? -1 : 1

    for (let d = start; d >= firstDayID && d <= lastDayID; d += step) {
      // Process endpoints
      while (this.backward ? (endpointPtr >= 0) :
        (endpointPtr < taskInfoEndpoints.length)) {

        const endpoint = taskInfoEndpoints[endpointPtr]
        if (this.backward ? (endpoint.dayID <= d) : (endpoint.dayID > d)) {
          break
        }

        if (this.backward ? (!endpoint.isEnd) : endpoint.isEnd) {
          // TODO optimize: this is not necessary at all for backward scheduling
          getOrCreate(
            auxiliaryInfoMap, endpoint.taskInfo, auxiliaryInfoCreator).deleted =
            true
        } else {
          if (!this.backward || endpoint.dayID - 1 <= lastDayID) {
            // When scheduling backward, keep only tasks that are due within
            // the scheduling range
            // Keep in mind that the end endpoint has dayID being 1 more than
            // actual due date
            q.queue(endpoint.taskInfo)
          }
        }

        endpointPtr += step
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
          Math.max(info.unplannedCost - auxInfo.plannedCount, 0), quota)
        if (count > 0) {
          const sessionsOfDay = getOrCreate(sessions, d, sessionOfDayCreator)
          sessionsOfDay.set(
            info.itemID, (sessionsOfDay.get(info.itemID) || 0) + count)
          quota -= count
          auxInfo.plannedCount += count
        }
        if (auxInfo.plannedCount >= info.unplannedCost) {
          const itemID = info.itemID
          q.dequeue()
        }
      }
    }

    // Compute impossible tasks
    taskInfoList.forEach(info => {
      const auxInfo = getOrCreate(auxiliaryInfoMap, info, auxiliaryInfoCreator)
      if (info.task.end !== undefined && info.task.end <= lastDayID &&
        auxInfo.plannedCount < info.unplannedCost) {
        impossibleTasks.push(info.task)
      }
    })

    return result
  }
}

export enum AnalyzerProjectionStrategy {
  FORWARD,
  BACKWARD,
}

export class FreeTimeEstimate {
  totalQuota = 0
  freeQuota = 0

  constructor() {
  }

  clear() {
    this.totalQuota = 0
    this.freeQuota = 0
  }
}

export enum TaskProblemType {
  /**
   * The task cannot be completed when scheduling according to the queue.
   */
  IMPOSSIBLE_BY_QUEUE,

  /**
   * The task cannot be completed when scheduling according to the late strategy
   * which attempts to maximize completion of all tasks with due dates.
   * This state takes precedence over IMPOSSIBLE_BY_QUEUE.
   */
  IMPOSSIBLE_BY_LATE,
}

export interface TaskProblem {
  task: Task
  type: TaskProblemType
}

export interface AlertActionContext {
  showItemInItems?: (itemID: ItemID) => void
  showItemInQueue?: (itemID: ItemID) => void
  dataStore?: DataStore
  editItem?: (itemID: ItemID) => void
}

export interface AlertAction {
  displayName: string

  isSupported(ctx: AlertActionContext)

  execute(data: any, ctx: AlertActionContext)
}

export interface Alert {
  type: string
  data: any
  icon: string
  color: 'primary' | 'warn' | 'accent'
  actions: AlertAction[]
}

const SHOW_IN_ITEMS_ACTION: AlertAction = {
  displayName: 'Show in Items',
  isSupported(ctx: AlertActionContext) {
    return ctx.showItemInItems !== undefined
  },
  execute(data: any, ctx: AlertActionContext) {
    const itemID = data.itemID
    if (itemID === undefined) return
    ctx.showItemInItems!(itemID)
  },
}

const SHOW_IN_QUEUE_ACTION: AlertAction = {
  displayName: 'Show in Queue',
  isSupported(ctx: AlertActionContext) {
    return ctx.showItemInQueue !== undefined
  },
  execute(data: any, ctx: AlertActionContext) {
    const itemID = data.itemID
    if (itemID === undefined) return
    ctx.showItemInQueue!(itemID)
  },
}

const MARK_ITEM_COMPLETE_ACTION: AlertAction = {
  displayName: 'Mark Item as Completed',
  isSupported(ctx: AlertActionContext) {
    return ctx.dataStore !== undefined
  },
  execute(data: any, ctx: AlertActionContext) {
    const itemID = data.itemID
    if (itemID === undefined) return
    const dataStore = ctx.dataStore!
    const item = dataStore.getItem(itemID)
    if (item === undefined) return
    const draft = item.toDraft()
    draft.status = ItemStatus.COMPLETED
    dataStore.updateItem(draft)
  },
}

const EDIT_ITEM_ACTION: AlertAction = {
  displayName: 'Edit Item',
  isSupported(ctx: AlertActionContext) {
    return ctx.editItem !== undefined
  },
  execute(data: any, ctx: AlertActionContext) {
    const itemID = data.itemID
    if (itemID === undefined) return
    ctx.editItem!(itemID)
  },
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
  private projectedSessions = new Map<AnalyzerProjectionStrategy, Map<DayID, Map<ItemID, number>>>()
  private estimatedDoneDates = new Map<ItemID, DayID>()
  private effectiveProgress = new Map<ItemID, number>()
  private freeTimeEstimate = new FreeTimeEstimate()
  // Guaranteed to be sorted by task order
  private taskProblems = new Map<ItemID, TaskProblem[]>()
  private alerts: Alert[] = []

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

    this.dataStore.onReload.subscribe(dataStore => {
      this.clearAll()
    })
  }

  private registerDefaultRepeaters() {
    for (const {type, repeater} of DEFAULT_REPEATERS) {
      this.repeaters.set(type, repeater)
    }
  }

  private clearAll() {
    this.itemIDToTasks.clear()
    this.projectedSessions.clear()
    this.estimatedDoneDates.clear()
    this.effectiveProgress.clear()
    this.freeTimeEstimate.clear()
    this.taskProblems.clear()
    this.alerts = []
  }

  private processDataStore() {
    // TODO use web worker

    // Clean-up

    // TODO make this less bug prone by making each subroutine return things
    //   instead of writing to a shared state inside the analyzer
    this.clearAll()

    // Caching auxiliary info

    const currentDate = this.dataStore.getCurrentDayID()
    const maxProjectionEndDate = currentDate + this.maxProjectionRange
    const effectiveInfoCache = this.dataStore.getAllEffectiveInfo()
    const postOrderIndices = this.dataStore.getPostOrderIndices()
    // const parentChains = this.cacheParentChains()
    const quotaInfo = this.dataStore.getQuota(currentDate, maxProjectionEndDate)
    const sessionSlots = this.cacheSessionSlots(
      quotaInfo, currentDate, maxProjectionEndDate)

    // Generate tasks

    this.generateTasks(
      effectiveInfoCache, currentDate, maxProjectionEndDate)

    const tasks: Task[] = []
    this.itemIDToTasks.forEach(list => {
      for (let i = 0; i < list.length; i++) {
        tasks.push(list[i])
      }
    })

    // console.log(tasks) // TODO remove me

    // Track progress. Modifies tasks in-place

    this.computeProgress(tasks, currentDate, maxProjectionEndDate)

    // Compute effective progress

    this.computeEffectiveProgress(this.itemIDToTasks)

    // Generate projections. Modifies projections.

    this.generateProjections(
      this.itemIDToTasks, postOrderIndices, sessionSlots, currentDate,
      maxProjectionEndDate,
    )

    // Estimate done dates

    this.estimateDoneDates(this.itemIDToTasks,
      this.projectedSessions.get(AnalyzerProjectionStrategy.FORWARD)!,
      currentDate, maxProjectionEndDate,
    )

    // Compute free time

    this.computeFreeTimeEstimate(
      this.projectedSessions.get(AnalyzerProjectionStrategy.BACKWARD)!,
      quotaInfo, sessionSlots, currentDate, maxProjectionEndDate,
      this.freeTimeEstimate,
    )

    // Compute alerts

    this.computeAlerts(
      this.taskProblems, effectiveInfoCache, this.effectiveProgress,
      currentDate,
    )

    // Finalize

    this.currentDataStoreState = this.dataStore.state
    this.onChangeSubject.next(this)
  }

  private computeProgress(tasks: Task[], currentDate: DayID,
                          maxProjectionEndDate: DayID) {
    const doneCounter = new Counter<ItemID>()
    const pastDoneCounter = new Counter<ItemID>()
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
      pastDoneCount: number
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
        pastDoneCount: 0,
        plannedCount: 0,
        dayID: startDayID,
        task,
      }
      endpoints.push(startEndpoint)
      endpoints.push({
        doneCount: 0,
        pastDoneCount: 0,
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
            if (ptr < currentDate) {
              pastDoneCounter.add(itemID, count)
            }
            doneCounter.add(itemID, count)
            plannedCounter.add(itemID, count)
          })
        if (ptr >= currentDate) {
          // Past scheduled sessions do not count as planned progress
          dayData.sessions.get(SessionType.SCHEDULED)
            ?.forEach((count, itemID) => {
              plannedCounter.add(itemID, count)
            })
        }

        ptr++
      }

      if (endpoint.startEndpoint !== undefined) {
        endpoint.task.progress = doneCounter.get(endpoint.task.itemID) -
          endpoint.startEndpoint.doneCount
        endpoint.task.pastProgress = pastDoneCounter.get(endpoint.task.itemID) -
          endpoint.startEndpoint.pastDoneCount
        endpoint.task.plannedProgress =
          plannedCounter.get(endpoint.task.itemID) -
          endpoint.startEndpoint.plannedCount
      } else {
        endpoint.doneCount = doneCounter.get(endpoint.task.itemID)
        endpoint.pastDoneCount = pastDoneCounter.get(endpoint.task.itemID)
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
    this.dataStore.state.items.forEach(item => {
      this.generateFirstTaskForItem(
        item, effectiveInfoCache, this.itemIDToTasks)
    })
    this.dataStore.state.items.forEach(item => {
      const tasks = this.itemIDToTasks.get(item.id)
      if (tasks === undefined || tasks.length === 0) return
      this.generateRepeatedTasksForItem(
        item, tasks[0], effectiveInfoCache, currentDate, maxProjectionEndDate,
        this.itemIDToTasks,
      )
    })
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
      const subtreeItem = this.dataStore.getItem(subtreeItemID)
      if (subtreeItem === undefined) continue
      const subtreeItemInfo = this.dataStore.getRelativeEffectiveDateRange(
        subtreeItem, item.id)

      if (subtreeItemID === item.id) { // Is root item
        const startOffset = subtreeItem.repeatDeferOffset === undefined ?
          undefined : subtreeItem.repeatDeferOffset
        const endOffset = 0

        subtreeInfo.push({
          itemID: subtreeItemID,
          startOffset,
          endOffset,
        })
      } else {
        const startOffset = subtreeItemInfo.deferDate === undefined ?
          undefined :
          firstTask.end - subtreeItemInfo.deferDate
        const endOffset = subtreeItemInfo.dueDate === undefined ? 0 :
          firstTask.end - subtreeItemInfo.dueDate

        subtreeInfo.push({
          itemID: subtreeItemID,
          startOffset,
          endOffset,
        })
      }
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

      // if (subtreeInfo.length === 1) { // No children
      //   getOrCreate(result, item.id, EMPTY_LIST_CREATOR).push(nextTask)
      // }
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

  private isUpToDate() {
    return this.currentDataStoreState === this.dataStore.state
  }

  getTasks(itemID: ItemID): Task[] | undefined {
    if (!this.dataStore.hasItem(itemID)) {
      return undefined
    }
    return this.itemIDToTasks.get(itemID)
  }

  getProjections(strategy: AnalyzerProjectionStrategy,
                 dayID: DayID): Map<ItemID, number> | undefined {
    const result = this.projectedSessions.get(strategy)?.get(dayID)
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

  getEstimatedDoneDate(itemID: ItemID): DayID | undefined {
    if (!this.dataStore.hasItem(itemID)) {
      return undefined
    }
    return this.estimatedDoneDates.get(itemID)
  }

  getFreeTimeEstimate() {
    return this.freeTimeEstimate
  }

  getTaskProblems(itemID: ItemID): TaskProblem[] | undefined {
    if (!this.dataStore.hasItem(itemID)) {
      return undefined
    }
    return this.taskProblems.get(itemID)
  }

  getEffectiveProgress(itemID: ItemID): number | undefined {
    if (!this.dataStore.hasItem(itemID)) {
      return undefined
    }
    return this.effectiveProgress.get(itemID)
  }

  getAlerts(): Alert[] {
    if (!this.isUpToDate()) {
      return []
    }
    return this.alerts
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
          task,
          priorityProxy: isFirstTask && existingPriorityProxy !== undefined ?
            existingPriorityProxy :
            getQueuePriorityProxy(task.end, postOrderIndices.get(itemID) || 0),
          unplannedCost: Math.max(0, task.cost - (task.plannedProgress || 0)),
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

    const forwardStrategy = new GreedyProjectionStrategy(false)

    const forwardResult = forwardStrategy.generate(
      currentDate, maxProjectionEndDate, taskInfoList, taskInfoEndpoints,
      sessionSlots,
    )

    this.projectedSessions.set(
      AnalyzerProjectionStrategy.FORWARD, forwardResult.sessions)

    // console.log(taskInfoEndpoints) // TODO remove me

    const backwardStrategy = new GreedyProjectionStrategy(true)

    const backwardResult = backwardStrategy.generate(
      currentDate, maxProjectionEndDate, taskInfoList, taskInfoEndpoints,
      sessionSlots,
    )

    this.projectedSessions.set(
      AnalyzerProjectionStrategy.BACKWARD, backwardResult.sessions)

    // Collecting task problems

    const impossibleByQueue = new Set<Task>(forwardResult.impossibleTasks)
    const impossibleByLate = new Set<Task>(backwardResult.impossibleTasks)

    itemIDToTasks.forEach(tasks => {
      tasks.forEach(task => {
        let problemType: TaskProblemType | null = null
        if (impossibleByLate.has(task)) {
          problemType = TaskProblemType.IMPOSSIBLE_BY_LATE
        } else if (impossibleByQueue.has(task)) {
          problemType = TaskProblemType.IMPOSSIBLE_BY_QUEUE
        }
        if (problemType !== null) {
          getOrCreate(
            this.taskProblems, task.itemID,
            (EMPTY_LIST_CREATOR as () => TaskProblem[]),
          ).push({
            task,
            type: problemType,
          })
        }
      })
    })
  }

  private estimateDoneDates(itemIDToTasks: Map<ItemID, Task[]>,
                            projectedSessions: Map<DayID, Map<ItemID, number>>,
                            currentDate: DayID, maxProjectionEndDate: DayID) {
    const progressCounter = new Counter<ItemID>()

    interface Endpoint {
      task: Task
      dayID: DayID
      isEnd: boolean
    }

    let endpoints: Endpoint[] = []

    const itemIDToFirstTask = new Map<ItemID, Task>()
    const firstTaskActive = new Set<ItemID>()

    itemIDToTasks.forEach((tasks, itemID) => {
      if (tasks.length > 0) {
        const task = tasks[0]

        itemIDToFirstTask.set(itemID, tasks[0])
        progressCounter.add(itemID, task.pastProgress || 0)

        const start = task.start === undefined ? currentDate : task.start
        const end = task.end === undefined ? maxProjectionEndDate : task.end

        endpoints.push({
          dayID: start,
          task,
          isEnd: false,
        })
        endpoints.push({
          dayID: end + 1, // Note that we add 1 here so the due date
          // endpoint comes after counting the progress on
          // the due date.
          task,
          isEnd: true,
        })
      }
    })

    endpoints.sort((a, b) => a.dayID - b.dayID)

    let ptr = currentDate

    const processSession = (count: number, itemID: ItemID) => {
      if (!firstTaskActive.has(itemID)) return
      progressCounter.add(itemID, count)
      const currentCount = progressCounter.get(itemID)
      const firstTask = itemIDToFirstTask.get(itemID)
      if (firstTask !== undefined && currentCount >= firstTask.cost &&
        !this.estimatedDoneDates.has(itemID)) {
        this.estimatedDoneDates.set(itemID, ptr)
      }
    }

    const count = endpoints.length
    for (let i = 0; i < count; i++) {
      const endpoint = endpoints[i]
      // TODO optimize: maybe use map key access to skip over empty day data
      while (ptr < endpoint.dayID) {
        const dayData = this.dataStore.getDayData(ptr)
        dayData.sessions.get(SessionType.COMPLETED)?.forEach(processSession)
        dayData.sessions.get(SessionType.SCHEDULED)?.forEach(processSession)
        projectedSessions.get(ptr)?.forEach(processSession)

        ptr++
      }

      if (endpoint.isEnd) {
        firstTaskActive.delete(endpoint.task.itemID)
      } else {
        firstTaskActive.add(endpoint.task.itemID)
      }
    }

    this.dataStore.state.rootItemIDs.forEach(itemID => {
      this.computeEffectiveDoneDates(itemID)
    })
  }

  private computeEffectiveDoneDates(itemID: ItemID) {
    const item = this.dataStore.getItem(itemID)
    if (item === undefined) return
    const numChildren = item.childrenIDs.length
    let doneDate = this.estimatedDoneDates.get(itemID)
    for (let i = 0; i < numChildren; i++) {
      const childID = item.childrenIDs[i]
      this.computeEffectiveDoneDates(childID)
      const childDoneDate = this.estimatedDoneDates.get(childID)
      if (childDoneDate === undefined) continue
      if (doneDate === undefined) {
        doneDate = childDoneDate
      } else {
        doneDate = Math.max(doneDate, childDoneDate)
      }
    }
    if (doneDate !== undefined) {
      this.estimatedDoneDates.set(itemID, doneDate)
    }
  }

  /**
   * @deprecated
   */
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

  private cacheSessionSlots(quotaInfo: Map<DayID, number>,
                            currentDate: DayID,
                            maxProjectionEndDate: DayID) {
    const result = new Map<DayID, number>()

    for (let d = currentDate; d <= maxProjectionEndDate; ++d) {
      const dayData = this.dataStore.getDayData(d)
      let quota = quotaInfo.get(d) || 0
      dayData.sessions.forEach(sessions => {
        sessions.forEach(count => {
          quota = Math.max(0, quota - count)
        })
      })
      result.set(d, quota)
    }

    return result
  }

  private computeFreeTimeEstimate(projectedSessions: Map<DayID, Map<ItemID, number>>,
                                  quotaInfo: Map<DayID, number>,
                                  sessionSlots: Map<DayID, number>,
                                  currentDate: DayID,
                                  maxProjectionEndDate: DayID,
                                  result: FreeTimeEstimate) {
    const rangeStart = currentDate
    // TODO change the hard-coded 30 days
    const rangeEnd = Math.min(rangeStart + 29, maxProjectionEndDate)
    for (let d = rangeStart; d <= rangeEnd; ++d) {
      const quota = (quotaInfo.get(d) || 0)
      let usedQuota = 0
      result.totalQuota += quota
      usedQuota += quota - (sessionSlots.get(d) || 0)
      const sessionsOfDay = projectedSessions.get(d)
      if (sessionsOfDay !== undefined) {
        sessionsOfDay.forEach(count => {
          usedQuota += count
        })
      }
      result.freeQuota += Math.max(0, quota - usedQuota)
    }
  }

  private computeEffectiveProgress(itemIDToTasks: Map<ItemID, Task[]>) {
    this.dataStore.state.rootItemIDs.forEach(itemID => {
      this.computeEffectiveProgressInternal(itemID, itemIDToTasks)
    })
  }

  /**
   * Return the contribution to parent's effective progress.
   */
  private computeEffectiveProgressInternal(itemID: ItemID,
                                           itemIDToTasks: Map<ItemID, Task[]>): number {
    const item = this.dataStore.getItem(itemID)
    if (item === undefined) return 0
    const numChildren = item.childrenIDs.length
    let tasks = this.itemIDToTasks.get(itemID)
    let progress = (tasks !== undefined && tasks.length > 0) ?
      (tasks[0].progress || 0) : 0
    for (let i = 0; i < numChildren; i++) {
      const childID = item.childrenIDs[i]
      const childContribution = this.computeEffectiveProgressInternal(
        childID, itemIDToTasks)
      progress += childContribution
    }

    this.effectiveProgress.set(itemID, progress)
    if (item.status === ItemStatus.COMPLETED) {
      return item.effectiveCost
    }
    return Math.min(progress, item.effectiveCost)
  }

  private computeAlerts(taskProblems: Map<ItemID, TaskProblem[]>,
                        effectiveInfoCache: Map<ItemID, EffectiveItemInfo>,
                        effectiveProgress: Map<ItemID, number>,
                        currentDate: DayID) {
    // Task problems

    taskProblems.forEach(problems => {
      problems.forEach(problem => {
        let alertType: string | undefined = undefined
        let icon: string | undefined = undefined
        if (problem.type === TaskProblemType.IMPOSSIBLE_BY_QUEUE) {
          alertType = 'taskConflict'
          icon = 'warning'
        } else if (problem.type === TaskProblemType.IMPOSSIBLE_BY_LATE) {
          alertType = 'taskImpossible'
          icon = 'error'
        } else {
          return
        }
        const alert: Alert = {
          color: 'warn',
          icon: icon,
          type: alertType,
          data: {
            itemID: problem.task.itemID,
            task: problem.task,
          },
          actions: [
            EDIT_ITEM_ACTION,
            SHOW_IN_ITEMS_ACTION,
            SHOW_IN_QUEUE_ACTION,
          ],
        }
        this.alerts.push(alert)
      })
    })

    // Item cost completed or overdue

    this.dataStore.state.items.forEach(item => {
      const progress = effectiveProgress.get(item.id) || 0
      if (item.status !== ItemStatus.COMPLETED) {
        if (item.effectiveCost > 0 && progress >= item.effectiveCost) {
          const alert: Alert = {
            color: 'primary',
            icon: 'check_circle_outline',
            type: 'itemCostCompleted',
            data: {
              itemID: item.id,
            },
            actions: [
              MARK_ITEM_COMPLETE_ACTION,
              EDIT_ITEM_ACTION,
              SHOW_IN_ITEMS_ACTION,
              SHOW_IN_QUEUE_ACTION,
            ],
          }
          this.alerts.push(alert)
        }

        const info = effectiveInfoCache.get(item.id)

        if (info !== undefined && info.dueDate !== undefined && info.dueDate <
          currentDate) {
          const alert: Alert = {
            color: 'warn',
            icon: 'alarm',
            type: 'itemOverdue',
            data: {
              itemID: item.id,
              dueDate: info.dueDate,
            },
            actions: [
              MARK_ITEM_COMPLETE_ACTION,
              EDIT_ITEM_ACTION,
              SHOW_IN_ITEMS_ACTION,
              SHOW_IN_QUEUE_ACTION,
            ],
          }
          this.alerts.push(alert)
        }
      }
    })
  }
}
