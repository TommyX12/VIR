export function removeValue<T>(array: T[], value: T) {
  const index = array.indexOf(value)
  if (index > -1) {
    array.splice(index, 1)
  }
}

export function arrayToMap<T, K>(array: T[], getKey: (T) => K): Map<K, T> {
  const result = new Map<K, T>()
  const size = array.length
  for (let i = 0; i < size; i++) {
    const item = array[i]
    result.set(getKey(item), item)
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

export function getOrCreate<K, V>(map: Map<K, V>, key: K, creator: () => V) {
  let result = map.get(key)
  if (result === undefined) {
    result = creator()
    map.set(key, result)
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
}
