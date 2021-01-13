import {Component, OnInit} from '@angular/core'
import {BehaviorSubject} from 'rxjs'
import {map} from 'rxjs/operators'

@Component({
  selector: 'app-timer',
  templateUrl: './timer.component.html',
  styleUrls: ['./timer.component.scss'],
})
export class TimerComponent implements OnInit {
  timerEnabled = false
  startedDate = new BehaviorSubject(new Date())
  elapsedMs = new BehaviorSubject(0)
  elapsedText = this.elapsedMs.pipe(map(value => this.getText(value)))
  startedMs = -1
  pausedMs = -1
  started = false
  running = false
  intervalID: any = undefined

  updateCallback = () => {
    if (!this.running) {
      return
    }
    this.elapsedMs.next(Date.now() - this.startedMs)
  }

  constructor() {
  }

  ngOnInit(): void {
  }

  toggleTimer() {
    this.timerEnabled = !this.timerEnabled
  }

  reset() {
    if (!this.started) return
    const shouldRestart = this.running
    this.startedMs = -1
    this.pausedMs = -1
    this.started = false
    this.running = false
    this.elapsedMs.next(0)
    clearInterval(this.intervalID)
    if (shouldRestart) {
      this.startOrPause()
    }
  }

  getText(elapsedTotalMs: number) {
    let elapsedSeconds = Math.floor(elapsedTotalMs / 1000)
    const elapsedHours = Math.floor(elapsedSeconds / 3600)
    elapsedSeconds -= elapsedHours * 3600
    const elapsedMinutes = Math.floor(elapsedSeconds / 60)
    elapsedSeconds -= elapsedMinutes * 60
    if (elapsedHours > 0) {
      return `${elapsedHours}:${elapsedMinutes.toString(10)
        .padStart(2, '0')}:${elapsedSeconds.toString(10).padStart(2, '0')}`
    }
    return `${elapsedMinutes.toString(10)
      .padStart(2, '0')}:${elapsedSeconds.toString(10).padStart(2, '0')}`
  }

  startOrPause() {
    if (!this.started) { // start
      this.started = true
      this.running = true
      this.startedDate.next(new Date())
      this.startedMs = this.startedDate.value.getTime()
      this.intervalID = setInterval(this.updateCallback, 1000)
    } else {
      if (this.running) { // pause
        this.running = false
        this.pausedMs = Date.now()
        clearInterval(this.intervalID)
      } else { // resume
        this.running = true
        this.startedMs = Date.now() - (this.pausedMs - this.startedMs)
        this.pausedMs = -1
        this.intervalID = setInterval(this.updateCallback, 1000)
      }
    }
  }
}
