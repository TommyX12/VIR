export function removeValue<T>(array: T[], value: T) {
  const index = array.indexOf(value)
  if (index > -1) {
    array.splice(index, 1)
  }
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
