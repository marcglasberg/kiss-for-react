import { PersistAction, Persistor } from "./Persistor";
import { KissAction, UpdateStateAction } from "./KissAction";
import { Store } from "./Store";

export class ProcessPersistence<St> {
  persistor: Persistor<St>;
  lastPersistedState: St | null;
  newestState: St | null;
  isPersisting = false;
  isANewStateAvailable = false;
  lastPersistTime: Date = new Date();
  timer?: ReturnType<typeof setTimeout>; // Timer's type
  isPaused = false;
  isInit = false;
  // False while `readInitialState` is running. State changes are only persisted after it finishes.
  isReady = false;
  private readonly _ready: Promise<void>;
  private _resolveReady!: () => void;
  // The persistence process currently running, if any.
  private _persisting: Promise<void> | null = null;
  finishedPersistingCallback: (() => void) | null = null;

  /**
   * Called with the persistence errors: the errors thrown by `Persistor.persistDifference`
   * (after `Persistor.wrapError`, and only if it didn't return `null`), the errors thrown
   * while reading the persisted state, and the errors added with `Persistor.addError`.
   * If not set, the errors are logged with `Store.log()`.
   */
  onError: ((error: any) => void) | null = null;

  constructor(persistor: Persistor<St>, lastPersistedState: St | null) {
    this.persistor = persistor;
    this.lastPersistedState = lastPersistedState;
    this.newestState = null;
    this._ready = new Promise<void>(resolve => this._resolveReady = resolve);
  }

  /**
   * Resolves when the persisted state has been read (or failed to read) at startup.
   * Never rejects.
   */
  ready(): Promise<void> {
    return this._ready;
  }

  async readInitialState(store: Store<St>, initialState: St) {
    try {
      await this._readInitialState(store, initialState);
    }
      //
    finally {
      // Now persist the state changes that happened while reading/saving the initial state.
      this.processAddedErrors();
      this.isReady = true;
      this._resolveReady();
      if (this.isInit) this.process(null, this.newestState as St);
    }
  }

  private async _readInitialState(store: Store<St>, initialState: St) {

    let stateReadFromPersistor: St | null = null;

    try {
      stateReadFromPersistor = await this.persistor.readState();
    } catch (error) {
      this.log('Error reading state:' + error + '. State will reset.');
      this.reportError(error);

      try {
        await this.persistor.deleteState();
      } catch (error) {
        this.log('Error deleting the state:' + error + '.');
        this.reportError(error);
      }
    }

    if (stateReadFromPersistor === null) {
      try {
        // If it was not possible to read the persisted state,
        // we persist the initial-state passed to the Store constructor.
        await this.persistor.saveInitialState(initialState);
      } catch (error) {
        this.log('Error saving initial state:' + error + '.');
        this.reportError(error);
      }
    }
    //
    else {
      // If the saved state was read successfully, we replace the store state with it.
      // In this case, the initial-state passed in the Store constructor was used
      // only while the persisted state is loading.
      await store.dispatchAndWait(
        new UpdateStateAction<St>(
          (_) => stateReadFromPersistor,
          false, // Do not persist the state we just read from the persistence.
        )
      );
    }
  }

  private log(message: string) {
    try {
      Store.log(message);
    } catch {
      // Discard error.
    }
  }

  /**
   * Gives the error to `onError`, or logs it if `onError` is not set.
   */
  private reportError(error: any) {
    if (this.onError) {
      try {
        this.onError(error);
      } catch (_error) {
        this.log('Error processing a persistence error:' + _error + '.');
      }
    }
    //
    else this.log('Persistence error:' + error + '.');
  }

  /**
   * Reports the errors added with `Persistor.addError`, removing them from the persistor.
   */
  processAddedErrors(): void {
    while (true) {
      let error: any;
      try {
        error = this.persistor.getAndRemoveFirstError?.();
      } catch {
        return;
      }
      if (error === null || error === undefined) break;
      this.reportError(error);
    }
  }

  get throttle(): number {
    return this.persistor.throttle || 0;
  }

  async saveInitialState(initialState: St): Promise<void> {
    this.lastPersistedState = initialState;
    try {
      await this.persistor.saveInitialState(initialState);
    } finally {
      this.processAddedErrors();
    }
  }

  /**
   * Same as `Persistor.readState` but will remember the read state as the `lastPersistedState`.
   */
  async readState(): Promise<St | null> {
    try {
      const state = await this.persistor.readState();
      this.lastPersistedState = state;
      return state;
    } finally {
      this.processAddedErrors();
    }
  }

  /**
   * Same as `Persistor.deleteState` but will clear the `lastPersistedState`.
   */
  async deleteState(): Promise<void> {
    this.lastPersistedState = null;
    try {
      await this.persistor.deleteState();
    } finally {
      this.processAddedErrors();
    }
  }

  /**
   * Call `logOut()` when you want to delete the persisted state, and return the store
   * state to the given initial-state. That's usually necessary when the user logs out
   * of your app, or the user deletes its account, so that another user may log in,
   * or start a new sign-up process.
   *
   * Note: If you know about any timers or async processes that you may have started,
   * you should stop/cancel them all before calling this method.
   *
   * You may opt to:
   *
   * - Wait for `throttle` milliseconds to make sure all async processes that the app may
   * have started have time to finish. The default `throttle` is 3000 milliseconds (3 seconds).
   *
   * - Wait for all actions currently running to finish, but wait at most `actionsThrottle`
   * milliseconds. If the actions are not finished by then, the state will be deleted anyway.
   * The default `actionsThrottle` is 6000 milliseconds (6 seconds).
   */
  async logOut({
                 store,
                 initialState,
                 throttle = 3000,
                 actionsThrottle = 6000,
               }: {
    store: Store<St>,
    initialState: St,
    throttle?: number,
    actionsThrottle?: number,
  }): Promise<void> {

    // Pauses the persistor, so it doesn't start a new persistence process.
    this.pause();

    // Cancel the persistence timer.
    this._cancelTimer();

    // Set the store to shut down, so it doesn't start any new actions.
    store.setShutDown(true);

    try {
      // If the state is currently being persisted, we can't delete it right now.
      // Wait until the current persistence finishes. Since the persistor is
      // paused, no new persistence process will start after that.
      while (this.isPersisting) {
        await new Promise<void>(resolve => this.finishedPersistingCallback = resolve);
      }
      this.finishedPersistingCallback = null;

      // Wait for the throttle period to finish.
      await new Promise<void>(resolve => setTimeout(resolve, throttle));

      // Wait for all actions currently running to finish,
      // but wait at most `actionsThrottle` milliseconds.
      await store.waitAllActions(null, {
        timeoutMillis: actionsThrottle,
        completeImmediately: true
      })
        .catch(() => {
        });

      // Delete the old persisted state.
      await this.deleteState();

      // Synchronously change the store state to the initial-state.
      // The store must not be shut down, or `dispatchSync` would ignore the action.
      // The persistor is paused, so this doesn't start a persistence process.
      store.setShutDown(false);
      store.dispatchSync(new UpdateStateAction(() => initialState));
      store.setShutDown(true);

      // Persist the new initial-state.
      await this._persist(new Date(), initialState);
    }
      //
    finally {
      this.finishedPersistingCallback = null;

      // Restart the store accepting new actions.
      store.setShutDown(false);

      // Resume persisting. If the state changed after the initial-state
      // was persisted, this persists the new state.
      this.resume();
    }
  }

  /**
   * 1) If we're still persisting the last time, don't persist no matter what.
   * 2) If action is of type `UpdateStateAction` with `ifPersists` false,
   *    don't persist, but consider the state as persisted.
   * 3) If throttle period is done (or if action is PersistAction), persist.
   * 4) If throttle period is NOT done, create a timer to persist as soon as it finishes.
   *
   * Return true if the persist process started.
   * Return false if persistence was postponed.
   *
   */
  process(action: KissAction<St> | null, newState: St): boolean {
    this.isInit = true;
    this.newestState = newState;

    if (this.isPaused || this.lastPersistedState === newState) return false;

    if ((action instanceof UpdateStateAction) && (!action.ifPersists)) {
      this.lastPersistedState = this.newestState;
      return false;
    }

    // While the initial state is being read/saved, don't persist. It will be persisted when it finishes.
    if (!this.isReady) return false;

    // 1) If we're still persisting the last time, don't persist no matter what.
    if (this.isPersisting) {
      this.isANewStateAvailable = true;
      return false;
    }
    //
    else {

      const now = new Date();

      // 2) If throttle period is done (or if action is PersistAction), persist.
      if (
        now.valueOf() - this.lastPersistTime.valueOf() >= this.throttle
        || (action instanceof PersistAction)
      ) {
        this._cancelTimer();
        this._persist(now, newState).then();
        return true;
      }

      // 3) If throttle period is NOT done, create a timer to persist as soon as it finishes.
      else {
        if (!this.timer) {

          const asSoonAsThrottleFinishes = this.throttle - (now.valueOf() - this.lastPersistTime.valueOf());

          this.timer = setTimeout(() => {
            this.timer = undefined;
            this.process(null, this.newestState as St); // TypeScript forced cast
          }, asSoonAsThrottleFinishes);
        }
        return false;
      }
    }
  }

  private _cancelTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private _persist(now: Date, newState: St): Promise<void> {
    const persisting = this._doPersist(now, newState);
    this._persisting = persisting;
    return persisting;
  }

  private async _doPersist(now: Date, newState: St): Promise<void> {
    this.isPersisting = true;
    this.lastPersistTime = now;
    this.isANewStateAvailable = false;

    try {
      await this.persistor.persistDifference(
        this.lastPersistedState,
        newState
      );

      // Only consider the state persisted if it succeeded. Otherwise, the next time we persist,
      // the difference will be calculated from the last state that was actually persisted.
      this.lastPersistedState = newState;
    }
      //
    catch (error) {
      // The error is reported, never thrown, so it can't become an unhandled rejection.
      // Note the save is not retried here. It will be tried again when the state changes.
      let processedError: any;
      try {
        processedError = this.persistor.wrapError ? this.persistor.wrapError(error) : error;
      } catch (_error) {
        // If `wrapError` throws, the thrown error is used instead.
        processedError = _error;
      }
      if (processedError !== null && processedError !== undefined) this.reportError(processedError);
    }
      //
    finally {
      this.processAddedErrors();
      this.isPersisting = false;
      this._persisting = null;
      this.finishedPersistingCallback?.();

      // If a new state became available while the present state was saving, save again.
      if (this.isANewStateAvailable) {
        this.isANewStateAvailable = false;
        this.process(null, this.newestState as St);
      }
    }
  }

  /**
   * Pause the `Persistor` temporarily.
   *
   * When `pause` is called, the Persistor will not start a new persistence process, until method
   * `resume` is called. This will not affect the current persistence process, if one is currently
   * running.
   *
   * Note: A persistence process starts when the `persistDifference` method is called, and
   * finishes when the promise returned by that method completes.
   *
   */
  pause(): void {
    this.isPaused = true;
  }

  /**
   * Persists the current state (if it's not yet persisted), then pauses the `Persistor`
   * temporarily.
   *
   *
   * When `persistAndPause` is called while the persisted state is still being read, or while a
   * persistence process is running, it waits for them to finish. Then, if the current state is
   * not yet persisted, it immediately starts a new persistence process (ignoring `throttle`).
   * The returned promise completes when the current state is persisted.
   *
   * Then, the Persistor will not start another persistence process, until method `resume` is
   * called.
   *
   * Note: A persistence process starts when the `persistDifference` method is called, and
   * finishes when the promise returned by that method completes.
   *
   */
  async persistAndPause(): Promise<void> {
    this.isPaused = true;

    this._cancelTimer();

    // If the persisted state is still being read, wait until it finishes.
    await this._ready;

    // If the state is being persisted, wait until it finishes. Since the persistor
    // is paused, no new persistence process will start after that.
    while (this._persisting) {
      await this._persisting.catch(() => {
      });
    }

    if (this.isInit && (this.lastPersistedState !== this.newestState)) {
      const now = new Date();
      return this._persist(now, this.newestState as St); // TypeScript forced cast
    }
  }

  /**
   * Resumes persistence by the `Persistor`, after calling `pause` or `persistAndPause`.
   */
  resume(): void {
    this.isPaused = false;
    if (this.isInit) this.process(null, this.newestState as St);
  }
}

