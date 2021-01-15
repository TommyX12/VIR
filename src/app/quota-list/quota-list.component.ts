import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core'
import {DataStore} from '../data/data-store'
import {BehaviorSubject, Subscription} from 'rxjs'
import {MatDialog} from '@angular/material/dialog'
import {isConstantQuotaRule, QuotaRule, QuotaRuleID} from '../data/common'
import {debounceTime} from 'rxjs/operators'
import {CdkVirtualScrollViewport} from '@angular/cdk/scrolling'
import {DataAnalyzer} from '../data/data-analyzer'
import {
  QuotaRuleDroppedEvent,
  QuotaRuleDroppedInsertionType,
} from '../quota-rule/quota-rule.component'
import {QuotaRuleDetailsComponent} from '../quota-rule-details/quota-rule-details.component'
import {arrayShallowEquals} from '../util/util'
import {
  getLongDayIDDisplayName,
  getShowrtDOWDisplayName,
} from '../util/time-util'

const SEARCH_IDLE_DELAY = 200

export interface QuotaRuleNode {
  id: QuotaRuleID
  displayHtml: string
  value: number
}

@Component({
  selector: 'app-quota-list',
  templateUrl: './quota-list.component.html',
  styleUrls: ['./quota-list.component.scss'],
})
export class QuotaListComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('scrollViewport') scrollViewport?: CdkVirtualScrollViewport
  @ViewChild(
    'scrollViewport', {read: ElementRef}) scrollViewportElement?: ElementRef

  itemHeight = 35

  private onDataChanged = (dataStore: DataStore) => {
    this.refresh()
  }

  private onAnalyzerChanged = (dataAnalyzer: DataAnalyzer) => {
    // TODO implement me
    this.refresh()
  }

  private dataStoreChangeSubscription?: Subscription
  private dataAnalyzerChangeSubscription?: Subscription
  private searchQueryChangeSubscription?: Subscription
  private _searchQuery: string = ''
  private searchQueryValue = new BehaviorSubject<string>(this._searchQuery)

  data: QuotaRuleNode[] = []

  constructor(
    private readonly changeDetectorRef: ChangeDetectorRef,
    private readonly dataStore: DataStore,
    private readonly dataAnalyzer: DataAnalyzer,
    private readonly dialog: MatDialog,
    private readonly zone: NgZone,
  ) {
  }

  ngOnInit() {
    this.subscribeToData()

    this.searchQueryChangeSubscription = this.searchQueryValue.pipe(
      debounceTime(SEARCH_IDLE_DELAY),
    ).subscribe((value) => {
      this.refresh()
    })
  }

  ngAfterViewInit() {
  }

  ngOnDestroy() {
    this.unsubscribeFromData()

    this.searchQueryChangeSubscription?.unsubscribe()
    this.searchQueryChangeSubscription = undefined
  }

  get searchQuery() {
    return this._searchQuery
  }

  set searchQuery(value: string) {
    this._searchQuery = value
    this.searchQueryValue.next(value)
  }

  newRule() {
    const dialogRef = this.dialog.open(QuotaRuleDetailsComponent, {
      width: QuotaRuleDetailsComponent.DIALOG_WIDTH,
      data: {},
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  openDetails(id: QuotaRuleID) {
    const quotaRule = this.dataStore.getQuotaRule(id)
    const dialogRef = this.dialog.open(QuotaRuleDetailsComponent, {
      width: QuotaRuleDetailsComponent.DIALOG_WIDTH,
      data: {isEditing: true, quotaRule},
      hasBackdrop: true,
      disableClose: false,
      autoFocus: false,
    })
  }

  private refresh() {
    this.data = this.dataStore.state.quotaRuleOrder.map(quotaRuleID => {
      const quotaRule = this.dataStore.getQuotaRule(quotaRuleID)!
      let value = 0
      if (isConstantQuotaRule(quotaRule)) {
        value = quotaRule.value
      }
      return {
        id: quotaRule.id,
        displayHtml: QuotaListComponent.getDisplayHtml(quotaRule),
        value,
      }
    })
    this.changeDetectorRef.detectChanges()
  }

  trackByFn(index, node: QuotaRuleNode) {
    return node.id
  }

  subscribeToData() {
    if (this.dataStoreChangeSubscription === undefined) {
      this.dataStoreChangeSubscription =
        this.dataStore.onChange.subscribe(this.onDataChanged)
    }
    if (this.dataAnalyzerChangeSubscription === undefined) {
      this.dataAnalyzerChangeSubscription =
        this.dataAnalyzer.onChange.subscribe(this.onAnalyzerChanged)
    }
  }

  unsubscribeFromData() {
    this.dataStoreChangeSubscription?.unsubscribe()
    this.dataStoreChangeSubscription = undefined
    this.dataAnalyzerChangeSubscription?.unsubscribe()
    this.dataAnalyzerChangeSubscription = undefined
  }

  /**
   * Will be called when this as a tab is selected
   */
  onActivate() {
    this.subscribeToData()

    // This forces the virtual scroll to redraw
    const el = this.scrollViewportElement?.nativeElement
    el?.dispatchEvent(new Event('scroll'))
  }

  /**
   * Will be called when another tab is selected
   */
  onDeactivate() {
    this.unsubscribeFromData()
  }

  onNodeDragStart(node: QuotaRuleNode, event: DragEvent) {
    event.dataTransfer?.setData('text', 'quotaRuleID ' + node.id.toString())
  }

  onQuotaRuleDropped(event: QuotaRuleDroppedEvent) {
    if (event.insertionType === QuotaRuleDroppedInsertionType.ABOVE) {
      this.dataStore.quotaRuleMoveToBefore(
        event.draggedQuotaRuleID, event.receiverQuotaRuleID)
    } else if (event.insertionType === QuotaRuleDroppedInsertionType.BELOW) {
      this.dataStore.quotaRuleMoveToAfter(
        event.draggedQuotaRuleID, event.receiverQuotaRuleID)
    }
  }

  private static getDisplayHtml(quotaRule: QuotaRule) {
    if (!isConstantQuotaRule(quotaRule)) {
      return `(Quota rule type ${quotaRule.type} unsupported)`
    }

    let result: string[] = []

    let {firstDate, lastDate, value, dayOfWeek} = quotaRule

    dayOfWeek = [...dayOfWeek]
    dayOfWeek.sort((a, b) => a - b)

    if (firstDate !== undefined && lastDate !== undefined && firstDate ===
      lastDate) {
      result.push(`On <b>${getLongDayIDDisplayName(firstDate)}</b>`)
    } else {
      if (dayOfWeek.length === 0 ||
        arrayShallowEquals(dayOfWeek, [0, 1, 2, 3, 4, 5, 6])) {
        result.push('<b>Everyday</b>')
      } else if (arrayShallowEquals(dayOfWeek, [0, 6])) {
        result.push('Every <b>weekend</b>')
      } else if (arrayShallowEquals(dayOfWeek, [1, 2, 3, 4, 5])) {
        result.push('Every <b>weekday</b>')
      } else {
        result.push(
          `Every <b>${dayOfWeek.map(i => getShowrtDOWDisplayName(i))
            .join(', ')}</b>`)
      }

      if (firstDate === undefined) {
        if (lastDate === undefined) {
          // Do nothing
        } else {
          result.push(`ending on <b>${getLongDayIDDisplayName(lastDate)}</b>`)
        }
      } else {
        if (lastDate === undefined) {
          result.push(
            `starting from <b>${getLongDayIDDisplayName(firstDate)}</b>`)
        } else {
          result.push(`from <b>${getLongDayIDDisplayName(
            firstDate)}</b> to <b>${getLongDayIDDisplayName(lastDate)}</b>`)
        }
      }
    }

    return result.join(' ')
  }
}
