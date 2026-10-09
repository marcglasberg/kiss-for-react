// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import SerializeOptions from './SerializeOptions';
import {
  BUILTIN_PREFIX,
  TYPE_BIGINT,
  TYPE_FIELD,
  TYPE_HOLE,
  TYPE_NUMBER,
  TYPE_UNDEFINED,
  VALUE_FIELD,
} from './constant';
import { escapeKey, getClassKey, isNativeFunction, setOwnProperty } from './general';
import { findInheritedBuiltinType, getBuiltinTypeByConstructor } from './builtins';

/**
 * Converts `target` into a plain JSON-compatible value. Objects get a `*type` field with
 * their class name, so that they can be deserialized back into instances of that class.
 *
 * The `options` apply only to the top-level object, not to nested ones.
 * The `target` itself is never changed.
 *
 * Throws for values that can't be deserialized back: functions and symbols (except as
 * object properties, which are skipped), circular references, and built-in classes that
 * are not supported (like `WeakMap` or `Promise`).
 */
function getSerializeValueWithClassName(target: any, options: SerializeOptions = {}): any {
  return new Serializer().serialize(target, options);
}

class Serializer {

  /** The objects being serialized, from the top-level one down to the current one. */
  private readonly ancestors = new Set<object>();

  /** Serializes a value. Arrow function, so that it can be passed around as a callback. */
  readonly serializeNested = (target: any): any => this.serialize(target);

  serialize(target: any, options: SerializeOptions = {}): any {
    if (typeof target !== 'object' || target === null) {
      return _serializePrimitive(target);
    }

    if (this.ancestors.has(target)) {
      throw new Error('Cannot serialize a circular reference.');
    }

    this.ancestors.add(target);
    try {
      return Array.isArray(target) && Object.getPrototypeOf(target) === Array.prototype
        ? this._serializeArray(target)
        : this._serializeObject(target, options);
    } finally {
      this.ancestors.delete(target);
    }
  }

  /** Saves holes of sparse arrays as `{"*type": "@hole"}`, as JSON would turn them into null. */
  private _serializeArray(arr: readonly any[]): any[] {
    const result = new Array(arr.length);
    for (let index = 0; index < arr.length; index++) {
      result[index] = index in arr ? this.serialize(arr[index]) : { [TYPE_FIELD]: TYPE_HOLE };
    }
    return result;
  }

  private _serializeObject(target: object, options: SerializeOptions): Record<string, any> {
    const constructor = _getConstructor(target);

    // A plain object.
    if (constructor === undefined || constructor === Object) {
      return this._serializeProperties(target, options);
    }

    // A built-in class.
    const builtinType = getBuiltinTypeByConstructor(constructor);
    if (builtinType) {
      const serializedObj = builtinType.hasItemProperties
        ? {}
        : this._serializeProperties(target, options, builtinType.keysSavedInValue);
      serializedObj[TYPE_FIELD] = BUILTIN_PREFIX + builtinType.name;
      serializedObj[VALUE_FIELD] = builtinType.encode(target, this.serializeNested);
      return serializedObj;
    }

    if (isNativeFunction(constructor)) {
      throw new Error(`Cannot serialize a ${constructor.name}: this class is not supported.`);
    }

    // A user class.
    const className = getClassKey(constructor);
    if (className.startsWith(BUILTIN_PREFIX)) {
      throw new Error(`Cannot serialize class "${className}": class names can't start with "${BUILTIN_PREFIX}".`);
    }

    // A user class that extends a built-in class also saves the built-in data, like the entries of a Map.
    const inheritedType = findInheritedBuiltinType(target);
    if (inheritedType && !inheritedType.fill) {
      throw new Error(`Cannot serialize class "${className}": subclasses of ${inheritedType.name} are not supported.`);
    }

    const serializedObj = this._serializeProperties(target, options, inheritedType?.keysSavedInValue);
    serializedObj[TYPE_FIELD] = className;
    if (inheritedType) {
      serializedObj[VALUE_FIELD] = inheritedType.encode(target, this.serializeNested);
    }

    return serializedObj;
  }

  /**
   * Serializes the enumerable properties of `source`, skipping functions and symbols.
   * Properties in `options.ignoreProperties` are skipped, and properties in
   * `options.interceptProperties` are replaced by the result of their interceptor.
   * The `keysSavedInValue` are skipped, as they are saved in `*value`.
   */
  private _serializeProperties(
    source: any,
    options: SerializeOptions,
    keysSavedInValue: readonly string[] = []
  ): Record<string, any> {
    const ignored = options.ignoreProperties;
    const interceptors = options.interceptProperties;
    const serializedObj: Record<string, any> = {};

    const copy = (key: string, value: any) => {
      if (typeof value !== 'function' && typeof value !== 'symbol') {
        setOwnProperty(serializedObj, escapeKey(key), this.serialize(value));
      }
    };

    // The items of an array subclass are saved apart, in `*value`.
    const isArray = Array.isArray(source);

    for (const key in source) {
      if (ignored?.includes(key) || keysSavedInValue.includes(key) || (isArray && _isArrayIndex(key))) {
        continue;
      }
      const hasInterceptor = interceptors !== undefined && Object.prototype.hasOwnProperty.call(interceptors, key);
      copy(key, hasInterceptor ? interceptors[key].call(source, source[key]) : source[key]);
    }

    // Interceptors may also add properties the object doesn't have.
    if (interceptors) {
      for (const key in interceptors) {
        if (!(key in source) && !ignored?.includes(key)) {
          copy(key, interceptors[key].call(source, undefined));
        }
      }
    }

    return serializedObj;
  }
}

/**
 * Returns the class of `target`, or undefined if it has no prototype.
 * Usually it's the constructor of the prototype, but when that is `Object`, it's the
 * `constructor` property of the object itself, as in Big from big.js.
 */
function _getConstructor(target: any): any {
  const proto = Object.getPrototypeOf(target);
  if (proto === null) {
    return undefined;
  }
  const constructor = proto.constructor;
  return constructor === Object ? target.constructor : constructor;
}

function _isArrayIndex(key: string): boolean {
  return /^(0|[1-9]\d*)$/.test(key);
}

/** Serializes primitives. Values JSON can't represent become objects with a special `*type`. */
function _serializePrimitive(target: any): any {
  switch (typeof target) {
    case 'undefined':
      return { [TYPE_FIELD]: TYPE_UNDEFINED };
    case 'number':
      if (!Number.isFinite(target) || Object.is(target, -0)) {
        return { [TYPE_FIELD]: TYPE_NUMBER, [VALUE_FIELD]: Object.is(target, -0) ? '-0' : target.toString() };
      }
      return target;
    case 'bigint':
      return { [TYPE_FIELD]: TYPE_BIGINT, [VALUE_FIELD]: target.toString() };
    case 'function':
    case 'symbol':
      throw new Error(`Cannot serialize a ${typeof target}.`);
    default:
      return target; // string, boolean or null.
  }
}

export {
  getSerializeValueWithClassName
};
