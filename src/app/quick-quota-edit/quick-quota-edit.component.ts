import {
  AfterViewInit,
  Component,
  ElementRef,
  Inject,
  OnInit,
  ViewChild,
} from '@angular/core'
import {DayID} from '../data/common'
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog'
import {DataStore} from '../data/data-store'

export interface QuickQuotaEditConfig {
  dayID: DayID
  initialValue: number
}

@Component({
  selector: 'app-quick-quota-edit',
  templateUrl: './quick-quota-edit.component.html',
  styleUrls: ['./quick-quota-edit.component.scss'],
})
export class QuickQuotaEditComponent implements OnInit, AfterViewInit {
  static readonly DIALOG_WIDTH = '500px'

  // @ts-ignore
  @ViewChild('quotaInput') quotaInput: ElementRef

  dayID: DayID
  value: number

  constructor(
    public dialogRef: MatDialogRef<QuickQuotaEditComponent>,
    @Inject(MAT_DIALOG_DATA) public data: QuickQuotaEditConfig,
    private readonly dataStore: DataStore) {
    this.dayID = data.dayID
    this.value = data.initialValue
  }

  ngOnInit(): void {
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.quotaInput?.nativeElement?.focus()
      this.quotaInput?.nativeElement?.select()
    })
  }

  close() {
    this.dialogRef.close()
  }

  save() {
    if (this.value < 0) {
      this.errorInvalidValue()
      return
    }
    this.dataStore.quickEditQuotaRule(this.dayID, this.value)
    this.close()
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

  onFormKeyDown(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      this.save()
    }
  }

  private errorInvalidValue() {
    alert('Error: invalid quota value')
  }
}
