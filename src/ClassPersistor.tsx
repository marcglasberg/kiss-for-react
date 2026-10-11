import { ClassOrEnum, ESSerializer } from './Esserializer';
import { getClassKey, isClass, isNativeFunction } from './Esserializer/general';
import { Persistor } from './Persistor';
import { StoreException } from './StoreException';

/**
 * Use it like this:
 *
 * ```ts
 * const store = createStore<AppState>({
 *   initialState: initialState,
 *   persistor: new MyPersistor(),
 * });
 * ```
 *
 * Example for web:
 * ```
 * return new ClassPersistor<State>(
 *     async () => window.localStorage.getItem('state'),
 *     async (serialized) => window.localStorage.setItem('state', serialized),
 *     async () => window.localStorage.clear(),
 *     [State, TodoList, TodoItem, Filter] // All state classes the app uses.
 *   );
 * ```
 *
 * Example for React Native:
 * ```
 * return new ClassPersistor<State>(
 *     async () => AsyncStorage.getItem('state'),
 *     async (serialized) => AsyncStorage.setItem('state', serialized),
 *     async () => AsyncStorage.clear(),
 *     [State, TodoList, TodoItem, Filter] // All state classes the app uses.
 *   );
 * ```
 *
 * Classes are saved by their class name. Production builds usually minify class names
 * (`TodoItem` becomes `e`), which would make different classes collide, and change the saved
 * names from one app version to the next. To prevent this, either turn off class name
 * minification in your bundler (see kissforreact.org), or give each state class a stable
 * name with a static `typeName`:
 *
 * ```ts
 * class TodoItem {
 *   static readonly typeName = 'TodoItem';
 *   ...
 * }
 * ```
 *
 * A `typeName` is not inherited: subclasses need their own. The `ClassPersistor` throws a
 * `StoreException` when it's created, if it finds class names are minified and some class has
 * no `typeName`, or if two classes are saved under the same name. A class with no `typeName`
 * whose name looks minified (one or two characters, starting with a lowercase letter, `_` or
 * `$`, like `e` or `ab`) also makes it throw, even if the rest of the code is not minified.
 * Built-in classes, like `Date`, are not checked, as they are not saved by their name.
 */
export class ClassPersistor<St> extends Persistor<St> {

  constructor(
    /**
     * Returns the serialized state. You can use this to load from localStorage or IndexedDB
     * (in React web), or AsyncStorage (in React Native) or other.
     * It should return a Promise that resolves to the serialized state, or to null if the state
     * is not yet persisted.
     */
    public loadSerialized: () => Promise<string | null>,
    //
    /**
     * Saves the given serialized state. You can use this to save to localStorage or IndexedDB
     * (in React web), or AsyncStorage (in React Native) or other.
     * It should return a Promise that resolves when the state is saved.
     */
    public saveSerialized: (serialized: string) => Promise<void>,
    //
    /**
     * Deletes the serialized state. You can use this to delete from the localStorage or IndexedDB
     * (in React web), or AsyncStorage (in React Native) or other.
     * It should return a Promise that resolves when the state is deleted.
     */
    public deleteSerialized: () => Promise<void>,
    //
    /**
     * You HAVE to list here all the custom classes that are part of your state, directly or
     * indirectly. Note: You don't need to list native JavaScript classes, like Date.
     * For example, suppose you have a class `State` that has a property `todoList` of
     * type `TodoList`.
     * And the class `TodoList` has a property `items` of type `Array<TodoItem>`.
     * Then you have to list all three classes here: `[State, TodoList, TodoItem]`.
     */
    public classesToSerialize: Array<ClassOrEnum>
  ) {
    super();
    this.checkClassNames();
  }

  /**
   * Returns true if the bundler is minifying class names. Since the bundler minifies this library
   * together with the app, we know class names are minified if this class lost its own name.
   */
  protected classNamesAreMinified(): boolean {
    return ClassPersistor.name !== 'ClassPersistor';
  }

  /**
   * Returns true if the class name looks minified: one or two characters, starting with a
   * lowercase letter, `_` or `$`, like `e`, `ab` or `$e`. Normal names, like `myState`, don't.
   */
  private static looksMinified(name: string | undefined): boolean {
    return /^[a-z_$][\w$]?$/.test(name ?? '');
  }

  private checkClassNames() {
    const minified = this.classNamesAreMinified();
    const classByKey = new Map<string, any>();

    for (const c of this.classesToSerialize) {
      if (typeof c !== 'function' || !isClass(c)) continue; // Enums.
      if (isNativeFunction(c)) continue; // Built-in classes, like Date, are not saved by their name.

      const hasTypeName = Object.prototype.hasOwnProperty.call(c, 'typeName');
      const key = getClassKey(c);

      if (hasTypeName) {
        if (typeof key !== 'string' || key.length === 0)
          throw new StoreException(
            `The static typeName of class "${c.name}" must be a non-empty string.`);
      }
      //
      else if (minified || ClassPersistor.looksMinified(key))
        throw new StoreException(
          `Class names are being minified (found class "${key}"), so the ClassPersistor can't ` +
          `save the state by class name. Either turn off class name minification in your ` +
          `bundler (see "Class names and minification" in the persistor docs at kissforreact.org), ` +
          `or add a static typeName to each state class, ` +
          `like: static readonly typeName = 'TodoItem';`);

      const previous = classByKey.get(key);
      if (previous !== undefined && previous !== c)
        throw new StoreException(
          `Two different state classes are saved under the same name "${key}". ` +
          `Give one of them a different static typeName.`);

      classByKey.set(key, c);
    }
  }

  /**
   * Read the saved state from the persistence. Returns null if the state is not yet persisted.
   * Don't call it yourself: the store calls it once, when it's created, and if there is a
   * saved state, it replaces the store's initial-state. If the saved state can't be read
   * (for example, it's corrupted, or it has a class that is not in `classesToSerialize`),
   * this throws. The store then logs the error, gives it to the `errorObserver`, deletes the
   * saved state, and saves the initial-state instead. See `Persistor.readState`.
   */
  async readState(): Promise<St | null> {

    // Reads the JSON file as a string.
    const serializedString = await this.loadSerialized();
    if (serializedString === null) return null;

    ESSerializer.registerClasses(this.classesToSerialize);

    return ESSerializer.deserialize(serializedString);
  }

  /**
   * Save an initial-state to the persistence.
   */
  async saveInitialState(state: St) {
    const serializedString = ESSerializer.serialize(state);
    await this.saveSerialized(serializedString);
  }

  /**
   * Delete the saved state from the persistence.
   */
  async deleteState() {
    return this.deleteSerialized();
  }

  /**
   * We assume the state is small, and we save `newState` everytime, ignoring `lastPersistedState`.
   */
  async persistDifference(_lastPersistedState: St | null, newState: St) {
    const serializedString = ESSerializer.serialize(newState);
    await this.saveSerialized(serializedString);
  }
}

