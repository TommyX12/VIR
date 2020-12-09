import Color from 'color'
import produce, {Draft, immerable} from 'immer'
import {removeValue} from '../util/util'
import {DayID, ItemID, SessionData} from './common'

export enum ItemStatus {
  ACTIVE,
  COMPLETED,
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

export class DayMap<T> {
  [immerable] = true

  private partitions = new Map<number, Map<DayID, T>>()

  private static readonly PARTITION_SIZE = 30

  constructor(
    private readonly defaultValue?: T,
  ) {
  }

  private static toPartitionID(dayID: DayID) {
    return Math.floor(dayID / DayMap.PARTITION_SIZE)
  }

  private getPartition(dayID: DayID) {
    return this.partitions.get(DayMap.toPartitionID(dayID))
  }

  public get(dayID: DayID) {
    const partition = this.getPartition(dayID)
    if (partition === undefined) {
      return this.defaultValue
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

  public static get<T>(draft: Draft<DayMap<T>>, dayID: DayID) {
    const partitionID = DayMap.toPartitionID(dayID)
    // @ts-ignore
    let partition: Map<DayID, T> | undefined = draft.partitions.get(
      partitionID)
    if (partition === undefined) {
      // @ts-ignore
      return draft.defaultValue
    }

    return partition.get(dayID)
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
}

export class DayData {
  [immerable] = true

  completed: SessionData[] = []
  scheduled: SessionData[] = []
}

export interface DataStoreState {
  items: Map<ItemID, Item>
  rootItemIDs: ItemID[]
  timelineData: DayMap<DayData>
  nextID: number
}

export class DataStore {
  private _state: DataStoreState = {
    items: new Map<ItemID, Item>(),
    nextID: 0,
    rootItemIDs: [],
    timelineData: new DayMap<DayData>(new DayData()),
  }

  private addItemReducer = produce(
    (draft: Draft<DataStoreState>, itemDraft: ItemDraft) => {
      const id = draft.nextID
      const item = itemDraft.toNewItem(id)
      draft.nextID++
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
    })

  private updateItemReducer = produce(
    (draft: Draft<DataStoreState>, itemDraft: ItemDraft) => {
      const itemID = itemDraft.id
      const item = draft.items.get(itemID)
      if (item === undefined) {
        throw new Error(`Item with ID ${itemID} does not exist`)
      }

      const oldParentID = item.parentID
      const newParentID = itemDraft.parentID

      itemDraft.applyToItem(item)

      if (newParentID !== oldParentID) {
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
          draft.rootItemIDs.push(item.id)
        } else {
          const parent = draft.items.get(newParentID)
          if (parent === undefined) {
            throw new Error(`Parent ID ${newParentID} does not exist`)
          }
          parent.childrenIDs.push(item.id)
        }
      }
    })

  private removeItemReducer = produce(
    (draft: Draft<DataStoreState>, itemID: ItemID) => {
      const item = draft.items.get(itemID)
      if (item === undefined) {
        throw new Error(`Item with ID ${itemID} does not exist`)
      }
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
    })

  public get state() {
    return this._state
  }

  public addItem(itemDraft: ItemDraft) {
    this._state = this.addItemReducer(this._state, itemDraft)
  }

  public updateItem(itemDraft: ItemDraft) {
    this._state = this.updateItemReducer(this._state, itemDraft)
  }

  public removeItem(itemID: ItemID) {
    this._state = this.removeItemReducer(this._state, itemID)
  }

  public getItem(itemID: ItemID) {
    return this._state.items.get(itemID)
  }
}
