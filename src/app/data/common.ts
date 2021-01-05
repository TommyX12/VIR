import Color from 'color'
import {Draft, immerable} from 'immer'
// @ts-ignore
import * as deepcopy from 'deepcopy'
import {EffectiveItemInfo} from './data-store'
import {
  dateToDayID,
  dayIDToDate,
  daysInMonth,
  dowOfDayID,
} from '../util/time-util'
import {Task} from './data-analyzer'

export type ItemID = number

export type DayID = number

export class DisplayDate {
  /**
   * @param year
   * @param month 1 represents January
   * @param day 1 represents first day
   * @param dow 0 represents Sunday
   */
  constructor(
    public readonly year: number,
    public readonly month: number,
    public readonly day: number,
    public readonly dow: number,
  ) {
  }
}

export enum ItemStatus {
  ACTIVE,
  COMPLETED,
}

export enum SessionType {
  COMPLETED,
  SCHEDULED,
  PROJECTED,
}

/**
 * NOTE: All repeat types must be interface extending this interface, and be
 * deep-copyable.
 */
export interface RepeatType {
  readonly id: string
}

export class RepeatTypeFactory<T extends RepeatType> {
  /**
   * @param id Must match the id of the repeat type it creates.
   * @param create Factory function.
   */
  constructor(
    readonly id: string,
    readonly create: () => T,
  ) {
  }
}

export interface DailyRepeatType extends RepeatType {
  id: 'day'
}

export interface WeeklyRepeatType extends RepeatType {
  id: 'week'
  dayOfWeek: number[]
}

export interface MonthlyRepeatType extends RepeatType {
  id: 'month'
  dayOfMonth: number[]
}

export interface YearlyRepeatType extends RepeatType {
  id: 'year'
}

export const REPEAT_TYPE_FACTORIES: RepeatTypeFactory<RepeatType>[] = [
  new RepeatTypeFactory<DailyRepeatType>('day', () => ({
    id: 'day',
  })),
  new RepeatTypeFactory<WeeklyRepeatType>('week', () => ({
    id: 'week',
    dayOfWeek: [],
  })),
  new RepeatTypeFactory<MonthlyRepeatType>('month', () => ({
    id: 'month',
    dayOfMonth: [],
  })),
  new RepeatTypeFactory<YearlyRepeatType>('year', () => ({
    id: 'year',
  })),
]

export const REPEAT_TYPE_FACTORY_BY_ID = (() => {
  const result = new Map<string, RepeatTypeFactory<RepeatType>>()
  REPEAT_TYPE_FACTORIES.forEach(factory => {
    result.set(factory.id, factory)
  })
  return result
})()

export class Item {
  [immerable] = true

  effectiveCost: number

  constructor(
    public readonly id: ItemID,
    public readonly name: string = '',
    public readonly status: ItemStatus = ItemStatus.ACTIVE,
    public readonly cost: number = 1,
    public readonly autoAdjustPriority: boolean = true,
    public readonly childrenIDs: ItemID[] = [],
    public readonly tryUseParentColor: boolean = true,
    public readonly color: Color,
    public readonly parentID?: ItemID,
    public readonly deferDate?: DayID,
    public readonly dueDate?: DayID,
    public readonly repeat?: RepeatType,
    public readonly repeatInterval: number = 1,
    public readonly repeatEndDate?: DayID,
    public readonly repeatOnCompletion: boolean = false,
  ) {
    this.repeat = deepcopy(repeat)
    this.effectiveCost = cost
  }

  toDraft() {
    return new ItemDraft(
      this.id,
      this.name,
      this.status,
      this.cost,
      this.autoAdjustPriority,
      this.tryUseParentColor,
      this.color,
      this.parentID,
      this.deferDate,
      this.dueDate,
      this.repeat,
      this.repeatInterval,
      this.repeatEndDate,
      this.repeatOnCompletion,
    )
  }
}

const BLACK = Color(0, 0, 0)

export class ItemDraft {
  constructor(
    public id: ItemID = -1,
    public name: string = '',
    public status: ItemStatus = ItemStatus.ACTIVE,
    public cost: number = 1,
    public autoAdjustPriority: boolean = true,
    public tryUseParentColor: boolean = true,
    public color: Color = BLACK,
    public parentID?: ItemID,
    public deferDate?: DayID,
    public dueDate?: DayID,
    public repeat?: RepeatType,
    public repeatInterval: number = 1,
    public repeatEndDate?: DayID,
    public repeatOnCompletion: boolean = false,
  ) {
    this.repeat = deepcopy(repeat)
  }

  toNewItem(id: ItemID) {
    return new Item(
      id,
      this.name,
      this.status,
      this.cost,
      this.autoAdjustPriority,
      [],
      this.tryUseParentColor,
      this.color,
      this.parentID,
      this.deferDate,
      this.dueDate,
      this.repeat,
      this.repeatInterval,
      this.repeatEndDate,
      this.repeatOnCompletion,
    )
  }

  applyToItem(item: Draft<Item>) {
    item.name = this.name
    item.status = this.status
    item.cost = this.cost
    item.autoAdjustPriority = this.autoAdjustPriority
    item.tryUseParentColor = this.tryUseParentColor
    item.color = this.color
    item.parentID = this.parentID
    item.deferDate = this.deferDate
    item.dueDate = this.dueDate
    item.repeat = deepcopy(this.repeat)
    item.repeatInterval = this.repeatInterval
    item.repeatEndDate = this.repeatEndDate
    item.repeatOnCompletion = this.repeatOnCompletion
  }
}

export const SESSION_TYPE_TO_ICON = {
  [SessionType.COMPLETED]: 'check_circle',
  [SessionType.SCHEDULED]: 'schedule',
  [SessionType.PROJECTED]: 'flash_on',
}

export type Repeater = (firstTask: Task, itemInfo: EffectiveItemInfo,
                        maxProjectionEndDate: DayID) => () => Task | undefined
/**
 * NOTE:
 * - Due date is assumed to always exist, otherwise repeat is not allowed.
 *
 * TODO: refactor to reuse code between repeaters
 */
export const DEFAULT_REPEATERS: {
  id: string,
  repeater: Repeater,
}[] = [
  {
    id: 'day',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID): () => Task | undefined => {
      if (firstTask.end === undefined) return () => undefined

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return () => undefined
      let lastEnd = end

      return () => {
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) return undefined
        end += repeatInterval
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          return undefined
        }
        const result = {
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    id: 'week',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID): () => Task | undefined => {
      if (firstTask.end === undefined) return () => undefined

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return () => undefined
      let lastEnd = end

      const r = itemInfo.repeat as WeeklyRepeatType
      const dayOfWeek = r.dayOfWeek.slice()
      dayOfWeek.sort((a, b) => a - b)
      const simpleRepeat = dayOfWeek.length === 0
      let dayOfWeekPtr = -1

      return () => {
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) return undefined
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
          return undefined
        }
        const result = {
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    id: 'month',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID): () => Task | undefined => {
      if (firstTask.end === undefined) return () => undefined

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return () => undefined
      let lastEnd = end

      // TODO dayOfMonth is currently not supported

      const endDate = dayIDToDate(end)
      const year = endDate.getFullYear()
      let month = endDate.getMonth()
      const day = endDate.getDate()

      return () => {
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) return undefined
        month += repeatInterval
        end = dateToDayID(
          new Date(year, month, Math.min(day, daysInMonth(year, month))))
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          return undefined
        }
        const result = {
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    id: 'year',
    repeater: (firstTask: Task, itemInfo: EffectiveItemInfo,
               maxProjectionEndDate: DayID): () => Task | undefined => {
      if (firstTask.end === undefined) return () => undefined

      const startToEnd = (firstTask.start !== undefined ?
        firstTask.end - firstTask.start : undefined)
      let end = firstTask.end
      const repeatInterval = itemInfo.repeatInterval
      if (repeatInterval <= 0) return () => undefined
      let lastEnd = end

      const endDate = dayIDToDate(end)
      let year = endDate.getFullYear()
      const month = endDate.getMonth()
      const day = endDate.getDate()

      return () => {
        // This ensures that there's at least one task after max date
        if (end > maxProjectionEndDate) return undefined
        year += repeatInterval
        end = dateToDayID(
          new Date(year, month, Math.min(day, daysInMonth(year, month))))
        if (itemInfo.repeatEndDate !== undefined && end >
          itemInfo.repeatEndDate) {
          return undefined
        }
        const result = {
          itemID: firstTask.itemID,
          cost: firstTask.cost,
          start: startToEnd === undefined ? lastEnd + 1 :
            Math.max(lastEnd + 1, end - startToEnd),
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
]

export const DEFAULT_REPEATER_BY_ID = (() => {
  const result = new Map<string, Repeater>()
  DEFAULT_REPEATERS.forEach(({id, repeater}) => {
    result.set(id, repeater)
  })
  return result
})()

