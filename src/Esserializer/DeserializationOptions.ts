// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

/** Options for `ESSerializer.deserialize`. They apply only to the top-level object. */
interface DeserializeOptions {
  /**
   * Saved fields to pass, in this order, as the parameters of the class constructor.
   * Missing fields are passed as `{}`.
   */
  fieldsForConstructorParameters?: Array<string>,

  /** Saved properties that are not read back. */
  ignoreProperties?: Array<string>,

  /** Saved properties that are read back as their JSON text, instead of being deserialized. */
  rawProperties?: Array<string>
}

export default DeserializeOptions;
