// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

function notObject(target: any): boolean {
  return target === null || typeof target !== 'object';
}

function getValueFromToStringResult(result: string) {
  switch (result) {
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

function isSupportedBuiltinClass(target: any): boolean {
  return [Date].indexOf(target) >= 0;
}

function isClass(target: any): boolean {
  if (isSupportedBuiltinClass(target)) {
    return true;
  }

  // Adopt solution from https://stackoverflow.com/a/46759625/707451
  try {
    Reflect.construct(String, [], target);
  } catch {
    return false;
  }
  return true;
}

export {
  getValueFromToStringResult,
  notObject,
  isClass,
  getClassKey
};
