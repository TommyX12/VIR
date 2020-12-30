import {DayID, DisplayDate} from '../data/common'

export const MS_PER_DAY = 86400000

export function dayIDToDisplayDate(dayID: DayID): DisplayDate {
  const date = new Date(dayID * MS_PER_DAY)
  return new DisplayDate(
    date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
    date.getUTCDay(),
  )
}

export function dayIDToDate(dayID: DayID): Date {
  const date = new Date(dayID * MS_PER_DAY)
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * Converts a JavaScript date to DayID.
 * @param date The JavaScript date.
 * @param offsetMinutes The number of minutes after midnight when a new day
 *     starts. For example, if this is 60, then any time before 1AM is still
 *     counted as the previous day.
 */
export function dateToDayID(date: Date, offsetMinutes: number = 0): DayID {
  return Math.floor(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(),
    date.getMinutes() - offsetMinutes, date.getSeconds(),
    ) /
    MS_PER_DAY)
}

/**
 * @param offsetMinutes See {@link dateToDayID}.
 */
export function dayIDNow(offsetMinutes: number = 0): DayID {
  return dateToDayID(new Date(), offsetMinutes)
}

export function dateAddDay(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta)
}

export function startOfWeek(date: Date): Date {
  return new Date(
    date.getFullYear(), date.getMonth(), date.getDate() - date.getDay())
}

const SPECIAL_DATE_KEYWORD_PARSERS: { [key: string]: (todayDayID: DayID) => DayID } = {
  'today': t => t,
  'tmr': t => t + 1,
  'next': t => t + 1,
  'next week': t => t + 7,
  'tomorrow': t => t + 1,
  'yesterday': t => t - 1,
}

export function parseSpecialDate(text: string,
                                 todayDayID: DayID): DayID | undefined {
  text = text.trim().toLowerCase()

  // Keyword rules
  const parser = SPECIAL_DATE_KEYWORD_PARSERS[text]
  if (parser) {
    return parser(todayDayID)
  }

  // Other rules
  if (text.startsWith('+')) {
    const delta = Number(text.substring(1))
    if (isNaN(delta)) {
      return undefined
    } else {
      return todayDayID + delta
    }
  }
  if (text.startsWith('-')) {
    const delta = Number(text.substring(1))
    if (isNaN(delta)) {
      return undefined
    } else {
      return todayDayID - delta
    }
  }

  // TODO add more features here

  return undefined
}
