// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

/** The type of a saved object: the name of a user class, or a built-in type (starting with `@`). */
const TYPE_FIELD = '*type';

/** The data needed to rebuild a built-in value (its items, timestamp, text form, etc.). */
const VALUE_FIELD = '*value';

/**
 * Prefix of the built-in types, like `@Map` or `@undefined`. User classes can't be saved
 * under names starting with it, so they are never confused with built-in types.
 */
const BUILTIN_PREFIX = '@';

// Special types, for values that JSON can't represent.

/** `undefined`. */
const TYPE_UNDEFINED = '@undefined';
/** Numbers JSON can't represent: `NaN`, `Infinity`, `-Infinity` and `-0`. Saved as their text. */
const TYPE_NUMBER = '@number';
/** A `bigint`. Saved as its text. */
const TYPE_BIGINT = '@bigint';
/** A missing item of a sparse array. */
const TYPE_HOLE = '@hole';

/**
 * User keys starting with this are saved with one more of it, so that they are not
 * confused with the metadata fields. For example, a key `*type` is saved as `**type`.
 */
const KEY_ESCAPE = '*';

export {
  TYPE_FIELD,
  VALUE_FIELD,
  BUILTIN_PREFIX,
  TYPE_UNDEFINED,
  TYPE_NUMBER,
  TYPE_BIGINT,
  TYPE_HOLE,
  KEY_ESCAPE,
};
