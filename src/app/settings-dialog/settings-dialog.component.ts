import {Component, Inject, OnInit} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {MetadataStore} from '../data/metadata-store'
import {DataStore} from '../data/data-store'
import {FsUtil} from '../util/fs-util'

export interface SettingsDialogConfig {
}

@Component({
  selector: 'app-settings-dialog',
  templateUrl: './settings-dialog.component.html',
  styleUrls: ['./settings-dialog.component.scss'],
})
export class SettingsDialogComponent implements OnInit {
  static readonly DIALOG_WIDTH = '600px'

  dataDir: string

  constructor(public dialogRef: MatDialogRef<SettingsDialogComponent>,
              private readonly metadataStore: MetadataStore,
              private readonly dataStore: DataStore,
              private readonly fsUtil: FsUtil,
              @Inject(MAT_DIALOG_DATA) public data: SettingsDialogConfig) {
    this.dataDir = metadataStore.dataDir
  }

  ngOnInit(): void {
  }

  close() {
    this.dialogRef.close()
  }

  save() {
    this.metadataStore.dataDir = this.dataDir
    this.metadataStore.save()
    this.close()
  }

  changeDataDir() {
    const path = this.fsUtil.readDirPathSync(this.dataDir)
    if (path !== undefined) {
      this.dataDir = path
    }
  }

  reloadData() {
    if (confirm(`Reload data from "${this.dataDir}" and set as data path?`)) {
      const oldDataDir = this.metadataStore.dataDir
      this.metadataStore.dataDir = this.dataDir
      if (this.dataStore.load()) {
        this.metadataStore.save()
        this.close()
      } else {
        alert('Error: Load failed')
        this.metadataStore.dataDir = oldDataDir
      }
    }
  }
}
