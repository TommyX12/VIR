import * as stringify from 'json-stable-stringify'

export function isObject(value: any) {
  return typeof value === 'object' && value !== null
}

export function removeValue<T>(array: T[], value: T) {
  const index = array.indexOf(value)
  if (index > -1) {
    array.splice(index, 1)
  }
}

export function identity<T>(value: T) {
  return value
}

export function arrayToMap<T, K, V = T>(array: T[],
                                        getKey: (item: T) => K,
                                        getValue?: (item: T) => V): Map<K, V> {
  const result = new Map<K, V>()
  const size = array.length
  for (let i = 0; i < size; i++) {
    const item = array[i]
    result.set(
      getKey(item),
      getValue === undefined ? (item as unknown as V) : getValue(item),
    )
  }
  return result
}

export function arrayShallowEquals(a: any[], b: any[]) {
  const length = a.length
  if (length !== b.length) return false
  for (let i = 0; i < length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

export function random(min: number, max: number) {
  return min + Math.random() * (max - min)
}

export function withDefault<T>(value: T | undefined, defaultValue: T): T {
  return value === undefined ? defaultValue : value
}

export function optionalClamp(value: number, low?: number, high?: number) {
  if (low !== undefined && value < low) return low
  if (high !== undefined && value > high) return high
  return value
}

export function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), high)
}

export function getOrCreate<K, V>(map: Map<K, V>, key: K, creator: () => V) {
  let result = map.get(key)
  if (result === undefined) {
    result = creator()
    map.set(key, result)
  }
  return result
}

export function getOrDefault<K, V>(map: Map<K, V>, key: K, defaultValue: V) {
  let result = map.get(key)
  if (result === undefined) {
    return defaultValue
  }
  return result
}

/**
 * Move the element from oldIndex to before the element pointed to by newIndex.
 * NOTE: This function ensures that the element is inserted to before the
 * element pointed to by the newIndex *before* the deletion. So arrayMove([1,
 * 2, 3], 0, 2) gives [2, 1, 3] instead of [2, 3, 1].
 */
export function arrayMove(array: any[], oldIndex: number, newIndex: number) {
  if (oldIndex === newIndex) {
    return
  }
  if (oldIndex < newIndex) {
    array.splice(newIndex - 1, 0, array.splice(oldIndex, 1)[0])
  } else {
    array.splice(newIndex, 0, array.splice(oldIndex, 1)[0])
  }
}

export class Counter<K> {
  private data = new Map<K, number>()

  add(key: K, amount: number) {
    this.data.set(key, (this.data.get(key) || 0) + amount)
  }

  get(key: K) {
    return this.data.get(key) || 0
  }

  clear() {
    this.data = new Map<K, number>()
  }

  copyFrom(other: Counter<K>) {
    this.data.clear()
    other.data.forEach((count, key) => {
      this.data.set(key, count)
    })
  }
}

export function genericCompare<T>(a: T, b: T): number {
  if (a == b) return 0
  if (a < b) return -1
  return 1
}

/**
 * Returns the *element-indices* of the longest increasing subsequence.
 * If array contains duplicate, computes longest non-decreasing subsequence.
 * Reference: https://en.wikipedia.org/wiki/Longest_increasing_subsequence
 */
export function longestIncreasingSubsequence<T>(
  array: T[], compare: (a: T, b: T) => number = genericCompare): number[] {
  const n = array.length
  const prev: number[] = []
  const tails: number[] = [-1]

  let length = 0
  for (let i = 0; i < n; i++) {
    let lo = 1, hi = length
    while (lo <= hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (compare(array[tails[mid]], array[i]) < 0) {
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const newLength = lo
    prev.push(tails[newLength - 1])

    if (newLength > length) {
      length = newLength
      tails.push(i)
    } else {
      tails[newLength] = i
    }
  }

  const result: number[] = []
  let k = tails[length]
  for (let i = length - 1; i >= 0; i--) {
    result.push(k)
    k = prev[k]
  }
  result.reverse()
  return result
}

export function linearMap(inStart: number, inEnd: number, outStart: number,
                          outEnd: number, value: number) {
  return outStart + (value - inStart) * (outEnd - outStart) / (inEnd - inStart)
}

export function clampedLinearMap(inStart: number, inEnd: number,
                                 outStart: number,
                                 outEnd: number, value: number) {
  return Math.min(
    Math.max(linearMap(inStart, inEnd, outStart, outEnd, value), outStart),
    outEnd,
  )
}

export function lerp(a: number, b: number, value: number) {
  return a + (b - a) * value
}

export class BinaryHeapStrategy<T> implements QueueStrategy<T> {

  private comparator: Comparator<T>
  private data: T[]

  constructor(options: Options<T>) {
    this.comparator = options.comparator
    this.data = options.initialValues ? options.initialValues.slice(0) : []
    this._heapify()
  }

  private _heapify() {
    if (this.data.length > 0) {
      for (let i = 0; i < this.data.length; i++) {
        this._bubbleUp(i)
      }
    }
  }

  public queue(value: T) {
    this.data.push(value)
    this._bubbleUp(this.data.length - 1)
  }

  public dequeue(): T {
    const ret = this.data[0]
    const last = this.data.pop()
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last
      this._bubbleDown(0)
    }
    return ret
  }

  public peek(): T {
    return this.data[0]
  }

  public clear() {
    this.data.length = 0
  }

  public _bubbleUp(pos: number) {
    while (pos > 0) {
      const parent = (pos - 1) >>> 1
      if (this.comparator(this.data[pos], this.data[parent]) < 0) {
        const x = this.data[parent]
        this.data[parent] = this.data[pos]
        this.data[pos] = x
        pos = parent
      } else {
        break
      }
    }
  }

  public _bubbleDown(pos: number) {
    let last = this.data.length - 1
    while (true) {
      const left = (pos << 1) + 1
      const right = left + 1
      let minIndex = pos
      if (left <= last &&
        this.comparator(this.data[left], this.data[minIndex]) < 0) {
        minIndex = left
      }
      if (right <= last &&
        this.comparator(this.data[right], this.data[minIndex]) < 0) {
        minIndex = right
      }
      if (minIndex !== pos) {
        const x = this.data[minIndex]
        this.data[minIndex] = this.data[pos]
        this.data[pos] = x
        pos = minIndex
      } else {
        break
      }
    }
    return void 0
  }
}

export type Comparator<T> = (a: T, b: T) => number;

export interface Options<T> {
  comparator: Comparator<T>;
  initialValues?: T[];
}

export interface QueueStrategy<T> {
  queue(value: T): void;

  dequeue(): T;

  peek(): T;

  clear(): void;
}

export class PriorityQueue<T> {
  private _length: number = 0
  public get length() {
    return this._length
  }

  private strategy: QueueStrategy<T>

  public constructor(options: Options<T>) {
    this._length = options.initialValues ? options.initialValues.length : 0
    this.strategy = new BinaryHeapStrategy(options)
  }

  public queue(value: T) {
    this._length++
    this.strategy.queue(value)
  }

  public dequeue() {
    if (!this._length) throw new Error('Empty queue')
    this._length--
    return this.strategy.dequeue()
  }

  public peek() {
    if (!this._length) throw new Error('Empty queue')
    return this.strategy.peek()
  }

  public clear() {
    this._length = 0
    this.strategy.clear()
  }
}

export function stableStringify(obj: any, options: any = {space: 2}): string {
  return stringify(obj, options)
}
