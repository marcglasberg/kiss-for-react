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
  TYPE_NULL_PROTOTYPE,
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
      case TYPE_NULL_PROTOTYPE:
        return _copyDeserializedValues(Object.create(null), parsedObj, classMapping, options);
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
  // Not `classObj.toString()`, which may be a static method of the class.
  const isEs6Class = REGEXP_BEGIN_WITH_CLASS.test(Function.prototype.toString.call(classObj));
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
 * Copies the deserialized values of `parsedObj` into `instance`, and returns it.
 *
 * Properties with a getter or a setter (own or inherited from the class), and read-only
 * properties inherited from the class, keep the value the constructor gave them. Own read-only
 * properties with object values are updated in place (see `_copyInPlace`).
 *
 * Some saved values can't be set in `instance`: a primitive value in an own read-only property
 * (for example, when the constructor calls `Object.freeze(this)`), or a new property in an
 * object that can't get new properties. Then a copy of `instance` with these values is returned
 * instead (see `_copyWithValues`).
 */
function _copyDeserializedValues(instance: any, parsedObj: any, classMapping: ClassMapping, options: DeserializeOptions): any {
  const { ignoreProperties, rawProperties } = options;

  // The values that can't be set in `instance`.
  const valuesForCopy = new Map<string, any>();

  const setValue = (key: string, value: any) => {
    const own = Object.getOwnPropertyDescriptor(instance, key);
    const canSet = own ? own.writable !== false : Object.isExtensible(instance);
    if (canSet) {
      setOwnProperty(instance, key, value);
    } else if (!own || !Object.is(own.value, value)) {
      valuesForCopy.set(key, value);
    }
  };

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
      setValue(key, JSON.stringify(value));
      continue;
    }

    const descriptor = _findPropertyDescriptor(instance, key);
    if (descriptor) {
      // A getter or a setter. Setting a getter-only property would throw.
      if (descriptor.get || descriptor.set) {
        continue;
      }
      if (descriptor.writable === false) {
        // An inherited value is shared by all instances, so it's not changed.
        if (Object.prototype.hasOwnProperty.call(instance, key)) {
          const current = instance[key];
          setValue(key, notObject(current) || _isSavedPrimitive(value)
            ? deserializeFromParsedObjWithClassMapping(value, classMapping)
            : _copyInPlace(current, value, classMapping));
        }
        continue;
      }
    }

    setValue(key, deserializeFromParsedObjWithClassMapping(value, classMapping));
  }

  return valuesForCopy.size === 0 ? instance : _copyWithValues(instance, valuesForCopy);
}

/** Returns true if the saved `value` is a primitive, or a primitive JSON can't represent, like `NaN`. */
function _isSavedPrimitive(value: any): boolean {
  if (notObject(value)) {
    return true;
  }
  const type = value[TYPE_FIELD];
  return type === TYPE_UNDEFINED || type === TYPE_NUMBER || type === TYPE_BIGINT;
}

/**
 * Copies the saved `source` into the existing object `target`, in place: the built-in data
 * (like the entries of a Map), and the fields, like `_copyDeserializedValues` does.
 * Returns `target`, or a copy of it, if some saved values can't be set in it
 * (see `_copyDeserializedValues`).
 */
function _copyInPlace(target: object, source: any, classMapping: ClassMapping): any {
  if (VALUE_FIELD in source) {
    const deserializeNested = (value: any) => deserializeFromParsedObjWithClassMapping(value, classMapping);
    findInheritedBuiltinType(target)?.fill?.(target, source[VALUE_FIELD], deserializeNested);
  }

  return _copyDeserializedValues(target, source, classMapping, {});
}

/**
 * Returns a copy of `instance`, with the given `values` in place of its own properties, or as
 * new properties. The copy has the same prototype and the same property attributes, and it's
 * frozen, sealed, or can't get new properties, if `instance` is.
 *
 * The copy is created without calling the constructor, as `_createInstance` does when the
 * constructor throws. So it doesn't have the private fields (`#field`) of the class.
 *
 * An instance of a class that extends a built-in class (like a Map) keeps its built-in data
 * where a copy can't have it. So it is returned as is, without the `values`.
 */
function _copyWithValues(instance: object, values: Map<string, any>): object {
  if (findInheritedBuiltinType(instance)) {
    return instance;
  }

  const copy = Object.create(Object.getPrototypeOf(instance));
  const descriptors: Record<PropertyKey, PropertyDescriptor> = Object.getOwnPropertyDescriptors(instance);

  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (typeof key === 'string' && values.has(key)) {
      descriptor.value = values.get(key);
    }
    Object.defineProperty(copy, key, descriptor);
  }

  for (const [key, value] of values) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, key)) {
      Object.defineProperty(copy, key, { value, writable: true, enumerable: true, configurable: true });
    }
  }

  if (Object.isFrozen(instance)) {
    Object.freeze(copy);
  } else if (Object.isSealed(instance)) {
    Object.seal(copy);
  } else if (!Object.isExtensible(instance)) {
    Object.preventExtensions(copy);
  }

  return copy;
}

/**
 * Returns the descriptor of the property `key` of `obj`, which may be its own, or inherited
 * from its class. `Object.prototype` is not searched, so that its `__proto__` accessor doesn't
 * hide a saved `__proto__` key.
 */
function _findPropertyDescriptor(obj: object, key: string): PropertyDescriptor | undefined {
  for (let current = obj; current !== null && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      return descriptor;
    }
  }
  return undefined;
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
