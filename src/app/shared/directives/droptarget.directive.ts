import {
  AfterViewInit,
  Directive,
  ElementRef,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
} from '@angular/core'

const DRAG_REACTION_DELAY = 100

const NO_OP = () => {
}

@Directive({
  selector: '[appDroptarget]',
})
export class DroptargetDirective implements AfterViewInit, OnDestroy {
  @Input() onDragReact: (DragEvent) => void = NO_OP
  @Input() clearDragReact: (DragEvent) => void = NO_OP

  private dragReactionDelayHandle?: any

  private onDragEnter = (event: DragEvent) => {
    event.preventDefault()
  }

  private onDragOver = (event: DragEvent) => {
    event.preventDefault()

    if (this.dragReactionDelayHandle !== undefined) return

    this.dragReactionDelayHandle = setTimeout(() => {
      this.onDragReact(event)
      this.dragReactionDelayHandle = undefined
    }, DRAG_REACTION_DELAY)
  }

  private onDragLeave = (event: DragEvent) => {
    if (this.dragReactionDelayHandle !== undefined) {
      clearTimeout(this.dragReactionDelayHandle)
      this.dragReactionDelayHandle = undefined
    }
    this.clearDragReact(event)
  }

  @HostListener('drop', ['$event']) onDrop(event: DragEvent) {
    this.onDragLeave(event)
  }

  constructor(private readonly el: ElementRef, private readonly zone: NgZone) {
  }

  ngAfterViewInit() {
    this.zone.runOutsideAngular(() => {
      this.el.nativeElement?.addEventListener('dragenter', this.onDragEnter)
      this.el.nativeElement?.addEventListener('dragover', this.onDragOver)
      this.el.nativeElement?.addEventListener('dragleave', this.onDragLeave)
    })
  }

  ngOnDestroy() {
    this.el.nativeElement?.removeEventListener('dragenter', this.onDragEnter)
    this.el.nativeElement?.removeEventListener('dragover', this.onDragOver)
    this.el.nativeElement?.removeEventListener('dragleave', this.onDragLeave)
  }
}
