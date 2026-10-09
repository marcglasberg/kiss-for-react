// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import { ClassOrEnum } from '.';
import {
  escapeKey,
  getClassKey,
  getValueFromToStringResult,
  isClass,
  notObject,
  setOwnProperty,
  unescapeKey,
} from './general';
import {
  BUILTIN_PREFIX,
  TYPE_BIGINT,
  TYPE_FIELD,
  TYPE_HOLE,
  TYPE_NUMBER,
  TYPE_UNDEFINED,
  VALUE_FIELD,
} from './constant';
import { findInheritedBuiltinType, getBuiltinTypeBySavedType } from './builtins';
import DeserializeOptions from './DeserializationOptions';

/**
 * Maps the name a class is saved under (see `getClassKey`) to the class itself.
 * Read it with `hasOwnProperty`, so that names like `toString` don't find inherited functions.
 */
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

  const deserializeNested = (value: any) => deserializeFromParsedObjWithClassMapping(value, classMapping);

  if (Array.isArray(parsedObj)) {
    return _deserializeArray(parsedObj, deserializeNested);
  }

  const type: string | undefined = parsedObj[TYPE_FIELD];

  // A plain object.
  if (type === undefined) {
    return _copyDeserializedValues({}, parsedObj, classMapping, options);
  }

  // A built-in type.
  if (type.startsWith(BUILTIN_PREFIX)) {
    const value = parsedObj[VALUE_FIELD];
    switch (type) {
      case TYPE_UNDEFINED:
        return undefined;
      case TYPE_NUMBER:
        return getValueFromToStringResult(value);
      case TYPE_BIGINT:
        return BigInt(value);
    }
    const builtinType = getBuiltinTypeBySavedType(type);
    if (!builtinType) {
      throw new Error(`Unknown built-in type "${type}" found during deserialization.`);
    }
    const instance = builtinType.decode(value, deserializeNested);
    return _copyDeserializedValues(instance, parsedObj, classMapping, options);
  }

  // A user class.
  const classObj = Object.prototype.hasOwnProperty.call(classMapping, type) ? classMapping[type] : undefined;
  if (!classObj) {
    throw new Error(`Class "${type}" not found during deserialization. You must register it with: "ESSerializer.registerClass(${type});"`);
  }

  const constructorParameters = (options.fieldsForConstructorParameters ?? []).map((field) => {
    const savedKey = escapeKey(field);
    // Pass `{}` for missing fields, instead of undefined.
    return savedKey in parsedObj ? parsedObj[savedKey] : {};
  });

  const instance = _createInstance(classObj, constructorParameters);

  // A user class that extends a built-in class also has the built-in data, like the entries of a Map.
  if (VALUE_FIELD in parsedObj) {
    findInheritedBuiltinType(instance)?.fill?.(instance, parsedObj[VALUE_FIELD], deserializeNested);
  }

  return _copyDeserializedValues(instance, parsedObj, classMapping, options);
}

/** Deserializes the items of an array. Holes saved as `{"*type": "@hole"}` are kept as holes. */
function _deserializeArray(parsedArray: any[], deserializeNested: (value: any) => any): any[] {
  const result = new Array(parsedArray.length);
  parsedArray.forEach((item, index) => {
    if (item?.[TYPE_FIELD] !== TYPE_HOLE) {
      result[index] = deserializeNested(item);
    }
  });
  return result;
}

/**
 * Creates an instance of `classObj`, to receive the
 * saved values. Constructor parameters not given in `constructorParameters` are filled with
 * fallback values. If the constructor throws for all of them, the instance is created without
 * calling the constructor.
 */
function _createInstance(classObj: any, constructorParameters: any[]): object {
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

  for (const savedKey in parsedObj) {
    if (savedKey === TYPE_FIELD || savedKey === VALUE_FIELD) {
      continue;
    }

    const key = unescapeKey(savedKey);
    if (ignoreProperties?.includes(key)) {
      continue;
    }

    const value = parsedObj[savedKey];
    if (rawProperties?.includes(key)) {
      setOwnProperty(instance, key, JSON.stringify(value));
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

    setOwnProperty(instance, key, deserializeFromParsedObjWithClassMapping(value, classMapping));
  }
  return instance;
}

/** Copies the fields of `source` into `target`, except the ones that `target` has as read-only. */
function _copyWritableFields(target: any, source: any, classMapping: ClassMapping) {
  for (const savedKey in source) {
    const field = unescapeKey(savedKey);
    const descriptor = Object.getOwnPropertyDescriptor(target, field);
    const isReadOnly = descriptor && descriptor.writable !== true && typeof descriptor.set !== 'function';
    if (!isReadOnly) {
      setOwnProperty(target, field, deserializeFromParsedObjWithClassMapping(source[savedKey], classMapping));
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
