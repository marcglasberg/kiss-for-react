import { KissAction } from './KissAction';
import { Store } from './Store';

/**
 * Use it like this:
 *
 * ```ts
 * const store = createStore<AppState>({
 *   initialState: AppState.initialState(),
 *   persistor: new MyPersistor(),
 * });
 *
 * await store.ready();
 * store.dispatch(new InitAppAction());
 * ```
 *
 * Do NOT read the state yourself before creating the store. When the store is created,
 * Kiss calls `readState` once. If there is a saved state, it replaces the initial state in the
 * store. If there is none, Kiss calls `saveInitialState` with the initial state.
 *
 * Until the persisted state is loaded, the store state is the `initialState`, which your UI can
 * use while loading. Changes made to the state before `store.ready()` resolves may be
 * overwritten by the persisted state, so wait for it before dispatching the actions that
 * start your app.
 */
export abstract class Persistor<St> {

  /**
   * Function `readState` should read/load the saved state from the persistence.
   * It will be called only once per run, when the app starts, during the store creation.
   *
   * - If the state is not yet saved (first app run), `readState` should return `null`.
   *
   * - If the saved state is valid, `readState` should return the saved state.
   *
   * - If the saved state is corrupted but can be fixed, `readState` should save the fixed
   *   state and then return it.
   *
   * - If the saved state is corrupted and cannot be fixed, or some other serious error occurs
   *   while reading the state, `readState` should thrown an error, with an appropriate error
   *   message.
   *
   * Note: If an error is thrown by `readState`, Kiss will log it with `Store.log()`, and give
   * it to the store's `errorObserver` (with a `null` action). The saved state is then deleted,
   * and the initial-state is saved instead.
   *
   * If you prefer to fix the problem yourself, but still let the user know about it, you
   * can report an error with `addError` instead of throwing. For example:
   *
   * ```ts
   * async readState(): Promise<AppState | null> {
   *   try {
   *     return await this.read();
   *   } catch (error) {
   *     await this.deleteState();
   *     this.addError(new UserException('Could not read your data, so it was reset.'));
   *     return null;
   *   }
   * }
   * ```
   */
  abstract readState(): Promise<St | null>;

  /**
   * Function `deleteState` should delete/remove the saved state from the persistence.
   */
  abstract deleteState(): Promise<void>;

  /**
   * Function `persistDifference` should save the new state to the persistence,
   * and return a `Promise` that completes only after it is persisted.
   *
   * This new state is provided to the function as a parameter called `newState`.
   * For simpler apps where your state is small, you can simply persist the whole `newState`
   * every time.
   *
   * But for larger apps, you may compare it with the last persisted state, and persist only
   * the difference between them. The last persisted state is provided to the function as a
   * parameter called `lastPersistedState`. It may be `null` if there is no persisted state
   * yet (first app run).
   *
   * If this method throws an error, it will first be processed by `wrapError`, and then
   * given to the store's `errorObserver` (with a `null` action). If the resulting error is a
   * `UserException`, it is shown to the user. Also, `newState` will NOT be considered persisted,
   * so the next call will receive the same `lastPersistedState`. Note the save is not retried
   * by itself: it will be tried again the next time the state changes.
   *
   * @param lastPersistedState The last state that was persisted. It may be null.
   * @param newState The new state to be persisted.
   */
  abstract persistDifference(
    lastPersistedState: St | null,
    newState: St
  ): Promise<void>;

  /**
   * Function `saveInitialState` should save the given `state` to the persistence,
   * replacing any previous state that was saved.
   *
   * The default implementation calls `persistDifference` with a `null` last persisted state.
   */
  saveInitialState(state: St): Promise<void> {
    return this.persistDifference(null, state);
  }

  /**
   * The default throttle is 2 seconds (2000 milliseconds).
   * Return `null` to turn off the throttle.
   */
  get throttle(): number | null {
    return 2000; // Default throttle is 2 seconds.
  }

  /**
   * If any error is thrown by `persistDifference`, you have the chance to further process
   * it by using `wrapError`. Usually this is used to wrap the error inside another that
   * better describes the failure. For example, you could turn a storage error into a
   * `UserException`, so that it's shown to the user:
   *
   * ```ts
   * wrapError(error: any) {
   *   return (error instanceof StorageError)
   *     ? new UserException('Could not save your data.', { hardCause: error })
   *     : error;
   * }
   * ```
   *
   * To ignore the error, return `null`. Note the state that failed to save is still NOT
   * considered persisted.
   *
   * If instead of RETURNING an error you THROW an error inside `wrapError`, Kiss will use
   * the thrown error instead of the original error. But it's recommended that you return it.
   */
  wrapError(error: any): any {
    return error;
  }

  private readonly _errors: any[] = [];

  /**
   * Reports an error without throwing it. The error will be given to the store's
   * `errorObserver` (with a `null` action), and if it's a `UserException`, it will be shown
   * to the user. Errors added here don't go through `wrapError`.
   *
   * This is useful in `readState`, `deleteState` and `saveInitialState`, when you can fix
   * the problem yourself, but still want to let the user know about it.
   */
  addError(error: any): void {
    this._errors.push(error);
  }

  /**
   * Returns the first error added with `addError`, and removes it.
   * Returns `null` if there are no errors. Used by Kiss.
   */
  getAndRemoveFirstError(): any {
    return (this._errors.length === 0) ? null : this._errors.shift();
  }
}

/**
 * A decorator to print persistor information to the console.
 * Use it like this:
 *
 * ```ts
 * const store = createStore<AppState>({
 *   ...otherOptions,
 *   persistor: new PersistorPrinterDecorator<AppState>(persistor),
 * });
 * ```
 */
export class PersistorPrinterDecorator<St> extends Persistor<St> {
  private _persistor: Persistor<St>;

  constructor(persistor: Persistor<St>) {
    super();
    this._persistor = persistor;
  }

  async readState(): Promise<St | null> {
    Store.log('Persistor: read state.');
    return this._persistor.readState();
  }

  async deleteState(): Promise<void> {
    Store.log('Persistor: delete state.');
    return this._persistor.deleteState();
  }

  async persistDifference(
    lastPersistedState: St | null,
    newState: St
  ): Promise<void> {
    Store.log(`Persistor: persist difference:
      lastPersistedState = ${lastPersistedState}
      newState = ${newState}`);
    return this._persistor.persistDifference(lastPersistedState, newState);
  }

  async saveInitialState(state: St): Promise<void> {
    Store.log('Persistor: save initial state.');
    return this._persistor.saveInitialState(state);
  }

  get throttle(): number | null {
    return this._persistor.throttle;
  }

  wrapError(error: any): any {
    return this._persistor.wrapError(error);
  }

  addError(error: any): void {
    this._persistor.addError(error);
  }

  getAndRemoveFirstError(): any {
    return this._persistor.getAndRemoveFirstError();
  }
}

/**
 * A dummy persistor.
 */
export class PersistorDummy<St> extends Persistor<St | null> {
  async readState(): Promise<St | null> {
    return null;
  }

  async deleteState(): Promise<void> {
    return;
  }

  async persistDifference(_lastPersistedState: St | null, _newState: St): Promise<void> {
    return;
  }

  async saveInitialState(_state: St | null): Promise<void> {
    return;
  }

  get throttle(): number | null {
    return null;
  }
}

export class PersistException extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'PersistException';

    // Maintains proper stack trace for where our error was thrown (only available on V8).
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersistException);
    }
  }
}

/**
 * An action that can be dispatched to force the Persistor to persist the state immediately.
 * It does not change the state.
 *
 * Note: This only works if the Persistor is waiting for the throttle period.
 * If the Persistor is currently persisting the state, this action will be ignored.
 */
export class PersistAction<St> extends KissAction<St> {
  reduce(): null {
    return null;
  }
}

