// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import { KEY_ESCAPE } from './constant';

/** Returns true for primitives (including `null`), and for functions. */
function notObject(target: any): boolean {
  return target === null || typeof target !== 'object';
}

/**
 * Converts the text form of a number JSON can't represent back into the number.
 * Returns `null` for any other text.
 */
function getValueFromToStringResult(text: string): number | null {
  switch (text) {
    case 'Infinity':
      return Infinity;
    case '-Infinity':
      return -Infinity;
    case 'NaN':
      return NaN;
    case '-0':
      return -0;
    default:
      return null;
  }
}

/**
 * Returns the name a class is saved under: its own static `typeName`, if it has one,
 * or else its class name. A `typeName` inherited from a parent class is ignored.
 */
function getClassKey(classObj: any): string {
  if (Object.prototype.hasOwnProperty.call(classObj, 'typeName')) {
    return classObj.typeName;
  }
  return classObj.name;
}

/** Built-in classes that may be registered for deserialization, as if they were user classes. */
const SUPPORTED_BUILTIN_CLASSES: ReadonlySet<unknown> = new Set([Date]);

/** Returns true if `target` can be called with `new` (a class, or a function-style class). */
function isClass(target: any): boolean {
  if (SUPPORTED_BUILTIN_CLASSES.has(target)) {
    return true;
  }

  // `Reflect.construct` throws if `target` can't be used as a constructor.
  // See https://stackoverflow.com/a/46759625/707451
  try {
    Reflect.construct(String, [], target);
    return true;
  } catch {
    return false;
  }
}

/** Returns true if `fn` is implemented by the JavaScript engine, not by user code. */
function isNativeFunction(fn: object): boolean {
  return /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
}

/** Escapes a user key, so that it's not confused with the metadata fields. */
function escapeKey(key: string): string {
  return key.startsWith(KEY_ESCAPE) ? KEY_ESCAPE + key : key;
}

/** Reverses `escapeKey`. */
function unescapeKey(savedKey: string): string {
  return savedKey.startsWith(KEY_ESCAPE) ? savedKey.substring(KEY_ESCAPE.length) : savedKey;
}

/**
 * Sets an own property. Unlike `obj[key] = value`, this also works for the key `__proto__`,
 * which would otherwise change the prototype of `obj`, instead of creating a property.
 */
function setOwnProperty(obj: any, key: string, value: any) {
  if (key === '__proto__') {
    Object.defineProperty(obj, key, { value, writable: true, enumerable: true, configurable: true });
  } else {
    obj[key] = value;
  }
}

/** Sets a non-enumerable own property, like the `message` of an error. */
function setHiddenProperty(obj: any, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: true, enumerable: false, configurable: true });
}

export {
  getValueFromToStringResult,
  notObject,
  isClass,
  isNativeFunction,
  getClassKey,
  escapeKey,
  unescapeKey,
  setOwnProperty,
  setHiddenProperty,
};
