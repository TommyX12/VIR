import Color from 'color'
import {Draft, immerable} from 'immer'

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

export class ItemDraft {

  constructor(
    public id: ItemID = -1,
    public name: string = '',
    public status: ItemStatus = ItemStatus.ACTIVE,
    public cost: number = 1,
    public priority: number = 0,
    public color?: Color,
    public parentID?: ItemID,
  ) {
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
    )
  }

  applyToItem(item: Draft<Item>) {
    item.name = this.name
    item.status = this.status
    item.cost = this.cost
    item.priority = this.priority
    item.color = this.color
    item.parentID = this.parentID
  }
}

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
  ) {
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
    )
  }
}

export const SESSION_TYPE_TO_ICON = {
  [SessionType.COMPLETED]: 'check_circle',
  [SessionType.SCHEDULED]: 'schedule',
  [SessionType.PROJECTED]: 'autorenew',
}

