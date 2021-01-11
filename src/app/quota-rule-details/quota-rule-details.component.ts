import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnInit,
  ViewChild,
} from '@angular/core'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {DataStore, InvalidQuotaRuleError} from '../data/data-store'
import {
  ConstantQuotaRule,
  DayID,
  isConstantQuotaRule,
  QuotaRule,
  QuotaRuleDraft,
  QuotaRuleID,
} from '../data/common'
import {MatDatepickerInputEvent} from '@angular/material/datepicker'
import {
  dateAddDay,
  dateToDayID,
  dayIDToDate,
  parseMatDatePicker,
  startOfWeek,
} from '../util/time-util'
import {arrayShallowEquals, arrayToMap} from '../util/util'

export interface QuotaRuleDetailsConfig {
  isEditing?: boolean
  quotaRule?: QuotaRule
}

const RANGE_TYPE_OPTIONS: {
  type: string,
  displayName: string,
  apply(draft: QuotaRuleDraft<ConstantQuotaRule>, date?: DayID, endDate?: DayID)
}[] = [
  {
    type: 'always',
    displayName: 'Always',
    apply(draft: QuotaRuleDraft<ConstantQuotaRule>) {
      draft.firstDate = undefined
      draft.lastDate = undefined
    },
  },
  {
    type: 'between',
    displayName: 'Between',
    apply(draft: QuotaRuleDraft<ConstantQuotaRule>, date?: DayID,
          endDate?: DayID) {
      draft.firstDate = date
      draft.lastDate = endDate
    },
  },
  {
    type: 'startingFrom',
    displayName: 'Starting from',
    apply(draft: QuotaRuleDraft<ConstantQuotaRule>, date?: DayID) {
      draft.firstDate = date
      draft.lastDate = undefined
    },
  },
  {
    type: 'endingOn',
    displayName: 'Ending on',
    apply(draft: QuotaRuleDraft<ConstantQuotaRule>, date?: DayID) {
      draft.firstDate = undefined
      draft.lastDate = date
    },
  },
]

const RANGE_TYPE_OPTIONS_BY_TYPE = arrayToMap(
  RANGE_TYPE_OPTIONS, item => item.type)

const PRIMARY_TYPE_OPTIONS: {
  type: string,
  displayName: string,
  apply(draft: QuotaRuleDraft<ConstantQuotaRule>, date: DayID | undefined,
        dayOfWeek: number[])
}[] = [
  {
    type: 'on',
    displayName: 'On',
    apply(draft, date) {
      draft.firstDate = date
      draft.lastDate = date
    },
  },
  {
    type: 'everyday',
    displayName: 'Everyday',
    apply(draft) {
    },
  },
  {
    type: 'weekday',
    displayName: 'Every Weekday',
    apply(draft) {
      draft.dayOfWeek = [1, 2, 3, 4, 5]
    },
  },
  {
    type: 'weekend',
    displayName: 'Every Weekend',
    apply(draft) {
      draft.dayOfWeek = [0, 6]
    },
  },
  {
    type: 'custom',
    displayName: 'Custom',
    apply(draft, date, dayOfWeek) {
      draft.dayOfWeek = [...dayOfWeek]
    },
  },
]

const PRIMARY_TYPE_OPTIONS_BY_TYPE = arrayToMap(
  PRIMARY_TYPE_OPTIONS, item => item.type)

const DAY_OF_WEEK_OPTIONS = (() => {
  const result: { value: number, dowDate: Date }[] = []
  const start = startOfWeek(new Date())
  for (let i = 0; i < 7; ++i) {
    result.push({value: i, dowDate: dateAddDay(start, i)})
  }
  return result
})()

@Component({
  selector: 'app-quota-rule-details',
  templateUrl: './quota-rule-details.component.html',
  styleUrls: ['./quota-rule-details.component.scss'],
})
export class QuotaRuleDetailsComponent implements OnInit, AfterViewInit {
  static readonly DIALOG_WIDTH = '600px'

  // @ts-ignore
  @ViewChild('valueInput') valueInput: ElementRef

  isEditing: boolean
  quotaRuleID?: QuotaRuleID
  rangeType = 'always'
  primaryType = 'on'
  date: Date | null = null
  endDate: Date | null = null
  dayOfWeek: number[] = []
  value: number = 0

  rangeTypeOptions = RANGE_TYPE_OPTIONS
  primaryTypeOptions = PRIMARY_TYPE_OPTIONS
  dayOfWeekOptions = DAY_OF_WEEK_OPTIONS

  constructor(
    public dialogRef: MatDialogRef<QuotaRuleDetailsComponent>,
    private readonly dataStore: DataStore,
    @Inject(MAT_DIALOG_DATA) public data: QuotaRuleDetailsConfig,
  ) {
    this.isEditing = !!data.isEditing

    if (this.isEditing) {
      const quotaRule = data.quotaRule
      if (quotaRule === undefined) {
        throw new Error('isEditing is true but data.quotaRule is not given')
      }
      this.quotaRuleID = quotaRule.id
      this.date = quotaRule.firstDate === undefined ? null :
        dayIDToDate(quotaRule.firstDate)
      this.endDate = quotaRule.lastDate === undefined ? null :
        dayIDToDate(quotaRule.lastDate)
      if (isConstantQuotaRule(quotaRule)) {
        this.value = quotaRule.value
        this.dayOfWeek = [...quotaRule.dayOfWeek]
      } else {
        console.log(`WARNING: QuotaRule type ${quotaRule.type} not supported`)
      }

      // Deduce info

      if (this.date !== null && this.endDate !== null &&
        dateToDayID(this.date) === dateToDayID(this.endDate)) {
        this.primaryType = 'on'
      } else {
        if (this.date === null) {
          if (this.endDate === null) {
            this.rangeType = 'always'
          } else {
            this.rangeType = 'endingOn'
            this.date = this.endDate
            this.endDate = null
          }
        } else {
          if (this.endDate === null) {
            this.rangeType = 'startingFrom'
          } else {
            this.rangeType = 'between'
          }
        }

        this.dayOfWeek.sort((a, b) => a - b)
        if (this.dayOfWeek.length === 0 ||
          arrayShallowEquals(this.dayOfWeek, [0, 1, 2, 3, 4, 5, 6])) {
          this.primaryType = 'everyday'
        } else if (arrayShallowEquals(this.dayOfWeek, [0, 6])) {
          this.primaryType = 'weekend'
          this.dayOfWeek = []
        } else if (arrayShallowEquals(this.dayOfWeek, [1, 2, 3, 4, 5])) {
          this.primaryType = 'weekday'
          this.dayOfWeek = []
        } else {
          this.primaryType = 'custom'
        }
      }

    } else {
      this.quotaRuleID = undefined
    }
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.valueInput?.nativeElement?.focus()
      this.valueInput?.nativeElement?.select()
    })
  }

  close() {
    this.dialogRef.close()
  }

  get valueString() {
    return this.value.toString()
  }

  set valueString(value: string) {
    let v = Number(value)
    if (isNaN(v) || v < 0) {
      v = 0
    }
    this.value = v
  }

  save() {
    // Finalize
    const dateDayID = this.date === null ? undefined : dateToDayID(this.date)
    const endDateDayID = this.endDate === null ? undefined :
      dateToDayID(this.endDate)
    const draft: QuotaRuleDraft<ConstantQuotaRule> = {
      type: 'constant',
      id: this.quotaRuleID === undefined ? -1 : this.quotaRuleID,
      value: this.value,
      dayOfWeek: [],
    }
    RANGE_TYPE_OPTIONS_BY_TYPE.get(this.rangeType)
      ?.apply(draft, dateDayID, endDateDayID)
    PRIMARY_TYPE_OPTIONS_BY_TYPE.get(this.primaryType)
      ?.apply(draft, dateDayID, this.dayOfWeek)
    try {
      if (this.isEditing) {
        this.dataStore.updateQuotaRule(draft)
      } else {
        this.dataStore.addQuotaRule(draft)
      }
    } catch (e) {
      this.errorInvalidQuotaRule(e)
      return
    }
    this.close()
  }

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.save()
    }
  }

  delete() {
    if (this.quotaRuleID === undefined) return
    this.dataStore.removeQuotaRule(this.quotaRuleID)
    this.close()
  }

  onDateChanged(event: MatDatepickerInputEvent<unknown, unknown>) {
    let dayID = parseMatDatePicker(event, this.dataStore.getCurrentDayID())
    if (dayID === undefined) {
      this.clearDate()
    } else {
      this.date = dayIDToDate(dayID)
    }
  }

  onEndDateChanged(event: MatDatepickerInputEvent<unknown, unknown>) {
    let dayID = parseMatDatePicker(event, this.dataStore.getCurrentDayID())
    if (dayID === undefined) {
      this.endDate = null
    } else {
      this.endDate = dayIDToDate(dayID)
    }
  }

  clearDate() {
    this.date = null
    this.endDate = null
  }

  get dateType() {
    if (this.rangeType === 'always') return 'none'
    if (this.rangeType === 'between') return 'range'
    return 'date'
  }

  private errorInvalidQuotaRule(e: any) {
    alert((e as InvalidQuotaRuleError).message)
  }
}

