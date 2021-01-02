import {Injectable} from '@angular/core'
import {DataStore, DataStoreState, EffectiveItemInfo} from './data-store'
import {BehaviorSubject} from 'rxjs'
import {
  DayID,
  Item,
  ItemID,
  ItemStatus,
  SessionType,
  WeeklyRepeatType,
} from './common'
import {
  dateToDayID,
  dayIDNow,
  dayIDToDate,
  daysInMonth,
  dowOfDayID,
} from '../util/time-util'
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
}

type Repeater = (firstTask: Task, itemInfo: EffectiveItemInfo,
                 maxProjectionEndDate: DayID,
                 result: Task[]) => void

/**
 * NOTE:
 * - Due date is assumed to always exist, otherwise repeat is not allowed.
 *
 * TODO: refactor to reuse code between repeaters
 */
const DEFAULT_REPEATERS: {
  id: string,
  repeater: Repeater,
}[] = [
  {
    id: 'day',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID,
               result: Task[]) => {
      if (firstTask.end === undefined) return

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return
      let lastEnd = end

      while (true) {
        end += repeatInterval
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          break
        }
        result.push({
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        })
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) break
        lastEnd = end
      }
    },
  },
  {
    id: 'week',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID,
               result: Task[]) => {
      if (firstTask.end === undefined) return

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return
      let lastEnd = end

      const r = itemInfo.repeat as WeeklyRepeatType
      const dayOfWeek = r.dayOfWeek.slice()
      dayOfWeek.sort((a, b) => a - b)
      const simpleRepeat = dayOfWeek.length === 0
      let dayOfWeekPtr = -1

      while (true) {
        if (simpleRepeat) {
          end += repeatInterval * 7
        } else {
          const endDOW = dowOfDayID(end)
          const endStartOfWeek = end - endDOW
          if (dayOfWeekPtr === -1) {
            let nextDOW = -1
            dayOfWeekPtr = 0
            const count = dayOfWeek.length
            for (let i = 0; i < count; i++) {
              const dow = dayOfWeek[i]
              if (dow <= endDOW) continue
              nextDOW = dow
              dayOfWeekPtr = i
              break
            }

            if (nextDOW === -1) {
              end = endStartOfWeek + repeatInterval * 7 + dayOfWeek[0]
            } else {
              end = endStartOfWeek + nextDOW
            }

            // dayOfWeekPtr will point to where end is at
          } else {
            dayOfWeekPtr++
            if (dayOfWeekPtr >= dayOfWeek.length) {
              end = endStartOfWeek + repeatInterval * 7 + dayOfWeek[0]
              dayOfWeekPtr = 0
            } else {
              end = endStartOfWeek + dayOfWeek[dayOfWeekPtr]
            }
          }
        }
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          break
        }
        result.push({
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        })
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) break
        lastEnd = end
      }
    },
  },
  {
    id: 'month',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID,
               result: Task[]) => {
      if (firstTask.end === undefined) return

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return
      let lastEnd = end

      // TODO dayOfMonth is currently not supported

      const endDate = dayIDToDate(end)
      const year = endDate.getFullYear()
      let month = endDate.getMonth()
      const day = endDate.getDate()

      while (true) {
        month += repeatInterval
        end = dateToDayID(
          new Date(year, month, Math.min(day, daysInMonth(year, month))))
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          break
        }
        result.push({
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        })
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) break
        lastEnd = end
      }
    },
  },
  {
    id: 'year',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID,
               result: Task[]) => {
      if (firstTask.end === undefined) return

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return
      let lastEnd = end

      const endDate = dayIDToDate(end)
      let year = endDate.getFullYear()
      const month = endDate.getMonth()
      const day = endDate.getDate()

      while (true) {
        year += repeatInterval
        end = dateToDayID(
          new Date(year, month, Math.min(day, daysInMonth(year, month))))
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          break
        }
        result.push({
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        })
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) break
        lastEnd = end
      }
    },
  },
]

/**
 * NOTE: When data store updates, any user of analyzer data must query the
 * analyzer again, since the information might be out of date.
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

    const maxProjectionEndDate = dayIDNow() + this.maxProjectionRange

    const tasks = this.generateTasks(dataStore, maxProjectionEndDate)

    // TODO remove me
    console.log(tasks)

    this.trackProgress(dataStore, tasks) // Modifies tasks in-place

    this.onChangeSubject.next(this)
    this.currentDataStoreState = dataStore.state
  }

  private trackProgress(dataStore: DataStore, tasks: Task[]) {
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

    // Start of search range
    let searchStartDayID: number | undefined = undefined

    let endpoints: Endpoint[] = []
    let count = tasks.length
    for (let i = 0; i < count; i++) {
      const task = tasks[i]
      if (task.end === undefined) continue

      const startDayID = task.start === undefined ?
        Math.min(earliestDayID, task.end) :
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
        dayID: task.end + 1, // Note that we add 1 here so the due date
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
            doneCounter.add(itemID, count)
            plannedCounter.add(itemID, count)
          })
        dayData.sessions.get(SessionType.SCHEDULED)
          ?.forEach((count, itemID) => {
            plannedCounter.add(itemID, count)
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

    if (item.status === ItemStatus.COMPLETED &&
      !itemInfo.hasAncestorRepeat) {
      return
    }

    const firstTask = {
      itemID: item.id,
      cost: item.cost,
      start: itemInfo.deferDate,
      end: itemInfo.dueDate,
    }

    if (firstTask.start !== undefined && firstTask.end !== undefined) {
      firstTask.start = Math.min(firstTask.start, firstTask.end)
    }

    if (item.status !== ItemStatus.COMPLETED) {
      result.push(firstTask)
    }

    if (itemInfo.repeat === undefined) return

    const repeater = this.repeaters.get(itemInfo.repeat.id)
    if (repeater === undefined) {
      console.log(
        `WARNING: Repeater for repeat type ${itemInfo.repeat.id} not found`)
      return
    }

    repeater(firstTask, itemInfo, maxProjectionEndDate, result)
  }

  private isUpToDate() {
    return this.currentDataStoreState === this.dataStore.state
  }
}
