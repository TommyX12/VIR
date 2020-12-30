import Color from 'color'
import {Draft, immerable} from 'immer'
// @ts-ignore
import * as deepcopy from 'deepcopy'

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

export const repeatTypeFactories: RepeatTypeFactory<RepeatType>[] = [
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

export const repeatTypeFactoriesByID = (() => {
  const result = new Map<string, RepeatTypeFactory<RepeatType>>()
  repeatTypeFactories.forEach(factory => {
    result.set(factory.id, factory)
  })
  return result
})()

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
    public readonly deferDate?: DayID,
    public readonly dueDate?: DayID,
    public readonly repeat?: RepeatType,
    public readonly repeatInterval: number = 1,
  ) {
    this.repeat = deepcopy(repeat)
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
      this.deferDate,
      this.dueDate,
      this.repeat,
      this.repeatInterval,
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
    public deferDate?: DayID,
    public dueDate?: DayID,
    public repeat?: RepeatType,
    public repeatInterval: number = 1,
  ) {
    this.repeat = deepcopy(repeat)
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
      this.deferDate,
      this.dueDate,
      this.repeat,
      this.repeatInterval,
    )
  }

  applyToItem(item: Draft<Item>) {
    item.name = this.name
    item.status = this.status
    item.cost = this.cost
    item.priority = this.priority
    item.color = this.color
    item.parentID = this.parentID
    item.deferDate = this.deferDate
    item.dueDate = this.dueDate
    item.repeat = deepcopy(this.repeat)
    item.repeatInterval = this.repeatInterval
  }
}

export const SESSION_TYPE_TO_ICON = {
  [SessionType.COMPLETED]: 'check_circle',
  [SessionType.SCHEDULED]: 'schedule',
  [SessionType.PROJECTED]: 'autorenew',
}

