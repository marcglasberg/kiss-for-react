// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import { ClassOrEnum } from '.';
import { getClassKey, getValueFromToStringResult, isClass, notObject } from './general';
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
import DeserializeOptions from './DeserializationOptions';

/** Maps the name a class is saved under (see `getClassKey`) to the class itself. */
type ClassMapping = Record<string, any>;

const REGEXP_BEGIN_WITH_CLASS = /^\s*class\s+/;

/**
 * Values tried, in order, for the constructor parameters that have no saved value.
 * Some constructors throw for some values (for example, `{}` where a string is expected),
 * so we try each one until the constructor works.
 */
const FALLBACK_CONSTRUCTOR_PARAMETERS: readonly any[] = [{}, 0, '', null];

/**
 * Turns a parsed JSON value back into the original value, creating instances of the
 * given `classes` where the JSON has their names in the `*type` field.
 */
function deserializeFromParsedObj(
  parsedObj: any,
  classes: Array<ClassOrEnum>,
  options: DeserializeOptions): any {
  //
  return deserializeFromParsedObjWithClassMapping(
    parsedObj,
    getClassMappingFromClassArray(classes),
    options);
}

/**
 * Same as `deserializeFromParsedObj`, but with the classes already mapped by name.
 * The `options` apply only to the top-level object, not to nested ones.
 */
function deserializeFromParsedObjWithClassMapping(
  parsedObj: any,
  classMapping: ClassMapping,
  options: DeserializeOptions = {}
): any {
  if (notObject(parsedObj)) {
    return parsedObj;
  }

  if (Array.isArray(parsedObj)) {
    return _deserializeArray(parsedObj, classMapping);
  }

  const className: string | undefined = parsedObj[TYPE_FIELD];
  const builtinValue = _deserializeBuiltinType(className, parsedObj, classMapping);
  if (builtinValue !== ESSERIALIZER_NULL) {
    return builtinValue;
  }

  const classObj = className ? classMapping[className] : undefined;
  if (className && !classObj) {
    throw new Error(`Class "${className}" not found during deserialization. You must register it with: "ESSerializer.registerClass(${className});"`);
  }

  const constructorParameters = (options.fieldsForConstructorParameters ?? []).map(
    // Pass `{}` for missing fields, instead of undefined.
    (field) => (field in parsedObj ? parsedObj[field] : {}));

  const instance = _createInstance(classObj, constructorParameters);
  return _copyDeserializedValues(instance, parsedObj, classMapping, options);
}

function _deserializeArray(parsedArray: any[], classMapping: ClassMapping): any[] {
  return parsedArray.map((item) => deserializeFromParsedObjWithClassMapping(item, classMapping));
}

/**
 * Rebuilds built-in values (typed arrays, Dates, Maps, Errors, etc.) and special primitives.
 * Returns `ESSERIALIZER_NULL` if `typeName` is not a built-in type.
 */
function _deserializeBuiltinType(typeName: string | undefined, parsedObj: any, classMapping: ClassMapping): any {
  if (typeName === undefined) {
    return ESSERIALIZER_NULL;
  }

  const value = parsedObj[VALUE_FIELD];

  switch (typeName) {
    // Special primitives.
    case TYPE_UNDEFINED:
      return undefined;
    case TYPE_NOT_FINITE:
      return getValueFromToStringResult(value);
    case TYPE_BIG_INT:
      return BigInt(value);

    // Binary data.
    case BUILTIN_ARRAYBUFFER:
      return new Uint8Array(value).buffer;
    case BUILTIN_SHAREDARRAYBUFFER:
      return _deserializeSharedArrayBuffer(value);
    case BUILTIN_DATAVIEW:
      return new DataView(new Uint8Array(value).buffer);

    // Wrapper objects.
    case BUILTIN_BOOLEAN:
      // noinspection JSPrimitiveTypeWrapperUsage
      return new Boolean(value);
    case BUILTIN_STRING:
      // noinspection JSPrimitiveTypeWrapperUsage
      return new String(value);

    // Other built-in classes.
    case BUILTIN_DATE:
      // An invalid date is saved with a null timestamp.
      return typeof value === 'number' ? new Date(value) : null;
    case BUILTIN_REGEXP:
      return new RegExp(value.source, value.flags);
    case BUILTIN_MAP:
      return new Map(_deserializeArray(value, classMapping));
    case BUILTIN_SET:
      return new Set(_deserializeArray(value, classMapping));
    case BUILTIN_INTL_LOCALE:
      return new Intl.Locale(value);
  }

  if (hasName(TYPED_ARRAY_CLASSES, typeName)) {
    // Items may be non-finite numbers or BigInts, so they are deserialized too.
    return new TYPED_ARRAY_CLASSES[typeName](_deserializeArray(value, classMapping));
  }
  if (hasName(INTL_CLASSES, typeName)) {
    const { locale, ...options } = value;
    return new INTL_CLASSES[typeName](locale, options);
  }
  if (hasName(ERROR_CLASSES, typeName)) {
    return _deserializeError(parsedObj, ERROR_CLASSES[typeName], classMapping);
  }
  return ESSERIALIZER_NULL;
}

function _deserializeSharedArrayBuffer(bytes: number[]): SharedArrayBuffer {
  const buffer = new SharedArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function _deserializeError(parsedObj: any, ErrorClass: any, classMapping: ClassMapping) {
  const error = parsedObj.message ? new ErrorClass(parsedObj.message) : new ErrorClass();

  // Use the saved stack, not the one of this new error.
  delete error.stack;
  if (parsedObj.stack) {
    error.stack = parsedObj.stack;
  }
  if (parsedObj.name) {
    error.name = parsedObj.name;
  }
  if (ErrorClass === AggregateError) {
    error.errors = deserializeFromParsedObjWithClassMapping(parsedObj.errors, classMapping);
  }
  return error;
}

/**
 * Creates an instance of `classObj` (or a plain object, if there's no class), to receive the
 * saved values. Constructor parameters not given in `constructorParameters` are filled with
 * fallback values. If the constructor throws for all of them, the instance is created without
 * calling the constructor.
 */
function _createInstance(classObj: any, constructorParameters: any[]): object {
  if (!classObj) {
    return {};
  }

  const isEs6Class = REGEXP_BEGIN_WITH_CLASS.test(classObj.toString());
  const missingParameterCount = Math.max(classObj.length - constructorParameters.length, 0);

  // When no parameter is missing, the fallback values are not used, so we try only once.
  const fallbacks = missingParameterCount === 0
    ? FALLBACK_CONSTRUCTOR_PARAMETERS.slice(0, 1)
    : FALLBACK_CONSTRUCTOR_PARAMETERS;

  for (const fallback of fallbacks) {
    const parameters = constructorParameters.concat(new Array(missingParameterCount).fill(fallback));
    const instance = _tryToConstruct(classObj, isEs6Class, parameters);
    if (instance) {
      return instance;
    }
  }

  return Object.create(classObj.prototype);
}

/** Calls the constructor. Returns `null` if it throws. */
function _tryToConstruct(classObj: any, isEs6Class: boolean, parameters: any[]): object | null {
  try {
    if (isEs6Class) {
      return new classObj(...parameters);
    }

    // A function-style class.
    let constructor = classObj.prototype.constructor;
    if (constructor === Object) {
      // In case the constructor is not in the prototype, such as Big in big.js.
      constructor = classObj;
    }
    const instance = Object.create(constructor.prototype);
    constructor.apply(instance, parameters);
    return instance;
  } catch {
    return null;
  }
}

/**
 * Copies the deserialized values of `parsedObj` into `instance`.
 * Properties with a setter, and read-only properties with primitive values, keep the value
 * the constructor gave them. Read-only properties with object values have their writable
 * fields updated in place.
 */
function _copyDeserializedValues(instance: any, parsedObj: any, classMapping: ClassMapping, options: DeserializeOptions) {
  const { ignoreProperties, rawProperties } = options;

  for (const key in parsedObj) {
    if (key === TYPE_FIELD || ignoreProperties?.includes(key)) {
      continue;
    }

    const value = parsedObj[key];
    if (rawProperties?.includes(key)) {
      instance[key] = JSON.stringify(value);
      continue;
    }

    const descriptor = Object.getOwnPropertyDescriptor(instance, key);
    if (descriptor) {
      if (typeof descriptor.set === 'function') {
        continue;
      }
      if (descriptor.writable === false) {
        if (typeof value === 'object') {
          _copyWritableFields(instance[key], value, classMapping);
        }
        continue;
      }
    }

    instance[key] = deserializeFromParsedObjWithClassMapping(value, classMapping);
  }
  return instance;
}

/** Copies the fields of `source` into `target`, except the ones that `target` has as read-only. */
function _copyWritableFields(target: any, source: any, classMapping: ClassMapping) {
  for (const field in source) {
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    const isReadOnly = descriptor && descriptor.writable !== true && typeof descriptor.set !== 'function';
    if (!isReadOnly) {
      target[field] = deserializeFromParsedObjWithClassMapping(source[field], classMapping);
    }
  }
}

/**
 * Maps each class to the name it's saved under. Items that are not classes (like enums) are
 * ignored. Warns if two different classes are saved under the same name.
 *
 * @param classes Class definitions. They are typed as `any` because TypeScript has no type for classes.
 */
function getClassMappingFromClassArray(classes: Array<any> = []): ClassMapping {
  const classMapping: ClassMapping = {};
  for (const classObj of classes) {
    if (!isClass(classObj)) {
      continue;
    }
    const className = getClassKey(classObj);
    const previousClass = classMapping[className];
    if (previousClass && previousClass !== classObj) {
      console.warn('WARNING: Found class definition with the same name: ' + className);
    }
    classMapping[className] = classObj;
  }
  return classMapping;
}

/** Returns the name of the parent class of `classObj` (or `Object`, if it has none). */
function getParentClassName(classObj: any): string {
  return Object.getPrototypeOf(classObj.prototype).constructor.name;
}

export {
  deserializeFromParsedObj,
  deserializeFromParsedObjWithClassMapping,
  getClassMappingFromClassArray,
  getParentClassName
};
