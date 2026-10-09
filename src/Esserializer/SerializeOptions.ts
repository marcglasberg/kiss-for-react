// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

/** Options for `ESSerializer.serialize`. They apply only to the top-level object. */
interface SerializeOptions {
  /** Properties that are not saved. */
  ignoreProperties?: Array<string>,

  /**
   * Properties whose saved value is the result of the given function, instead of their own value.
   * The function gets the property value, and is called with `this` set to the object.
   */
  interceptProperties?: Record<string, (value: any) => any>
}

export default SerializeOptions;
