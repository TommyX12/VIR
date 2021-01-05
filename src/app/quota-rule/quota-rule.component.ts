import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnInit,
  Output,
  ViewChild,
} from '@angular/core'
import {DataStore} from '../data/data-store'
import {MatSnackBar} from '@angular/material/snack-bar'
import {QuotaRuleID} from '../data/common'
import {QuotaRuleNode} from '../quota-list/quota-list.component'

export enum QuotaRuleDroppedInsertionType {
  ABOVE,
  BELOW,
}

export interface QuotaRuleDroppedEvent {
  draggedQuotaRuleID: QuotaRuleID
  receiverQuotaRuleID: QuotaRuleID
  insertionType: QuotaRuleDroppedInsertionType
}

@Component({
  selector: 'app-quota-rule',
  templateUrl: './quota-rule.component.html',
  styleUrls: ['./quota-rule.component.scss'],
})
export class QuotaRuleComponent implements OnInit {
  @ViewChild('decorationContainer') decorationContainerRef?: ElementRef

  // @ts-ignore
  @Input() node: QuotaRuleNode

  /**
   * This is for correctly computing drag and drop
   */
  @Input() itemHeight: number = 35

  @Output() bodyClicked = new EventEmitter()
  @Output() quotaRuleDropped = new EventEmitter<QuotaRuleDroppedEvent>()

  constructor(
    private readonly dataStore: DataStore,
    private readonly zone: NgZone,
    private readonly snackBar: MatSnackBar,
  ) {
  }

  ngOnInit(): void {
  }

  onBodyClicked() {
    this.bodyClicked.emit()
  }

  onDrop(event: DragEvent) {
    const data = event.dataTransfer?.getData('text')
    if (!data || !data.startsWith('quotaRuleID ')) return

    const quotaRuleID = Number(data.substring(12))

    // @ts-ignore
    const rect = event.target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const yPercent = y / this.itemHeight
    let insertionType: QuotaRuleDroppedInsertionType
    if (yPercent < 0.5) {
      insertionType = QuotaRuleDroppedInsertionType.ABOVE
    } else {
      insertionType = QuotaRuleDroppedInsertionType.BELOW
    }

    this.quotaRuleDropped.emit({
      draggedQuotaRuleID: quotaRuleID,
      receiverQuotaRuleID: this.node.id,
      insertionType,
    })
  }

  onDragReact = (event: DragEvent) => {
    // @ts-ignore
    const rect = event.target.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const yPercent = y / this.itemHeight
    const element = this.decorationContainerRef?.nativeElement
    if (element) {
      element.style.borderTop = ''
      element.style.borderBottom = ''
      if (yPercent < 0.5) {
        element.style.borderTop = '5px solid #4488ff'
      } else {
        element.style.borderBottom = '5px solid #4488ff'
      }
    }
  }

  clearDragReact = () => {
    const element = this.decorationContainerRef?.nativeElement
    if (element) {
      element.style.borderTop = ''
      element.style.borderBottom = ''
    }
  }

  deleteRule() {
    this.dataStore.removeQuotaRule(this.node.id)
  }
}
