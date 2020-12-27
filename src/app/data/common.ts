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
