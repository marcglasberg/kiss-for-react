// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import SerializeOptions from './SerializeOptions';
import {
  BUILTIN_ARRAYBUFFER,
  BUILTIN_BOOLEAN,
  BUILTIN_DATAVIEW,
  BUILTIN_DATE,
  BUILTIN_INTL_LOCALE,
  BUILTIN_MAP,
  BUILTIN_REGEXP,
  BUILTIN_SET,
  BUILTIN_SHAREDARRAYBUFFER,
  BUILTIN_STRING,
  CLASSNAMES_WHOSE_ENUMERABLE_PROPERTIES_SHOULD_BE_IGNORED,
  ERROR_CLASSES,
  ESSERIALIZER_NULL,
  hasName,
  INTL_CLASSES,
  TYPE_BIG_INT,
  TYPE_FIELD,
  TYPE_NOT_FINITE,
  TYPE_UNDEFINED,
  TYPED_ARRAY_CLASSES,
  VALUE_FIELD
} from './constant';
import { getClassKey, notObject } from './general';

/**
 * Converts `target` into a plain JSON-compatible value. Objects get a `*type` field with
 * their class name, so that they can be deserialized back into instances of that class.
 *
 * The `options` apply only to the top-level object, not to nested ones.
 * The `target` itself is never changed.
 */
function getSerializeValueWithClassName(target: any, options: SerializeOptions = {}): any {
  const primitiveValue = _serializePrimitive(target);
  if (primitiveValue !== ESSERIALIZER_NULL) {
    return primitiveValue;
  }

  if (Array.isArray(target)) {
    return _serializeArray(target);
  }

  const serializedObj: Record<string, any> = {};
  if (!_shouldIgnoreEnumerableProperties(target)) {
    _copySerializedProperties(target, serializedObj, options);
  }

  _appendClassInfoAndBuiltinData(target, serializedObj);
  return serializedObj;
}

/**
 * Copies the serialized enumerable properties of `source` into `dest`, skipping functions.
 * Properties in `options.ignoreProperties` are skipped, and properties in
 * `options.interceptProperties` are replaced by the result of their interceptor.
 */
function _copySerializedProperties(source: any, dest: Record<string, any>, options: SerializeOptions) {
  const ignored = options.ignoreProperties;
  const interceptors = options.interceptProperties;

  for (const key in source) {
    if (ignored?.includes(key)) {
      continue;
    }

    let value = source[key];
    if (interceptors && Object.prototype.hasOwnProperty.call(interceptors, key)) {
      value = interceptors[key].call(source, value);
    }
    if (typeof value === 'function') {
      continue;
    }

    dest[key] = getSerializeValueWithClassName(value);
  }

  // Interceptors may also add properties the object doesn't have.
  if (interceptors) {
    for (const key in interceptors) {
      if (key in dest || key in source || ignored?.includes(key)) {
        continue;
      }
      dest[key] = getSerializeValueWithClassName(interceptors[key].call(source, undefined));
    }
  }
}

/**
 * Adds the `*type` field to `serializedObj` (unless `target` is a plain object), and,
 * for built-in classes, the data needed to rebuild them.
 */
function _appendClassInfoAndBuiltinData(target: any, serializedObj: Record<string, any>) {
  let className: string = getClassKey(Object.getPrototypeOf(target).constructor);
  if (className === 'Object') {
    // In case the constructor is not in the prototype, such as Big in big.js.
    className = getClassKey(target.constructor);
  }
  if (className === 'Object') {
    return;
  }

  serializedObj[TYPE_FIELD] = className;

  if (hasName(ERROR_CLASSES, className)) {
    _appendErrorData(target, serializedObj);
    return;
  }

  const value = _getBuiltinValue(target, className);
  if (value !== ESSERIALIZER_NULL) {
    serializedObj[VALUE_FIELD] = value;
  }
}

/**
 * Returns the data needed to rebuild a built-in value, or `ESSERIALIZER_NULL` if `className`
 * is not a built-in class saved this way.
 */
function _getBuiltinValue(target: any, className: string): any {
  switch (className) {
    case BUILTIN_ARRAYBUFFER:
    case BUILTIN_SHAREDARRAYBUFFER:
      return Array.from(new Uint8Array(target));
    case BUILTIN_DATAVIEW:
      return Array.from(new Uint8Array(target.buffer, target.byteOffset, target.byteLength));
    case BUILTIN_BOOLEAN:
      return target.valueOf();
    case BUILTIN_STRING:
    case BUILTIN_INTL_LOCALE:
      return target.toString();
    case BUILTIN_DATE:
      return target.getTime(); // NaN for an invalid date, which JSON saves as null.
    case BUILTIN_REGEXP:
      return { source: target.source, flags: target.flags };
    case BUILTIN_MAP: // Saved as an array of [key, value] pairs.
    case BUILTIN_SET:
      return _serializeArray(Array.from(target));
  }
  if (hasName(TYPED_ARRAY_CLASSES, className)) {
    // Items may be non-finite numbers or BigInts, so they are serialized too.
    return _serializeArray(Array.from(target));
  }
  if (hasName(INTL_CLASSES, className)) {
    return target.resolvedOptions();
  }
  return ESSERIALIZER_NULL;
}

/** Errors keep their name, message and stack (and the inner errors of an `AggregateError`). */
function _appendErrorData(error: any, serializedObj: Record<string, any>) {
  if (error.name !== 'Error') {
    serializedObj.name = error.name;
  }
  if (error.message) {
    serializedObj.message = error.message;
  }
  if (error.stack) {
    serializedObj.stack = error.stack;
  }
  if (error instanceof AggregateError) {
    serializedObj.errors = getSerializeValueWithClassName(error.errors);
  }
}

/**
 * Serializes primitive values. Values JSON can't represent (undefined, Infinity, -Infinity,
 * NaN, and BigInt) become objects with a special `*type`. Returns `ESSERIALIZER_NULL` for objects.
 */
function _serializePrimitive(target: any) {
  if (target === undefined) {
    return { [TYPE_FIELD]: TYPE_UNDEFINED };
  }
  if (typeof target === 'number' && !Number.isFinite(target)) {
    return { [TYPE_FIELD]: TYPE_NOT_FINITE, [VALUE_FIELD]: target.toString() };
  }
  if (typeof target === 'bigint') {
    return { [TYPE_FIELD]: TYPE_BIG_INT, [VALUE_FIELD]: target.toString() };
  }
  if (notObject(target)) {
    return target;
  }
  return ESSERIALIZER_NULL;
}

function _serializeArray(arr: readonly any[]): any[] {
  return arr.map((item) => getSerializeValueWithClassName(item));
}

function _shouldIgnoreEnumerableProperties(target: any): boolean {
  const className: string = Object.getPrototypeOf(target).constructor.name;
  return CLASSNAMES_WHOSE_ENUMERABLE_PROPERTIES_SHOULD_BE_IGNORED.has(className);
}

export {
  getSerializeValueWithClassName
};
