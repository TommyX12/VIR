import {stableStringify} from './util'

export type ObjectMap<V> = { [key: string]: V }

export type SerializedObjectMap = { readonly [key: string]: SerializedObject | undefined }

export type SerializedObject =
  number
  | null
  | string
  | boolean
  | SerializedObjectMap
  | SerializedObject[]

export function quickDeserialize<T>(value: SerializedObject | undefined,
                                    defaultValue: T) {
  return value === undefined ? defaultValue : (value as unknown as T)
}

export function quickDeserializeRequired<T>(value: SerializedObject | undefined) {
  if (value === undefined) {
    throw new Error('Failed to deserialize required field')
  }
  return value as unknown as T
}

export function serializePrimitiveToString(value: number | null | string | boolean): string {
  return `${value}`
}

export function deserializeNumberFromString(str: string): number {
  return Number(str)
}

export function serializePrimitiveToObject(value: number | null | string | boolean): SerializedObject {
  return value
}

export function deserializeNumberFromObject(obj: SerializedObject): number {
  return obj as unknown as number
}

export function serializeMapToObject<K, V>(map: Map<K, V>,
                                           keyToString: (key: K) => string,
                                           valueToObject: (value: V) => SerializedObject): SerializedObject {
  const result: ObjectMap<SerializedObject> = {}
  map.forEach((value, key) => {
    result[keyToString(key)] = valueToObject(value)
  })
  return result
}

export function deserializeMapFromObject<K, V>(obj: SerializedObject,
                                               keyFromString: (key: string) => K,
                                               valueFromObject: (obj: SerializedObject) => V): Map<K, V> {
  const result = new Map<K, V>()
  for (let key in (obj as SerializedObjectMap)) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = (obj as SerializedObjectMap)[key]
      if (value !== undefined) {
        result.set(
          keyFromString(key), valueFromObject(value))
      }
    }
  }
  return result
}

export function serializeArrayToObject<V>(array: V[],
                                          valueToObject: (value: V) => SerializedObject): SerializedObject {
  const result: SerializedObject[] = []
  array.forEach(value => {
    result.push(valueToObject(value))
  })
  return result
}

export function deserializeArrayFromObject<V>(obj: SerializedObject,
                                              valueFromObject: (obj: SerializedObject) => V): V[] {
  const result: V[] = [];
  (obj as SerializedObject[]).forEach(value => {
    result.push(valueFromObject(value))
  })
  return result
}

export function stringifySerializedObject(obj: SerializedObject): string {
  return stableStringify(obj)
}

export function parseSerializedObject(str: string): SerializedObject {
  return JSON.parse(str)
}

