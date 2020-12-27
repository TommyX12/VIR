import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  ViewChild,
} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {
  DataStore,
  DataStoreAutoCompleter,
  Item,
  ItemDraft,
  ItemStatus,
} from '../data/data-store'
import Color from 'color'
import {ItemID} from '../data/common'
import {BehaviorSubject} from 'rxjs'
import {FormControl} from '@angular/forms'

export interface ItemDetailsConfig {
  item?: Item

  /**
   * When item is present, this field is ignored.
   */
  initialColor?: Color

  /**
   * When item is present, this field is ignored.
   */
  initialParent?: ItemID
}

@Component({
  selector: 'app-item-details',
  templateUrl: './item-details.component.html',
  styleUrls: ['./item-details.component.scss'],
})
export class ItemDetailsComponent implements AfterViewInit {
  static readonly DIALOG_WIDTH = '500px'

  // @ts-ignore
  @ViewChild('nameInput') nameInput: ElementRef

  draft: ItemDraft
  isAddingNewItem = false

  autoCompleter: DataStoreAutoCompleter
  originalParentItemKey?: string
  originalParentItemID?: ItemID
  private _parentItemKey: string = ''
  filteredParentKeys = new BehaviorSubject<string[]>([])

  formControl = new FormControl()

  constructor(
    public dialogRef: MatDialogRef<ItemDetailsComponent>,
    private readonly dataStore: DataStore,
    @Inject(MAT_DIALOG_DATA) public data: ItemDetailsConfig) {
    const item = data.item
    if (item === undefined) {
      this.draft = new ItemDraft()
      this.draft.color = data.initialColor
      this.draft.parentID = data.initialParent
      this.isAddingNewItem = true
    } else {
      this.draft = item.toDraft()
      this.isAddingNewItem = false
    }

    this.autoCompleter = dataStore.getAutoCompleter()
    if (this.draft.parentID !== undefined) {
      this.originalParentItemID = this.draft.parentID
      this.originalParentItemKey =
        this.autoCompleter.idToKey(this.draft.parentID)
      if (this.originalParentItemKey === undefined) {
        throw new Error('Parent item key not found')
      }
      this._parentItemKey = this.originalParentItemKey
    }
  }

  get colorString() {
    const color = this.draft.color
    if (color === undefined) {
      return '#888888'
    }
    return color.hex()
  }

  set colorString(value: string) {
    this.draft.color = Color(value)
  }

  get useParentColor() {
    return this.draft.color === undefined
  }

  set useParentColor(value: boolean) {
    if (value) {
      this.draft.color = undefined
    } else {
      if (this.isAddingNewItem) {
        this.draft.color = Color('#888888')
      } else {
        this.draft.color = this.dataStore.getItemColor(this.draft.id)
      }
    }
  }

  get completed() {
    return this.draft.status === ItemStatus.COMPLETED
  }

  set completed(value: boolean) {
    this.draft.status = value ? ItemStatus.COMPLETED : ItemStatus.ACTIVE
  }

  get cost() {
    return this.draft.cost.toString()
  }

  set cost(value: string) {
    let v = Number(value)
    if (isNaN(v) || v < 0) {
      v = 0
    }
    this.draft.cost = v
  }

  get priority() {
    return this.draft.priority.toString()
  }

  set priority(value: string) {
    let v = Number(value)
    if (isNaN(v) || v < 0) {
      v = 0
    }
    this.draft.priority = v
  }

  get parentItemKey() {
    return this._parentItemKey
  }

  set parentItemKey(value: string) {
    this._parentItemKey = value
    this.filteredParentKeys.next(this.autoCompleter.queryKeys(value, 10))
  }

  close(): void {
    this.dialogRef.close()
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.nameInput?.nativeElement?.focus()
      this.nameInput?.nativeElement?.select()
    })
  }

  save() {
    // Validation
    // TODO refactor: move this
    let parentID: ItemID | undefined = undefined
    if (this.parentItemKey !== '') {
      parentID = (this.originalParentItemKey !== undefined &&
        this.parentItemKey === this.originalParentItemKey) ?
        this.originalParentItemID :
        this.autoCompleter.keyToID(this._parentItemKey)
      if (parentID === undefined) {
        this.errorParentNotFound()
        return
      }
      if (!this.isAddingNewItem &&
        !this.dataStore.canBeParentOf(this.draft.id, parentID)) {
        this.errorInvalidParent()
        return
      }
    }
    this.draft.parentID = parentID

    if (this.draft.name === '' || this.draft.name.indexOf(':') !== -1 ||
      this.draft.name.indexOf('#') !== -1) {
      this.errorInvalidName()
      return
    }

    if (this.draft.cost < 0) {
      this.errorInvalidCost()
    }

    // Finalize
    if (this.isAddingNewItem) {
      this.dataStore.addItem(this.draft)
    } else {
      this.dataStore.updateItem(this.draft)
    }
    this.close()
  }

  private errorParentNotFound() {
    alert('Error: parent not found')
  }

  private errorInvalidCost() {
    alert('Error: invalid cost')
  }

  private errorInvalidParent() {
    alert('Error: parent is invalid')
  }

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.save()
    }
  }

  private errorInvalidName() {
    alert('Error: invalid name')
  }

  setRandomColor() {
    this.draft.color = this.dataStore.generateColor()
  }
}
