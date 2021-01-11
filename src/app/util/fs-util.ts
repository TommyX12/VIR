import {ElectronService} from '../core/services'
import {Injectable} from '@angular/core'
import * as fs from 'fs'
import * as path from 'path'

@Injectable()
export class FsUtil {
  fs: typeof fs
  path: typeof path

  constructor(private readonly els: ElectronService) {
    this.fs = els.fs
    this.path = els.path
  }

  homeDir() {
    return this.els.os.homedir()
  }

  readDirPathSync(defaultPath?: string) {
    const p = this.els.remote.dialog.showOpenDialogSync({
      defaultPath: defaultPath,
      properties: ['openDirectory'],
    })
    if (p === undefined) return undefined
    return p[0]
  }

  ensureParentDirExistsSync(filePath: string) {
    this.els.fs.mkdirSync(this.els.path.dirname(filePath), {
      recursive: true,
    })
  }

  readFileTextSync(filePath: string): string | undefined {
    if (this.els.fs.existsSync(filePath)) {
      return this.els.fs.readFileSync(filePath, {encoding: 'utf8'})
    } else {
      return undefined
    }
  }

  safeWriteFileSync(filePath: string, text: string,
                    tempFileName1: string,
                    tempFileName2: string) {
    this.ensureParentDirExistsSync(filePath)
    if (this.els.fs.existsSync(filePath)) {
      const dir = this.els.path.dirname(filePath)
      const tempFilePath1 = this.els.path.join(dir, tempFileName1)
      if (this.els.fs.existsSync(tempFilePath1)) {
        alert(
          `Unable to write file: temp file (${tempFilePath1}) already exists`)
      }
      const tempFilePath2 = this.els.path.join(dir, tempFileName2)
      if (this.els.fs.existsSync(tempFilePath2)) {
        alert(
          `Unable to write file: temp file (${tempFilePath2}) already exists`)
      }
      this.els.fs.writeFileSync(tempFilePath1, text)
      this.els.fs.renameSync(filePath, tempFilePath2)
      this.els.fs.renameSync(tempFilePath1, filePath)
      this.els.fs.unlinkSync(tempFilePath2)
    } else {
      this.els.fs.writeFileSync(filePath, text)
    }
  }
}

