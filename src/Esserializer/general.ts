// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

/** Returns true for primitives (including `null`), and for functions. */
function notObject(target: any): boolean {
  return target === null || typeof target !== 'object';
}

/**
 * Converts the text form of a non-finite number back into the number.
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

export {
  getValueFromToStringResult,
  notObject,
  isClass,
  getClassKey
};
