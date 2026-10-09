// The Esserializer code was copied and adapted from the original copyrighted work, MIT licensed, by cshao.
// All credit goes to him. See: https://www.npmjs.com/package/esserializer

import DeserializeOptions from './DeserializationOptions';
import SerializeOptions from './SerializeOptions';

import { getSerializeValueWithClassName } from './serializer';
import { deserializeFromParsedObj } from './deserializer';

export type ClassOrEnum = { new(...args: any[]): any } | object;

/**
 * Serializes values into JSON text, keeping their classes, and deserializes them back
 * into instances of those classes. Also supports built-in types JSON doesn't, like
 * `undefined`, `NaN`, BigInt, Date, Map, Set, typed arrays, errors and Intl objects.
 */
export class ESSerializer {

  /** Classes available to every `deserialize` call, in addition to the ones passed to it. */
  private static registeredClasses: Array<ClassOrEnum> = [];

  /** Globally registers classes or enums. */
  public static registerClasses(classesOrEnums: Array<ClassOrEnum>) {
    this.registeredClasses.push(...classesOrEnums);
  }

  /** Globally registers a class or enum. */
  public static registerClass(classOrEnum: ClassOrEnum) {
    this.registeredClasses.push(classOrEnum);
  }

  /** Clears all globally registered classes. */
  public static clearRegisteredClasses() {
    this.registeredClasses = [];
  }

  /**
   * Converts `target` into JSON text. The `target` is not changed.
   * @param target The value to serialize.
   * @param options Serialization options.
   */
  public static serialize(target: any, options: SerializeOptions = {}): string {
    return JSON.stringify(getSerializeValueWithClassName(target, options));
  }

  /**
   * Converts JSON text created by `serialize` back into the original value.
   * @param serializedText The JSON text.
   * @param classes Classes needed to deserialize the text, in addition to the registered ones.
   * @param options Deserialization options.
   */
  public static deserialize(
    serializedText: string,
    classes: Array<ClassOrEnum> = [],
    options: DeserializeOptions = {}): any {
    //
    return deserializeFromParsedObj(
      JSON.parse(serializedText),
      this.registeredClasses.concat(classes),
      options
    );
  }
}
