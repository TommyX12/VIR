import {Injectable} from '@angular/core'
import {FsUtil} from '../util/fs-util'
import {stableStringify} from '../util/util'

const METADATA_FILE_NAME = 'vir-metadata.json'
const TEMP_METADATA_FILE_NAME_1 = 'vir-metadata.tmp1.json'
const TEMP_METADATA_FILE_NAME_2 = 'vir-metadata.tmp2.json'

@Injectable()
export class MetadataStore {
  dataDir: string
  saveFilePath: string
  increasePostponementEffort: boolean

  constructor(
    private readonly fsUtil: FsUtil,
  ) {
    const HOME_DIR = fsUtil.homeDir()
    const METADATA_PATH = fsUtil.path.join(HOME_DIR, METADATA_FILE_NAME)
    const DEFAULT_DATA_DIR = fsUtil.path.join(HOME_DIR, 'vir-data')
    this.dataDir = DEFAULT_DATA_DIR

    this.saveFilePath = METADATA_PATH
    this.increasePostponementEffort = false

    this.load()
    this.save()
  }

  getSaveFilePath() {
    return this.saveFilePath
  }

  save() {
    const filePath = this.getSaveFilePath()
    const text = stableStringify({
      dataDir: this.dataDir,
      increasePostponementEffort: this.increasePostponementEffort,
    })
    this.fsUtil.safeWriteFileSync(
      filePath, text, TEMP_METADATA_FILE_NAME_1, TEMP_METADATA_FILE_NAME_2)
  }

  /**
   * Return if load successful
   */
  load() {
    const filePath = this.getSaveFilePath()
    try {
      const text = this.fsUtil.readFileTextSync(filePath)
      if (text === undefined) return false
      const data = JSON.parse(text)
      this.dataDir = data.dataDir
      this.increasePostponementEffort = !!data.increasePostponementEffort
    } catch (e) {
      console.log(e)
      return false
    }
    return true
  }
}
