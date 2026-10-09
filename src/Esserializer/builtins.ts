// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import { BUILTIN_PREFIX } from './constant';
import { setHiddenProperty } from './general';

/** Serializes or deserializes a nested value. */
type Converter = (value: any) => any;

/** How a built-in class is saved and rebuilt. */
interface BuiltinType {
  /** The class. Its instances are saved with `*type` `@<name>`. */
  readonly constructor: unknown;

  /** The name the class is saved under, without the `@` prefix. */
  readonly name: string;

  /** Returns the data needed to rebuild `target`, saved in the `*value` field. */
  encode(target: any, serialize: Converter): any;

  /** Rebuilds the value from the saved data. */
  decode(saved: any, deserialize: Converter): any;

  /**
   * Puts the saved data into an instance of a user subclass, created by the subclass
   * constructor. Built-in classes without it can't be subclassed in saved data.
   */
  fill?(instance: any, saved: any, deserialize: Converter): void;

  /**
   * True if the enumerable properties of the instances are just their items (like the
   * characters of a String), which are already saved in `*value`.
   */
  readonly hasItemProperties?: boolean;

  /** Properties already saved in `*value`, which must not be saved again as normal properties. */
  readonly keysSavedInValue?: readonly string[];
}

/** Copies the bytes of a buffer (or of part of it) into a plain array. */
function _bytesOf(buffer: ArrayBufferLike, offset?: number, length?: number): number[] {
  return Array.from(new Uint8Array(buffer, offset, length));
}

/**
 * Copies an array subclass into a plain array, keeping the holes of sparse arrays.
 * (We can't use `slice`, because it returns an instance of the subclass.)
 */
function _toPlainArray(arr: any[]): any[] {
  const result = new Array(arr.length);
  arr.forEach((item, index) => result[index] = item); // `forEach` skips holes.
  return result;
}

// ---------------------------------------------------------------------------------------------
// Errors.

/** Error properties saved in `*value`. */
const ERROR_KEYS: readonly string[] = ['name', 'message', 'stack', 'cause', 'errors'];

function _encodeError(error: any, serialize: Converter): any {
  const saved: Record<string, any> = {};
  // The name is only saved when it's not the default one of its class.
  if (error.name !== Object.getPrototypeOf(error).name) {
    saved.name = error.name;
  }
  if (error.message) {
    saved.message = error.message;
  }
  if (error.stack) {
    saved.stack = error.stack;
  }
  if ('cause' in error) {
    saved.cause = serialize(error.cause);
  }
  if (error instanceof AggregateError) {
    saved.errors = serialize(error.errors);
  }
  return saved;
}

/** Puts the saved error data into `error`, as non-enumerable properties, like the originals. */
function _fillError(error: any, saved: any, deserialize: Converter) {
  // Use the saved stack, not the one of this new error.
  delete error.stack;
  for (const key of ERROR_KEYS) {
    if (key in saved) {
      setHiddenProperty(error, key, deserialize(saved[key]));
    }
  }
}

function _errorType(ErrorClass: any): BuiltinType {
  return {
    constructor: ErrorClass,
    name: ErrorClass.name,
    encode: _encodeError,
    decode(saved, deserialize) {
      const error = ErrorClass === AggregateError ? new AggregateError([]) : new ErrorClass();
      _fillError(error, saved, deserialize);
      return error;
    },
    fill: _fillError,
    keysSavedInValue: ERROR_KEYS,
  };
}

// ---------------------------------------------------------------------------------------------
// Typed arrays and Intl.

function _typedArrayType(TypedArrayClass: any): BuiltinType {
  return {
    constructor: TypedArrayClass,
    name: TypedArrayClass.name,
    // Items may be non-finite numbers, -0 or BigInts, so they are serialized too.
    encode: (target, serialize) => serialize(Array.from(target)),
    decode: (saved, deserialize) => new TypedArrayClass(deserialize(saved)),
    hasItemProperties: true,
  };
}

/** Intl objects are rebuilt from their resolved options, which include the locale. */
function _intlType(name: string, IntlClass: any): BuiltinType {
  return {
    constructor: IntlClass,
    name,
    encode: (target) => target.resolvedOptions(),
    decode: (saved) => {
      const { locale, ...options } = saved;
      return new IntlClass(locale, options);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The table of built-in types.

const _BUILTIN_TYPES: BuiltinType[] = [
  {
    constructor: Array, // Only used for subclasses. Plain arrays are saved as JSON arrays.
    name: 'Array',
    encode: (target, serialize) => serialize(_toPlainArray(target)),
    decode: (saved, deserialize) => deserialize(saved),
    fill(instance, saved, deserialize) {
      const items: any[] = deserialize(saved);
      instance.length = items.length;
      items.forEach((item, index) => instance[index] = item); // `forEach` skips holes.
    },
  },
  {
    constructor: Map,
    name: 'Map',
    // Saved as an array of [key, value] pairs.
    encode: (target, serialize) => serialize(Array.from(target)),
    decode: (saved, deserialize) => new Map(deserialize(saved)),
    fill(instance, saved, deserialize) {
      for (const [key, value] of deserialize(saved)) instance.set(key, value);
    },
  },
  {
    constructor: Set,
    name: 'Set',
    encode: (target, serialize) => serialize(Array.from(target)),
    decode: (saved, deserialize) => new Set(deserialize(saved)),
    fill(instance, saved, deserialize) {
      for (const item of deserialize(saved)) instance.add(item);
    },
  },
  {
    constructor: Date,
    name: 'Date',
    // An invalid date has a NaN timestamp, which JSON saves as null.
    encode: (target) => target.getTime(),
    decode: (saved) => new Date(saved ?? NaN),
    fill: (instance, saved) => instance.setTime(saved ?? NaN),
  },
  {
    constructor: RegExp,
    name: 'RegExp',
    encode: (target) => ({ source: target.source, flags: target.flags }),
    decode: (saved) => new RegExp(saved.source, saved.flags),
  },
  {
    constructor: Boolean,
    name: 'Boolean',
    encode: (target) => target.valueOf(),
    // noinspection JSPrimitiveTypeWrapperUsage
    decode: (saved) => new Boolean(saved),
  },
  {
    constructor: Number,
    name: 'Number',
    encode: (target, serialize) => serialize(target.valueOf()),
    // noinspection JSPrimitiveTypeWrapperUsage
    decode: (saved, deserialize) => new Number(deserialize(saved)),
  },
  {
    constructor: String,
    name: 'String',
    encode: (target) => target.valueOf(),
    // noinspection JSPrimitiveTypeWrapperUsage
    decode: (saved) => new String(saved),
    hasItemProperties: true,
  },
  {
    constructor: ArrayBuffer,
    name: 'ArrayBuffer',
    encode: (target) => _bytesOf(target),
    decode: (saved) => new Uint8Array(saved).buffer,
  },
  {
    constructor: DataView,
    name: 'DataView',
    // Only the bytes the DataView covers, not its whole buffer.
    encode: (target) => _bytesOf(target.buffer, target.byteOffset, target.byteLength),
    decode: (saved) => new DataView(new Uint8Array(saved).buffer),
  },
  {
    constructor: Intl.Locale,
    name: 'Locale',
    encode: (target) => target.toString(),
    decode: (saved) => new Intl.Locale(saved),
  },

  ...[Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array,
    Float32Array, Float64Array, BigInt64Array, BigUint64Array,
  ].map(_typedArrayType),

  ...[Error, EvalError, RangeError, ReferenceError, SyntaxError, TypeError, URIError, AggregateError,
  ].map(_errorType),

  ...Object.entries({
    Collator: Intl.Collator,
    DateTimeFormat: Intl.DateTimeFormat,
    DisplayNames: (Intl as any).DisplayNames,
    ListFormat: Intl.ListFormat,
    NumberFormat: Intl.NumberFormat,
    PluralRules: Intl.PluralRules,
    RelativeTimeFormat: Intl.RelativeTimeFormat,
    Segmenter: (Intl as any).Segmenter,
  })
    .filter(([, IntlClass]) => IntlClass !== undefined) // Not every environment has all of them.
    .map(([name, IntlClass]) => _intlType(name, IntlClass)),
];

// `SharedArrayBuffer` is not available in every environment (for example, in browsers
// without cross-origin isolation).
if (typeof SharedArrayBuffer !== 'undefined') {
  _BUILTIN_TYPES.push({
    constructor: SharedArrayBuffer,
    name: 'SharedArrayBuffer',
    encode: (target) => _bytesOf(target),
    decode(saved: number[]) {
      const buffer = new SharedArrayBuffer(saved.length);
      new Uint8Array(buffer).set(saved);
      return buffer;
    },
  });
}

const _BY_CONSTRUCTOR: ReadonlyMap<unknown, BuiltinType> =
  new Map(_BUILTIN_TYPES.map((type) => [type.constructor, type]));

const _BY_SAVED_TYPE: ReadonlyMap<string, BuiltinType> =
  new Map(_BUILTIN_TYPES.map((type) => [BUILTIN_PREFIX + type.name, type]));

/** Returns the built-in type of instances of exactly `constructor` (not of subclasses). */
function getBuiltinTypeByConstructor(constructor: unknown): BuiltinType | undefined {
  return _BY_CONSTRUCTOR.get(constructor);
}

/** Returns the built-in type saved as `savedType` (like `@Map`). */
function getBuiltinTypeBySavedType(savedType: string): BuiltinType | undefined {
  return _BY_SAVED_TYPE.get(savedType);
}

/**
 * Returns the nearest built-in class that `target` inherits from, or undefined if it
 * inherits only from `Object`.
 */
function findInheritedBuiltinType(target: object): BuiltinType | undefined {
  for (let proto = Object.getPrototypeOf(target); proto !== null; proto = Object.getPrototypeOf(proto)) {
    const type = _BY_CONSTRUCTOR.get(proto.constructor);
    if (type) {
      return type;
    }
  }
  return undefined;
}

export {
  BuiltinType,
  getBuiltinTypeByConstructor,
  getBuiltinTypeBySavedType,
  findInheritedBuiltinType,
};
