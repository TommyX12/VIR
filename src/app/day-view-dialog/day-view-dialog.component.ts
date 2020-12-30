import {Component, Inject, OnInit} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {DayID} from '../data/common'
import {HomeComponent} from '../home/home.component'

export interface DayViewDialogConfig {
  home?: HomeComponent
  dayID: DayID
}

@Component({
  selector: 'app-day-view-dialog',
  templateUrl: './day-view-dialog.component.html',
  styleUrls: ['./day-view-dialog.component.scss'],
})
export class DayViewDialogComponent implements OnInit {
  static readonly DIALOG_WIDTH = '500px'

  dayID: DayID
  home?: HomeComponent

  constructor(
    public dialogRef: MatDialogRef<DayViewDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DayViewDialogConfig) {
    this.dayID = data.dayID
    this.home = data.home
  }

  ngOnInit(): void {
  }

  close() {
    this.dialogRef.close()
  }

}
