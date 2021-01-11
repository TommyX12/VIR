import {Component, Inject, OnInit} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {MetadataStore} from '../data/metadata-store'
import {FsUtil} from '../util/fs-util'
import {DataStore} from '../data/data-store'

export interface StartDialogConfig {

}

@Component({
  selector: 'app-start-dialog',
  templateUrl: './start-dialog.component.html',
  styleUrls: ['./start-dialog.component.scss'],
})
export class StartDialogComponent implements OnInit {
  static readonly DIALOG_WIDTH = '600px'

  constructor(public dialogRef: MatDialogRef<StartDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: StartDialogConfig,
              private readonly fsUtil: FsUtil,
              readonly metadataStore: MetadataStore,
              private readonly dataStore: DataStore) {
  }

  ngOnInit(): void {
  }

  changeDataDir() {
    const path = this.fsUtil.readDirPathSync(this.metadataStore.dataDir)
    if (path !== undefined) {
      this.metadataStore.dataDir = path
    }
  }

  start() {
    this.metadataStore.save()
    if (!this.dataStore.load()) {
      this.dataStore.save()
    }
    this.dataStore.startAutoSave()
    this.dialogRef.close()
  }
}
