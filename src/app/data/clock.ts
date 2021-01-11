import {Injectable} from '@angular/core'
import {BehaviorSubject} from 'rxjs'

/**
 * Provide time in minute granularity.
 */
@Injectable()
export class Clock {
  value: BehaviorSubject<Date>
  private lastMinute: number = new Date().getMinutes()

  constructor() {
    const date = new Date()
    this.value = new BehaviorSubject(date)
    this.lastMinute = date.getMinutes()

    setInterval(() => {
      const date = new Date()
      if (date.getMinutes() !== this.lastMinute ||
        (date.getTime() - this.value.value.getTime()) >= 60000) {
        this.value.next(date)
        this.lastMinute = date.getMinutes()
      }
    }, 1000)
  }

}
