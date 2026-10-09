// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

/**
 * Returned by internal helpers to mean "I don't handle this value". We can't use
 * `null` or `undefined` for that, because those are valid results.
 */
const ESSERIALIZER_NULL = '__ESSERIALIZER_NULL__';

/** The type of a saved object: a class name, a built-in class name, or a special type. */
const TYPE_FIELD = '*type';

/** The data needed to rebuild a built-in value (its items, timestamp, text form, etc.). */
const VALUE_FIELD = '*value';

// Special types, for primitive values that JSON can't represent.
const TYPE_UNDEFINED = 'UD';
const TYPE_NOT_FINITE = 'NF'; // Infinity, -Infinity and NaN.
const TYPE_BIG_INT = 'BI';

// Built-in classes that have their own way of being saved.
const BUILTIN_ARRAYBUFFER = 'ArrayBuffer';
const BUILTIN_SHAREDARRAYBUFFER = 'SharedArrayBuffer';
const BUILTIN_DATAVIEW = 'DataView';
const BUILTIN_BOOLEAN = 'Boolean';
const BUILTIN_STRING = 'String';
const BUILTIN_DATE = 'Date';
const BUILTIN_REGEXP = 'RegExp';
const BUILTIN_MAP = 'Map';
const BUILTIN_SET = 'Set';
const BUILTIN_INTL_LOCALE = 'Locale';

/** Typed arrays, by name. They are saved as the array of their items. */
const TYPED_ARRAY_CLASSES: Readonly<Record<string, any>> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array,
  BigUint64Array,
};

/** Error classes, by name. They are saved with their name, message and stack. */
const ERROR_CLASSES: Readonly<Record<string, any>> = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
  AggregateError,
};

/**
 * `Intl` classes, by name. They are saved as their resolved options.
 * `Intl.Locale` is not here, because it's saved as its text form.
 */
const INTL_CLASSES: Readonly<Record<string, any>> = {
  Collator: Intl.Collator,
  DateTimeFormat: Intl.DateTimeFormat,
  ListFormat: Intl.ListFormat,
  NumberFormat: Intl.NumberFormat,
  PluralRules: Intl.PluralRules,
  RelativeTimeFormat: Intl.RelativeTimeFormat,
};

/**
 * Classes whose enumerable properties are not saved, because they are just their items
 * (like the characters of a `String`, or the numbers of an `Int8Array`), which are saved apart.
 */
const CLASSNAMES_WHOSE_ENUMERABLE_PROPERTIES_SHOULD_BE_IGNORED: ReadonlySet<string> = new Set([
  BUILTIN_STRING,
  ...Object.keys(TYPED_ARRAY_CLASSES),
]);

/** Returns true if `name` is an own key of `table` (not an inherited one, like `toString`). */
function hasName(table: Readonly<Record<string, any>>, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(table, name);
}

export {
  ESSERIALIZER_NULL,
  TYPE_FIELD,
  VALUE_FIELD,
  TYPE_UNDEFINED,
  TYPE_NOT_FINITE,
  TYPE_BIG_INT,
  BUILTIN_ARRAYBUFFER,
  BUILTIN_SHAREDARRAYBUFFER,
  BUILTIN_DATAVIEW,
  BUILTIN_BOOLEAN,
  BUILTIN_STRING,
  BUILTIN_DATE,
  BUILTIN_REGEXP,
  BUILTIN_MAP,
  BUILTIN_SET,
  BUILTIN_INTL_LOCALE,
  TYPED_ARRAY_CLASSES,
  ERROR_CLASSES,
  INTL_CLASSES,
  CLASSNAMES_WHOSE_ENUMERABLE_PROPERTIES_SHOULD_BE_IGNORED,
  hasName,
};
