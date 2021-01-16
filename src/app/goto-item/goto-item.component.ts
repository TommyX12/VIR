import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnInit,
  ViewChild,
} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {DataStore, DataStoreAutoCompleter} from '../data/data-store'
import {BehaviorSubject} from 'rxjs'

export interface GotoItemConfig {
}

@Component({
  selector: 'app-goto-item',
  templateUrl: './goto-item.component.html',
  styleUrls: ['./goto-item.component.scss'],
})
export class GotoItemComponent implements OnInit, AfterViewInit {
  static readonly DIALOG_WIDTH = '500px'

  // @ts-ignore
  @ViewChild('itemInput') itemInput: ElementRef

  private _itemKey = ''
  filteredKeys = new BehaviorSubject<string[]>([])
  autoCompleter: DataStoreAutoCompleter

  constructor(
    public dialogRef: MatDialogRef<GotoItemComponent>,
    @Inject(MAT_DIALOG_DATA) public data: GotoItemConfig,
    private readonly dataStore: DataStore) {
    this.autoCompleter = dataStore.createAutoCompleter()
  }

  ngOnInit(): void {
  }

  get itemKey() {
    return this._itemKey
  }

  set itemKey(value: string) {
    this._itemKey = value
    this.filteredKeys.next(this.autoCompleter.queryKeys(value, 10))
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.itemInput?.nativeElement?.focus()
      this.itemInput?.nativeElement?.select()
    })
  }

  close() {
    this.dialogRef.close()
  }

  go() {
    const itemID = this.autoCompleter.keyToID(this.itemKey)
    if (itemID === undefined) {
      this.errorItemNotFound()
      return
    }
    this.dialogRef.close(itemID)
  }

  errorItemNotFound() {
    alert('Error: Item not found')
  }

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.go()
    }
  }
}
