import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core'
import {ItemNode} from '../items/items.component'
import {DataStore, ItemStatus} from '../data/data-store'

@Component({
  selector: 'app-item',
  templateUrl: './item.component.html',
  styleUrls: ['./item.component.scss'],
})
export class ItemComponent implements OnInit {
  // @ts-ignore
  @Input() node: ItemNode

  @Output() bodyClicked = new EventEmitter()

  constructor(
    private readonly dataStore: DataStore,
  ) {
  }

  ngOnInit(): void {
  }

  onBodyClicked() {
    this.bodyClicked.emit()
  }

  getChipColor() {
    return this.done ? '#00000000' : this.node.color.string()
  }

  get done() {
    return this.node.status === ItemStatus.COMPLETED
  }

  set done(value: boolean) {
    const draft = this.dataStore.getItem(this.node.id)!.toDraft()
    draft.status = value ? ItemStatus.COMPLETED : ItemStatus.ACTIVE
    this.dataStore.updateItem(draft)
  }

  toggleDone() {
    this.done = !this.done
  }
}
