import { PersistAction, Persistor } from "./Persistor";
import { KissAction, UpdateStateAction } from "./KissAction";
import { Store } from "./Store";
import { StoreException } from "./StoreException";
import { capTimeoutMillis } from "./utils";

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
  // True only while the store applies the state read from the persistor. That's the only
  // dispatch allowed before the store is ready.
  isApplyingReadState = false;
  // Called by `readInitialState` right after `isReady` becomes true. The store uses it to
  // publish the readiness to the `useIsStoreReady` hook.
  onReady: (() => void) | null = null;
  private readonly _ready: Promise<void>;
  private _resolveReady!: () => void;
  // Called when the persistence process currently running finishes. See `_waitForPersisting`.
  private _persistingWaiters: (() => void)[] = [];
  // True if a `PersistAction` was dispatched while a persistence operation was running.
  // When it finishes, the state is persisted ignoring the throttle.
  private _isPersistActionWaiting = false;
  // How many `logOut` calls are running. See `_startLogOut`.
  private _logOutsRunning = 0;
  // Called when no `logOut` is running anymore. See `_waitForLogOut`.
  private _logOutWaiters: (() => void)[] = [];

  /**
   * Called with the persistence errors: the errors thrown by `Persistor.persistDifference`
   * (after `Persistor.wrapError`, and only if it didn't return `null`), the errors thrown
   * while reading the persisted state, and the errors added with `Persistor.addError`.
   * The `originalError` is the error before `Persistor.wrapError` (or the same error, if it
   * didn't go through `wrapError`). If not set, the errors are logged with `Store.log()`.
   * The `observeOnly` is true when the error is also thrown to the caller (by `logOut`), so it
   * should only be observed (given to the `errorObserver`), and not thrown again.
   */
  onError: ((error: any, originalError: any, observeOnly: boolean) => void) | null = null;

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
      // Tells the store right away, so that it publishes the readiness to `useIsStoreReady`.
      // This runs after the read state was applied to the store (if there was one), so a
      // component that sees the store as ready also sees the restored state.
      this.onReady?.();
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
        // Nothing was saved. Otherwise, the next save would diff against the initial-state,
        // which was never saved. With null, the next save saves the whole state.
        this.lastPersistedState = null;
        this.log('Error saving initial state:' + error + '.');
        this.reportError(error);
      }
    }
    //
    else {
      // If the saved state was read successfully, we replace the store state with it.
      // In this case, the initial-state passed in the Store constructor was used
      // only while the persisted state is loading.
      // The slices of server state merged while the persisted state was being read (see
      // `Store.mergeServerState`) are merged into it again, so that they are not lost.
      const stateToApply = store._applyPendingServerSlices(stateReadFromPersistor);
      let promise: Promise<unknown>;
      this.isApplyingReadState = true;
      try {
        promise = store.dispatchAndWait(
          new UpdateStateAction<St>(
            (_) => stateToApply,
            false, // Do not persist the state we just read from the persistence.
          )
        );
      } finally {
        this.isApplyingReadState = false;
      }
      await promise;

      // The state just read is what's saved, even if the persistor is paused. Otherwise, the
      // next save would diff against the initial-state, which was never saved.
      this.lastPersistedState = stateReadFromPersistor;
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
  private reportError(error: any, originalError: any = error, observeOnly: boolean = false) {
    if (this.onError) {
      try {
        this.onError(error, originalError, observeOnly);
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

  /**
   * Same as `Persistor.saveInitialState` but will remember the `initialState` as the
   * `lastPersistedState`. If a save is running, waits for it to finish first, so that it can't
   * overwrite the `initialState` later.
   */
  async saveInitialState(initialState: St): Promise<void> {
    return this._runAlone(async () => {
      this.lastPersistedState = initialState;
      try {
        await this.persistor.saveInitialState(initialState);
      } catch (error) {
        // Not saved, so it's not considered persisted (unless it was replaced in the meantime).
        if (this.lastPersistedState === initialState) this.lastPersistedState = null;
        throw error;
      }
    });
  }

  /**
   * Same as `Persistor.readState` but will remember the read state as the `lastPersistedState`.
   * If a save is running, waits for it to finish first, so that it reads the saved state, and
   * so that the save can't change the `lastPersistedState` later.
   */
  async readState(): Promise<St | null> {
    return this._runAlone(async () => {
      const state = await this.persistor.readState();
      this.lastPersistedState = state;
      return state;
    });
  }

  /**
   * Same as `Persistor.deleteState` but will clear the `lastPersistedState`.
   * If a save is running, waits for it to finish first, so that it can't put the deleted
   * state back later.
   */
  async deleteState(): Promise<void> {
    return this._runAlone(async () => {
      this.lastPersistedState = null;
      await this.persistor.deleteState();
    });
  }

  /**
   * Runs the `operation` when no other persistence operation is running, so that they don't
   * overlap. While it runs, state changes are not saved. They are saved when it finishes, if
   * necessary.
   */
  private async _runAlone<T>(operation: () => Promise<T>): Promise<T> {
    while (this.isPersisting) await this._waitForPersisting();
    this._startOperation();
    try {
      return await operation();
    } finally {
      this._finishOperation();
    }
  }

  private _startOperation(): void {
    this.isPersisting = true;
  }

  /**
   * Called when a persistence operation finishes (even if it failed). If the state may have
   * changed while it was running, persists it if necessary.
   */
  private _finishOperation(): void {
    this.processAddedErrors();
    this.isPersisting = false;
    const waiters = this._persistingWaiters;
    this._persistingWaiters = [];
    for (const resolve of waiters) resolve();

    const newStateAvailable = this.isANewStateAvailable;
    const persistActionWaiting = this._isPersistActionWaiting;
    this.isANewStateAvailable = false;
    this._isPersistActionWaiting = false;

    // If a new state became available while the operation was running, save it if necessary.
    // If a PersistAction was dispatched meanwhile, the throttle is ignored.
    if (newStateAvailable)
      this._process(null, this.newestState as St, persistActionWaiting);
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
   *
   * The result of the actions dispatched before logOut is discarded, and so are the actions
   * they dispatch after it.
   *
   * Same as `store.logOut`. See it for more details.
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
    return store._logOut(this, initialState, throttle, actionsThrottle);
  }

  /**
   * For Kiss internal use only. Called by the store when `logOut` starts.
   * While a logOut is running, the persistor doesn't start a new persistence process
   * (except to persist the initial-state). This is kept apart from `pause`/`resume`, so that
   * a persistor paused by the app, before or during logOut, stays paused after it.
   */
  _startLogOut(): void {
    // Logging out while the persisted state is still being read is a developer error:
    // the read would finish afterwards and bring back the old user's state.
    if (!this.isReady)
      throw new StoreException(
        'Called logOut() while the persisted state is still being read. ' +
        'Wait for store.ready() before calling logOut().');

    this._logOutsRunning++;
    this._cancelTimer();
  }

  /**
   * For Kiss internal use only. Called by the store during `logOut`.
   * If the state is currently being persisted, we can't delete it right now. Wait until the
   * current persistence finishes. Since a logOut is running, no new persistence process will
   * start after that.
   */
  async _waitWhilePersisting(): Promise<void> {
    while (this.isPersisting) await this._waitForPersisting();
  }

  /**
   * For Kiss internal use only. Called by the store during `logOut`, to delete the persisted
   * state. If it fails, the error is reported (only observed, since logOut throws it), and
   * returned. Returns `null` if it succeeded.
   */
  async _deleteLogOutState(): Promise<{ error: any } | null> {
    // Another logOut that runs at the same time may be persisting its initial-state.
    await this._waitWhilePersisting();
    try {
      await this.deleteState();
      return null;
    } catch (error) {
      this.reportError(error, error, true);
      return { error };
    }
  }

  /**
   * For Kiss internal use only. Called by the store during `logOut`, to persist the initial-state.
   * Note this is done even if the persistor is paused. If it fails, the error (after
   * `Persistor.wrapError`) is reported (only observed, since logOut throws it), and returned.
   * Returns `null` if it succeeded, or if `wrapError` swallowed the error.
   */
  async _persistLogOutState(initialState: St): Promise<{ error: any } | null> {
    // Another logOut that runs at the same time may be persisting its initial-state. If both
    // saves ran at the same time, the one that finishes last would win, and it could be the
    // initial-state of the other logOut.
    await this._waitWhilePersisting();
    return this._persist(new Date(), initialState, true);
  }

  /**
   * For Kiss internal use only. Called by the store when `logOut` finishes (even if it failed).
   * If no other logOut is running, and the persistor is not paused, persistence resumes: if the
   * state changed after the initial-state was persisted, this persists the new state.
   */
  _endLogOut(): void {
    this._logOutsRunning--;
    if (this._logOutsRunning > 0) return;

    const waiters = this._logOutWaiters;
    this._logOutWaiters = [];
    for (const resolve of waiters) resolve();

    if (!this.isPaused && this.isInit)
      this.process(null, this.newestState as St);
  }

  /**
   * Resolves when no `logOut` is running anymore.
   * Only call it while `_logOutsRunning` is more than zero.
   */
  private _waitForLogOut(): Promise<void> {
    return new Promise<void>(resolve => this._logOutWaiters.push(resolve));
  }

  /**
   * 1) If we're still persisting the last time, don't persist no matter what.
   *    Instead, check again when it finishes.
   * 2) If action is of type `UpdateStateAction` with `ifPersists` false,
   *    don't persist, but consider the state as persisted (if no earlier change is waiting to
   *    be saved). This is done even while the persistor is paused.
   * 3) If throttle period is done (or if action is PersistAction), persist.
   * 4) If throttle period is NOT done, create a timer to persist as soon as it finishes.
   *
   * Return true if the persist process started.
   * Return false if persistence was postponed.
   *
   */
  process(action: KissAction<St> | null, newState: St): boolean {
    return this._process(action, newState, false);
  }

  /**
   * Same as `process`, but if `ignoreThrottle` is true, the throttle is ignored,
   * as if the action were a `PersistAction`.
   */
  private _process(action: KissAction<St> | null, newState: St, ignoreThrottle: boolean): boolean {
    // True if an earlier state change was not saved yet. For example, because it's waiting for
    // the throttle, for a running save to finish, or for the paused persistor to resume.
    const hasUnsavedChange = this.isInit && (this.newestState !== this.lastPersistedState);

    this.isInit = true;
    this.newestState = newState;

    const isNotPersisted = (action instanceof UpdateStateAction) && (!action.ifPersists);

    // 1) While a persistence operation is running, remember to check again when it finishes.
    // This is done even if the new state is the last persisted state, since the running
    // operation will change the last persisted state when it finishes. But not for a state
    // that should not be persisted.
    if (this.isPersisting && !isNotPersisted) {
      this.isANewStateAvailable = true;
      if ((action instanceof PersistAction || ignoreThrottle) && !this.isPaused)
        this._isPersistActionWaiting = true;
    }

    if (this.lastPersistedState === newState) return false;

    // This is checked even while the persistor is paused. Otherwise, when it resumes,
    // it would see a difference, and save the state that should not be persisted.
    if (isNotPersisted) {
      // Only consider this state as persisted if no earlier change is waiting to be saved.
      // Otherwise, those earlier changes would be lost. In that case, the pending save will
      // save the newest state, which includes this one.
      if (!hasUnsavedChange && !this.timer && !this.isPersisting && !this.isANewStateAvailable)
        this.lastPersistedState = this.newestState;
      return false;
    }

    if (this.isPaused) return false;

    // While a logOut is running, don't persist. When it finishes, it persists what's needed.
    if (this._logOutsRunning > 0) return false;

    // While the initial state is being read/saved, don't persist. It will be persisted when it finishes.
    if (!this.isReady) return false;

    // 1) If we're still persisting the last time, don't persist no matter what.
    // It was already remembered above, to check again when it finishes.
    if (this.isPersisting) {
      return false;
    }
    //
    else {

      const now = new Date();

      // 2) If throttle period is done (or if action is PersistAction), persist.
      if (
        now.valueOf() - this.lastPersistTime.valueOf() >= this.throttle
        || (action instanceof PersistAction)
        || ignoreThrottle
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
          }, capTimeoutMillis(asSoonAsThrottleFinishes));
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

  /**
   * Resolves when the persistence process currently running finishes.
   * Only call it while `isPersisting` is true.
   *
   * Note we use the `isPersisting` flag, and don't keep the promise of the running process.
   * When `persistDifference` throws synchronously, instead of returning a rejected promise,
   * `_persist` finishes before it even returns its promise. A kept promise would then never be
   * cleared, and waiting for it in a loop would freeze the app.
   */
  private _waitForPersisting(): Promise<void> {
    return new Promise<void>(resolve => this._persistingWaiters.push(resolve));
  }

  // Never rejects. A `persistDifference` that throws synchronously, or returns a rejected
  // promise, is handled the same way: its error is reported, and the state is not saved.
  /**
   * Returns the error (after `Persistor.wrapError`) if the save failed, or `null` if it
   * succeeded, or if `wrapError` swallowed the error. If `observeOnly` is true, the error is
   * only observed, since the caller throws it.
   */
  private async _persist(now: Date, newState: St, observeOnly: boolean = false)
    : Promise<{ error: any } | null> {
    let failure: { error: any } | null = null;
    this._startOperation();
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
      if (processedError !== null && processedError !== undefined) {
        this.reportError(processedError, error, observeOnly);
        failure = { error: processedError };
      }
    }
      //
    finally {
      // If a new state became available while the present state was saving, save again.
      this._finishOperation();
    }

    return failure;
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
   * For Kiss internal use only. Called by `store.dispose()`. Pauses the persistor, and cancels
   * the pending save (a state change waiting for the throttle). A save that is already running
   * still finishes.
   */
  dispose(): void {
    this.isPaused = true;
    this._cancelTimer();
  }

  /**
   * Persists the current state (if it's not yet persisted), then pauses the `Persistor`
   * temporarily.
   *
   *
   * When `persistAndPause` is called while the persisted state is still being read, while a
   * `logOut` is running, or while a persistence process is running, it waits for them to
   * finish. Note logOut persists its initial-state, and the state before it is never persisted. Then, if the current state is
   * not yet persisted, it immediately starts a new persistence process (ignoring `throttle`).
   * The returned promise completes when the current state is persisted.
   *
   * If the save fails, the returned promise still resolves. It never rejects. This is on
   * purpose, not a bug: this method is usually called when the app is shutting down or going to
   * the background, and then the app can't recover from a failed save anyway. The error is not
   * lost: it's reported (see `onError`) before the promise resolves, so it can be logged.
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

    // If a logOut is running, the current state belongs to the previous user, and must not be
    // persisted. Wait until the logOut finishes, since it persists its initial-state (even
    // though the persistor is paused). And if the state is being persisted, wait until it
    // finishes. Since the persistor is paused, no new persistence process will start after that.
    while (this._logOutsRunning > 0 || this.isPersisting) {
      if (this._logOutsRunning > 0) await this._waitForLogOut();
      else await this._waitForPersisting();
    }

    if (this.isInit && (this.lastPersistedState !== this.newestState)) {
      const now = new Date();
      await this._persist(now, this.newestState as St); // TypeScript forced cast
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

