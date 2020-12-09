import {immerable} from 'immer'

export type ItemID = number

export type DayID = number

export class SessionData {
  [immerable] = true

  itemID?: ItemID
}
