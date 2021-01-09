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
import {arrayToMap} from '../util/util'

export type ItemID = number

export type DayID = number

export const NEG_INF_DAY_ID = -1000000000
export const INF_DAY_ID = 1000000000

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
  readonly type: string
}

export class RepeatTypeFactory<T extends RepeatType> {
  /**
   * @param type Must match the type of the repeat type it creates.
   * @param create Factory function.
   */
  constructor(
    readonly type: string,
    readonly create: () => T,
  ) {
  }
}

export interface DailyRepeatType extends RepeatType {
  readonly type: 'day'
}

export interface WeeklyRepeatType extends RepeatType {
  readonly type: 'week'
  dayOfWeek: number[]
}

export interface MonthlyRepeatType extends RepeatType {
  readonly type: 'month'
  dayOfMonth: number[]
}

export interface YearlyRepeatType extends RepeatType {
  readonly type: 'year'
}

export const REPEAT_TYPE_FACTORIES: RepeatTypeFactory<RepeatType>[] = [
  new RepeatTypeFactory<DailyRepeatType>('day', () => ({
    type: 'day',
  })),
  new RepeatTypeFactory<WeeklyRepeatType>('week', () => ({
    type: 'week',
    dayOfWeek: [],
  })),
  new RepeatTypeFactory<MonthlyRepeatType>('month', () => ({
    type: 'month',
    dayOfMonth: [],
  })),
  new RepeatTypeFactory<YearlyRepeatType>('year', () => ({
    type: 'year',
  })),
]

export const REPEAT_TYPE_FACTORY_BY_TYPE = (() => {
  const result = new Map<string, RepeatTypeFactory<RepeatType>>()
  REPEAT_TYPE_FACTORIES.forEach(factory => {
    result.set(factory.type, factory)
  })
  return result
})()

export class Item {
  [immerable] = true

  /**
   * The maximum of self cost and children effective cost
   */
  effectiveCost: number

  /**
   * Effective cost subtracted by children effective cost
   */
  residualCost: number

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
    this.residualCost = cost
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
  type: string,
  repeater: Repeater,
}[] = [
  {
    type: 'day',
    repeater: (firstTask, itemInfo,
               maxProjectionEndDate) => {
      /*
       * Currently the defer date is always set to last due date + 1.
       * If needed, the logic to use startToEnd offset:
       *
       * const startToEnd = (firstTask.start !== undefined ?
       *   firstTask.end - firstTask.start : undefined)
       *
       * Then set each task's start to:
       *
       * start: startToEnd === undefined ? lastEnd + 1 :
       *   Math.max(lastEnd + 1, end - startToEnd),
       */

      if (firstTask.end === undefined) return () => undefined

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
          start: lastEnd + 1,
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    type: 'week',
    repeater: (firstTask, itemInfo,
               maxProjectionEndDate) => {
      if (firstTask.end === undefined) return () => undefined

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
          start: lastEnd + 1,
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    type: 'month',
    repeater: (firstTask, itemInfo,
               maxProjectionEndDate) => {
      if (firstTask.end === undefined) return () => undefined

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
          start: lastEnd + 1,
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
  {
    type: 'year',
    repeater: (firstTask, itemInfo,
               maxProjectionEndDate) => {
      if (firstTask.end === undefined) return () => undefined

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
          start: lastEnd + 1,
          end,
        }
        lastEnd = end
        return result
      }
    },
  },
]

export const DEFAULT_REPEATER_BY_TYPE = (() => {
  const result = new Map<string, Repeater>()
  DEFAULT_REPEATERS.forEach(({type, repeater}) => {
    result.set(type, repeater)
  })
  return result
})()

export type QuotaRuleID = number

/**
 * NOTE: All quota rules must be interface extending this interface, and be
 * deep-copyable.
 */
export interface QuotaRule {
  readonly type: string
  id: QuotaRuleID
  firstDate?: DayID
  lastDate?: DayID
}

export interface ConstantQuotaRule extends QuotaRule {
  readonly type: 'constant'
  value: number
  dayOfWeek: number[] // Empty means everyday
}

export type QuotaRuleDraft<T extends QuotaRule> = { [K in keyof T]: T[K] }

export function quotaRuleToDraft<T extends QuotaRule>(quotaRule: T) {
  return deepcopy(quotaRule) as unknown as QuotaRuleDraft<T>
}

export function draftToQuotaRule<T extends QuotaRule>(draft: QuotaRuleDraft<T>) {
  return deepcopy(draft) as unknown as T
}

export function isConstantQuotaRule(quotaRule: QuotaRule): quotaRule is ConstantQuotaRule {
  return quotaRule.type === 'constant'
}

export const DEFAULT_QUOTA_RULE_APPLIERS: {
  type: string,
  apply(rule: QuotaRule, rangeFirst: DayID, rangeLast: DayID,
        result: Map<DayID, number>),
}[] = [
  {
    type: 'constant',
    apply(rule, rangeFirst, rangeLast, result) {
      const {firstDate, lastDate, value, dayOfWeek} = rule as ConstantQuotaRule

      if (firstDate !== undefined && lastDate !== undefined && firstDate ===
        lastDate) {
        // Single-day rule
        if (firstDate >= rangeFirst && firstDate <= rangeLast) {
          result.set(firstDate, value)
        }
        return
      }

      const dayOfWeekSet = dayOfWeek.length === 0 ? undefined :
        new Set(dayOfWeek)
      if (firstDate !== undefined) {
        rangeFirst = Math.max(rangeFirst, firstDate)
      }
      if (lastDate !== undefined) {
        rangeLast = Math.min(rangeLast, lastDate)
      }
      for (let d = rangeFirst; d <= rangeLast; d++) {
        if (dayOfWeekSet === undefined || dayOfWeekSet.has(dowOfDayID(d))) {
          result.set(d, value)
        }
      }
    },
  },
]

export const DEFAULT_QUOTA_RULE_APPLIER_BY_TYPE = arrayToMap(
  DEFAULT_QUOTA_RULE_APPLIERS, item => item.type)
