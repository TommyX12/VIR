import {Injectable} from '@angular/core'
import {DataStore, DataStoreState} from './data-store'
import {BehaviorSubject} from 'rxjs'
import {
  DayID,
  DEFAULT_REPEATERS,
  Item,
  ItemID,
  ItemStatus,
  Repeater,
  SessionType,
} from './common'
import {dayIDNow} from '../util/time-util'
import {debounceTime} from 'rxjs/operators'
import {Counter} from '../util/util'

const ANALYZER_UPDATE_DELAY = 500

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
      this.processDataStore(dataStore)
    })
  }

  private registerDefaultRepeaters() {
    for (const {id, repeater} of DEFAULT_REPEATERS) {
      this.repeaters.set(id, repeater)
    }
  }

  private processDataStore(dataStore: DataStore) {
    // TODO use web worker

    // Clean-up

    this.itemIDToTasks.clear()

    const maxProjectionEndDate = dayIDNow() + this.maxProjectionRange

    const tasks = this.generateTasks(dataStore, maxProjectionEndDate)

    const numTasks = tasks.length
    for (let i = 0; i < numTasks; i++) {
      const task = tasks[i]
      const list = this.itemIDToTasks.get(task.itemID)
      if (list === undefined) {
        this.itemIDToTasks.set(task.itemID, [task])
      } else {
        list.push(task)
      }
    }

    // console.log(tasks)

    // Modifies tasks in-place
    this.trackProgress(dataStore, tasks, maxProjectionEndDate)

    this.currentDataStoreState = dataStore.state
    this.onChangeSubject.next(this)
  }

  private trackProgress(dataStore: DataStore, tasks: Task[],
                        maxProjectionEndDate: DayID) {
    const doneCounter = new Counter<ItemID>()
    const plannedCounter = new Counter<ItemID>()

    // TODO improve this
    const earliestDayID = dataStore.state.timelineData.getEarliestDayID()

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

    // TODO optimize with DFS
    const parentChains = new Map<ItemID, ItemID[]>()
    tasks.forEach(task => {
      if (!parentChains.has(task.itemID)) {
        parentChains.set(
          task.itemID, dataStore.getAncestorsPlusSelf(task.itemID))
      }
    })

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
        const dayData = dataStore.getDayData(ptr)
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
  private generateTasks(dataStore: DataStore, maxProjectionEndDate: DayID) {
    const result: Task[] = []
    dataStore.state.items.forEach(item => {
      this.generateTasksForItem(item, maxProjectionEndDate, result)
    })
    return result
  }

  private generateTasksForItem(item: Item, maxProjectionEndDate: DayID,
                               result: Task[]) {
    const itemInfo = this.dataStore.getEffectiveInfo(item)

    const firstTask = {
      itemID: item.id,
      cost: item.cost,
      start: itemInfo.deferDate,
      end: itemInfo.dueDate,
      inactive: item.status === ItemStatus.COMPLETED,
    }

    if (firstTask.start !== undefined && firstTask.end !== undefined) {
      firstTask.start = Math.min(firstTask.start, firstTask.end)
    }

    result.push(firstTask)

    if (itemInfo.repeat === undefined ||
      (!itemInfo.hasActiveAncestorRepeat &&
        item.status === ItemStatus.COMPLETED)) {
      return
    }

    const repeater = this.repeaters.get(itemInfo.repeat.id)
    if (repeater === undefined) {
      console.log(
        `WARNING: Repeater for repeat type ${itemInfo.repeat.id} not found`)
      return
    }

    const r = repeater(firstTask, itemInfo, maxProjectionEndDate)

    while (true) {
      const nextTask = r()
      if (nextTask === undefined) break
      result.push(nextTask)
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
}
