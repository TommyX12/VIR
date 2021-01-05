import {DayID} from '../data/common'
import {MatDatepickerInputEvent} from '@angular/material/datepicker'

export const MS_PER_DAY = 86400000

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

export function dowOfDayID(dayID: DayID): number {
  return (dayID + 4) % 7
}

export function startOfWeekDayID(dayID: DayID): DayID {
  return dayID - dowOfDayID(dayID)
}

/**
 * NOTE: month is zero-based to be consistent with JavaScript dates.
 */
export function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
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

export function parseMatDatePicker(event: MatDatepickerInputEvent<unknown, unknown>): DayID | undefined {
  let dayID = parseSpecialDate(
    (event.targetElement as any).value || '', dayIDNow())
  if (dayID === undefined) {
    const date = event.value
    if (date) {
      dayID = dateToDayID(date as Date)
    }
  }
  return dayID
}

const DOW_TO_SHORT_DISPLAY_NAME = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
]

export function getShowrtDOWDisplayName(dow: number) {
  if (dow >= 0 && dow < DOW_TO_SHORT_DISPLAY_NAME.length) {
    return DOW_TO_SHORT_DISPLAY_NAME[dow]
  }
  return ''
}

export function getLongDateDisplayName(date: Date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export function getLongDayIDDisplayName(dayID: DayID) {
  return getLongDateDisplayName(dayIDToDate(dayID))
}
