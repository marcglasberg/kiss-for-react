import { Store } from "./Store";
import { StoreException } from "./StoreException";
import { UserException } from "./UserException";

/**
 * A SYNC reducer can return:
 * - `St`: A new state, changed synchronously.
 * - `null`: No state change
 *
 * An ASYNC reducer can return:
 * - `Promise<(state: St) => St>`: A new state, changed asynchronously.
 * - `Promise<(state: St) => null>`: No state change
 * - `Promise<null>`: No state change
 */
export type ReduxReducer<St> = St | null | Promise<((state: St) => (St | null)) | null>;

/**
 * A SYNC reducer can return:
 * - `St`: A new state, changed synchronously
 * - `null`: No state change
 */
export type SyncReducer<St> = St | null;

/**
 * An ASYNC reducer can return:
 * - `Promise<(state: St) => St>`: A new state, changed asynchronously
 * - `Promise<(state: St) => null>`: No state change
 * - `Promise<null>`: No state change
 */
export type AsyncReducer<St> = Promise<((state: St) => (St | null)) | null>;

export type AsyncReducerResult<St> = ((state: St) => (St | null)) | null;

// Interface for the checkInternet property.
interface CheckInternetOptions {
  /** Whether to show a dialog when no internet connection is available. */
  dialog: boolean;
}

/** Base action. All other actions should extend this one. */
export abstract class KissAction<St> {

  get attempts(): number {
    return this._retry.attempts;
  }

  /**
   * The `reduce()` method is the Reducer. It MUST be implemented by the action.
   *
   * A reducer can return:
   * - `St`: A new state, changed synchronously.
   * - `null`: No state change, decided synchronously.
   * - `Promise<(state: St) => St>`: A new state, changed asynchronously.
   * - `Promise<(state: St) => null>`: No state change, decided asynchronously.
   * - `Promise<null>`: No state change, decided asynchronously.
   */
  abstract reduce(): St | null | Promise<((state: St) => (St | null)) | null>;

  /**
   * The `before()` method MAY be implemented by the action. If implemented, it runs before the
   * reducer. It may be sync or async. If it's async, the reducer will run after the before
   * resolves.
   *
   * This method is useful for actions that need to perform some checks before executing the
   * reducer. If necessary, it can prevent the reducer from running by throwing an exception.
   * 
   * For example, the default `before()` method checks if the `checkInternet` property was set.
   * If it was set, it checks if the device has an internet connection. If the connection is not
   * present, it throws a `UserException`, preventing the reducer from running.
   *
   * Note the `after()` method always runs, even if the `before()` method throws an exception.
   */
  before(): void | Promise<void> {
    if (this.checkInternet) {
      const dialog = this.checkInternet.dialog;

      return this.hasInternet().then((isConnected: boolean) => {
        if (!isConnected) {
          if (dialog) {
            throw new UserException("Please, verify your connection.").withTitle("There is no Internet");
          } else {
            throw new UserException("No Internet").withDialog(false);
          }
        }
      });
    }

    // Return void (not a Promise) when we don't need to check internet.
    else return;
  }

  /**
  * Checks if the device has an internet connection.
  * Can be overridden by subclasses to provide custom internet connectivity checks.
  *   
  * By default, in web environment it uses `navigator.onLine`, and for other environments it returns `true`.  
  * Note `navigator.onLine` is not very useful, as it only tells you if there's a local connection, 
  * and not whether the internet is accessible.
  * 
  * It's recommended to override this method in your base action, to check for internet connectivity
  * in some other way that suits your needs.
  * 
  * For example, in React Native environments, we could use the `NetInfo` package 
  * (https://www.npmjs.com/package/@rescript-react-native/netinfo) to check for internet connectivity.
  * 
  * First, add NetInfo to your `package.json`:
  * 
  * ```json
  * "dependencies": {
  *   "@react-native-community/netinfo": "^11.4.1"
  * }
  * ```	
  * 
  * Then, import it in your action:
  * 
  * ```typescript
  * import NetInfo from '@react-native-community/netinfo';
  * ```
  * 
  * Finally, override the `hasInternet()` method:
  * 
  * ```typescript
  * protected hasInternet(): Promise<boolean> {
  *   return NetInfo.fetch().then(state => state.isConnected);
  * }
  * ```
  * 
  * Another option, for Node.js and the browser is using https://www.npmjs.com/package/is-online
  * 
  * Note: Instead of adding this to every action, you can create a base class 
  * that extends `KissAction` and implement the `hasInternet()` method there.
  */
  protected hasInternet(): Promise<boolean> {

    // In the browser, use navigator.onLine. Otherwise (Node.js, React Native, which has
    // `navigator` but no `navigator.onLine`), assume connected.
    const hasOnLine = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean';
    return Promise.resolve(hasOnLine ? navigator.onLine : true);
  }

  /**
   * The `after()` method MAY be implemented by the action. If implemented, it runs after the
   * `before()`, after `reduce()`, and after `wrapError()`.
   *
   * The `after()` method is always synchronous, and it will always be called when the action is
   * dispatched, even if errors were thrown by `before` or `reduce`.
   */
  after(): void {
  }

  /**
   * If any error is thrown by `reduce` or `before`, you have the chance to further process it
   * by using `wrapError`. Usually this is used to wrap the error inside another that better
   * describes the failed action.
   *
   * For example, if some input validation inside your action throws a `ValidationError`,
   * then instead of throwing this error you could do:
   *
   * ```
   * wrapError(error) { return new UserException("Please enter a valid input.", {hardCause: error}) }
   * ```
   *
   * If you want to disable the error you can return `null`. For example, if you want
   * to disable all errors of type `MyException`:
   *
   * ```
   * wrapError(error) { return (error instanceof MyException) ? null : error }
   * ```
   *
   * IMPORTANT: If instead of RETURNING an error you throw an error inside the `wrapError` method,
   * Kiss will catch this error and use it instead the original error. In other words,
   * returning an error or throwing an error works the same way. But it's recommended that you
   * return the error instead of throwing it anyway.
   *
   * IMPORTANT: Apart from defining `wrapError()` methods per action, you can also define a
   * global `wrapError` as a store parameter when you create the Store.
   */
  wrapError(error: any): any {
    return error;
  };

  /**
   * If the action should check for internet connection or not.
   * - If `checkInternet = { dialog: true }`, throw a UserException with a dialog.
   * - If `checkInternet = { dialog: false }`, throw a UserException without a dialog.
   * - If `checkInternet` is undefined/null, don't check for internet.
   * 
   * The default is checking for internet connectivity with `navigator.onLine`. To customize how 
   * internet connectivity is checked, you may override the `hasInternet()` method:
   * 
   * ```ts
   * class MyAction extends KissAction<State> {
   *   checkInternet = { dialog: true };
   * 
   *   protected async hasInternet(): Promise<boolean> {
   *     // Custom internet check implementation
   *     return navigator.onLine && await this.pingServer('https://api.example.com/health');
   *   }
   * 
   *   reduce() { ... }
   * }
   * ```
   * 
   * By default, the `hasInternet()` method uses `navigator.onLine` in web environments 
   * and returns true for other environments.
   */
  declare checkInternet?: CheckInternetOptions;

  private _store: Store<St> | null = null;
  private _resolve: ((value: ActionStatus) => void) | null = null;
  private _reject: ((error: any) => void) | null = null;
  private _status = new ActionStatus();
  private _initialState: St | null = null;
  private _log: { key: string, value: any }[] = [];

  /**
   * Adds a key/value pair to the action log.
   *
   * ```ts
   * class LoadUser extends Action {
   *
   *   async reduce() {
   *     let user = await loadUser();
   *     this.log('User', user.id); // Here!
   *
   *     return (state: State) => state.copy({ user });
   *   }
   * }
   * ```
   */
  log(key: string, value: any) {
    this._log.push({ key, value });
  }

  /**
   * Gets the action log.
   *
   * ```ts
   * function stateObserver(action: KissAction<State>, prevState: State, newState: State, error: any, dispatchCount: number) {
   *   let log = action.getLog(); // Here!
   *   saveMetrics(action, log, newState, error);
   * }
   * ```
   */
  getLog(): { key: string; value: any }[] {
    return this._log;
  }

  /**
   * Returns the "status" of the action, used to keep track of the action's lifecycle. If you have
   * a reference to the action you can check its status at any time with `action.status`:
   *
   * ```ts
   * let action = new MyAction();
   * await store.dispatchAndWait(action);
   * if (action.status.isCompletedOk) { ... }
   * ```
   * However, dispatchAndWait also returns the action status after it finishes:
   *
   * ```ts
   * let status = await store.dispatchAndWait(new MyAction());
   * if (status.isCompletedOk) { ... }
   * ```
   */
  get status() {
    return this._status;
  }

  /**
   * Dispatches an action to the Redux store.
   */
  protected dispatch(action: KissAction<St>): void {
    this.store.dispatch(action);
  }

  /**
   * Waits until the store state meets a certain condition, and then dispatches an action.
   * If the condition is already true, the action is dispatched right away.
   *
   * ```ts
   * this.dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
   * ```
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
   * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
   * timeout is logged with `Store.log()`. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1), but note that while it waits, the condition runs on every state change.
   *
   * ```ts
   * this.dispatchWhen(
   *   new BuyStock('IBM'),
   *   (state) => state.stocks.getPrice('IBM') >= 100,
   *   { timeoutMillis: 60 * 1000, onTimeout: () => console.log('IBM never reached 100.') },
   * );
   * ```
   */
  protected dispatchWhen(
    action: KissAction<St>,
    condition: (state: St) => boolean,
    options: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): void {
    this.store.dispatchWhen(action, condition, options);
  }

  /**
   * Dispatches an action and returns a promise that resolves when the action finishes.
   * While the state change from the action's reducer will have been applied when the promise
   * resolves, other independent processes that the action may have started may still be in
   * progress.
   *
   * Usage: `await this.dispatchAndWait(new MyAction())`.
   */
  protected dispatchAndWait(action: KissAction<St>): Promise<ActionStatus> {
    return this.store.dispatchAndWait(action);
  }

  /**
   * Dispatches the given action to the Redux store, to potentially change the state.
   *
   * This is exactly the same as the regular `dispatch`, except for the fact it
   * will throw a `StoreException` if the action is ASYNC. Note an action is ASYNC
   * if any of its `reduce()` or `before()` methods return a Promise.
   *
   * The only use for `dispatchSync` is when you need to guarantee (in runtime) that your
   * action is SYNC, which means the state gets changed right after the dispatch call.
   */
  dispatchSync(action: KissAction<any>): void {
    return this.store.dispatchSync(action);
  }

  /**
   * Returns the Redux store: `this.store`.
   *
   * To read the current state inside an action, use: `this.store.state` or simply `this.state`.
   * Note this is the CURRENT state, meaning it may change each time you look at it.
   *
   * If you want the snapshot of the state as it was when the action was dispatched, you can
   * use `this.initialState`. You can also make a copy of the current state at any point in time:
   *
   * ```ts
   * let currentState = this.state;
   * ```
   *
   * To dispatch an action inside the current action, you can simply write `this.dispatch()`
   * or `this.dispatchAndWait()`, which is the same as `this.store.dispatch()` etc.
   */
  protected get store(): Store<St> {
    if (this._store === null) throw new StoreException('Store not set in action');
    return this._store;
  }

  /**
   * Returns the CURRENT state: `this.state`.
   * Note this is the CURRENT state, meaning it may change each time you look at it.
   *
   * If you want a snapshot of the state as it was when the action was dispatched, you can
   * use `this.initialState`. You can also make a copy of the current state at any point in time:
   *
   * ```ts
   * let currentState = this.state;
   * ```
   *
   * To dispatch an action inside the current action, you can simply write `this.dispatch()`
   * or `this.dispatchAndWait()`, which is the same as `this.store.dispatch()` etc.
   */
  protected get state(): St {
    return this.store.state;
  }

  /**
   * Returns the state as it was when the action was dispatched.
   *
   * It can be the same or different from `this.state`, which is the current state in the store,
   * because other actions may have changed the current state since this action was dispatched.
   *
   * In the case of SYNC actions that do not dispatch other SYNC actions,
   * `this.state` and `this.initialState` will be the same.
   */
  get initialState(): St {
    return this._initialState as St;
  }

  /**
   * You can wrap the reducer to allow for some pre- or post-processing.
   * For instance, if you want to prevent an async reducer from modifying the current state,
   * if the current state has already changed since the reducer started:
   *
   * ```ts
   * wrapReduce(reduce: () => ReduxReducer<State>): () => ReduxReducer<State> {
   *   return async () => {
   *     let oldState = this.state;
   *     let result = await reduce();
   *     if (oldState !== this.state) return null;
   *     return typeof result === 'function' ? result : () => result;
   *   };
   * }
   * ```
   *
   * Note: If you return a function that returns a Promise, the action will be ASYNC.
   * If you return a function that returns St, the action will be SYNC only if the
   * before and reduce methods are also SYNC.
   */
  wrapReduce(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {
    return reduce;
  }

  /**
   * If method `abortDispatch()` returns true, the action will not be dispatched: `before`,
   * `reduce` and `after` will not be called. This is an advanced feature only useful under rare
   * circumstances, and you should only use it if you know what you are doing.
   */
  abortDispatch(): boolean {
    return false;
  }

  /**
   * Method `abortReduce()` is called with the result of the `reduce()` method, right after
   * the `reduce()` runs. However, it's only called if no error was thrown, and if the `reduce()`
   * method result would change the current state (in other words, if `reduce()` returned a
   * non-null state different from the current state).
   *
   * If `abortReduce()` returns true, the result of the `reduce()` method will be discarded,
   * as if the `reduce()` method itself returned null.
   *
   * Note: `abortReduce()` is called BEFORE the `after()` method, and the `after()` method will
   * run normally no matter the result of `abortReduce()`.
   *
   * This is mostly useful for async actions. While the action is waiting (for example, for a
   * server response), other actions may change the state, so the result may be out of date
   * by the time it arrives.
   *
   * For example, suppose a different user logs in while the profile of the previous user is
   * still loading. The loaded profile belongs to the wrong person, so we discard it:
   *
   * ```ts
   * class LoadUserProfile extends Action {
   *
   *   async reduce() {
   *     const profile = await api.getProfile(this.state.userId);
   *     return (state: State) => state.copy({ profile });
   *   }
   *
   *   // If a different user logged in while we were loading, don't save this profile.
   *   abortReduce(newState: State): boolean {
   *     return newState.userId !== this.initialState.userId;
   *   }
   * }
   * ```
   *
   * Note `this.initialState` is the state when the action was dispatched, while `newState`
   * is the state the reducer wants to apply.
   *
   * Method `abortReduce()` is an advanced feature only useful under rare circumstances,
   * and you should only use it if you know what you are doing.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameter documents the signature to override.
  abortReduce(state: St): boolean {
    return false;
  }

  /**
   * You can use `isWaiting` and pass it an action `type`:
   * - It returns true if an ASYNC action of the specific type is currently being processed.
   * - It returns false if an ASYNC action of the specific type is NOT currently being processed.
   * - This is only useful for ASYNC actions, since it always returns `false` when the action is SYNC.
   *
   * Note an action is ASYNC if it returns a promise from its `before` OR its `reduce` methods.
   *
   * ```ts
   * this.dispatch(new MyAction());
   * if (this.isWaiting(MyAction)) { ... } // Show a spinner
   * ```
   */
  isWaiting<T extends KissAction<St>>(type: abstract new (...args: any[]) => T): boolean {
    return this.store.isWaiting(type);
  }

  /**
   * Returns true if the given action `type` failed with an `UserException`.
   * Note: This method uses the EXACT action type. Subtypes are not considered.
   */
  isFailed<T extends KissAction<any>>(type: { new(...args: any[]): T }): boolean {
    return this.store.isFailed(type);
  }

  /**
   * Returns the `UserException` of the `type` that failed.
   * Note: This method uses the EXACT type in `type`. Subtypes are not considered.
   */
  exceptionFor<T extends KissAction<St>>(type: {
    new(...args: any[]): T
  }): (UserException | null) {
    return this.store.exceptionFor(type);
  }

  /**
   * Removes the exact given action `type` from the list of action types that failed.
   * Note it clears the EXACT given type. Subtypes are not considered.
   *
   * Even if you never call this method explicitly, just dispatching an action already clears that action type
   * from the list of failing action types. But you can call this method explicitly if you want to clear the
   * action type before it's used again.
   *
   * Usage:
   * ```ts
   * this.clearExceptionFor(MyAction);
   * ```
   */
  clearExceptionFor<T extends KissAction<St>>(type: { new(...args: any[]): T }): void {
    return this.store.clearExceptionFor(type);
  }

  /**
   * If your action overrides this method returning `true`, it will abort the action in
   * case the action is still running from a previous dispatch. For example:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *    nonReentrant = true;
   * }
   * ```
   */
  nonReentrant: boolean = false;

  /**
   * To retry the `reduce` method when it throws an error:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *    retry = {on: true}
   * }
   * ```
   *
   * The retry parameters are:
   *
   * - Initial Delay: Millisecond delay before the first retry attempt.
   * - Multiplier: The factor by which the delay increases for each subsequent retry.
   * - Maximum Retries: The maximum number of retries before giving up.
   * - Maximum Delay: The maximum millisecond delay between retries to avoid excessively long wait times.
   *
   *  And their default values are:
   *
   * - `initialDelay` is `350` milliseconds.
   * - `multiplier` is `2`, which means the default delays are: 350 millis, 700 millis, and 1.4 seg.
   * - `maxRetries` is `3`, meaning it will try a total of 4 times.
   * - `maxDelay` is `5000` milliseconds (which means 5 seconds).
   *
   * You can change one or more of the default values.
   * Doing so also turns on the retry:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *    retry = {initialDelay: 100, multiplier: 5, maxRetries: 10, maxDelay: 10000};
   * }
   * ```
   *
   * A `multiplier` of `1` keeps the delay constant.
   *
   * Invalid values (for example, a `multiplier` below `1`, a negative delay, or a `maxRetries`
   * that is not an integer `>= -1`) make the dispatch throw a `StoreException` that explains the problem.
   *
   * If you want to retry unlimited times, make `maxRetries` equal to `-1`,
   * or set `unlimitedRetries` to `true`:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *    retry = {maxRetries: -1};
   * }
   * ```
   *
   * To turn off a retry that a base class turned on, use `retry = {on: false}`.
   *
   * Notes:
   *
   * - If you `await dispatchAndWait(action)` and the action uses unlimited retries,
   *   it may never finish if it keeps failing. So, be careful when using it.
   *
   * - If the `before` method throws an error, the retry will NOT happen.
   *
   * - The retry delay only starts after the reducer finishes executing. For example, if the
   *   reducer takes 1 second to fail, and the retry delay is 350 millis, the first retry will
   *   happen 1.35 seconds after the first reducer started.
   *
   * - When the action finally fails, the last error will be rethrown, and the previous ones
   *   will be ignored.
   *
   * - For most actions that use `retry`, consider also making them non-Reentrant to avoid
   *   multiple instances of the same action running at the same time:
   *   ```ts
   *   class MyAction extends KissAction<State> {
   *      retry = {on: true}
   *      nonReentrant = true;
   *   }
   *   ```
   *
   * - Retry only works with ASYNC reducers, that return `Promise<(state: St) => St>`.
   *   A SYNC reducer is a pure function of the state, so if it fails once it will fail
   *   again, and retrying it makes no sense. Dispatching an action with retry and a SYNC
   *   reducer fails with a `StoreException`, even if the reducer itself succeeds.
   *
   * - If necessary, you can know the current "attempt number" by using `this.attempts`.
   */
  declare retry?: Retry;

  _retry: RetryOptions = {
    on: false,
    attempts: 0,
    initialDelay: 350,
    multiplier: 2,
    maxRetries: 3,
    maxDelay: 5000,
    unlimitedRetries: false,
    currentDelay: null,
  };

  get ifRetryIsOn(): boolean {
    return (this.retry as RetryOptions)?.on === true;
  }

  /**
   * Returns a promise which will resolve when the given state `condition` is true.
   * If the condition is already true when the method is called, the promise resolves immediately.
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the promise rejects with a `TimeoutException`,
   * and the condition stops being checked. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1):
   *
   * ```ts
   * await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 }); // 1 second.
   * await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 0 }); // No timeout.
   * ```
   *
   * To handle the timeout, you can catch the `TimeoutException`:
   *
   * ```ts
   * try { await this.waitCondition(condition, { timeoutMillis: 5000 }); }
   * catch (error) { if (error instanceof TimeoutException) { ... } else throw error; }
   * ```
   *
   * Or, you can pass an `onTimeout` callback. If the timeout expires, `onTimeout` is called,
   * and the promise resolves with `null` instead of rejecting. If `onTimeout` throws, the
   * promise rejects with that error:
   *
   * ```ts
   * await this.waitCondition(condition, { timeoutMillis: 5000, onTimeout: () => { ... } });
   * ```
   *
   * This method is useful in tests, and it returns the action which changed
   * the store state into the condition, in case you need it:
   *
   * ```typescript
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * ```
   *
   * This method is also eventually useful in production code, but note that while it waits,
   * the condition runs on EVERY state change. A few short-lived waits are fine. But many waits,
   * or waits that may never complete (especially with no timeout), add a cost to every state
   * change, for as long as the store lives, since there is no way to cancel a wait. In
   * production, it's often better to put the logic in an action, or to react to the selected
   * state in your components.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  waitCondition(
    condition: (state: St) => boolean,
    {
      timeoutMillis,
      onTimeout,
    }: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): Promise<KissAction<St> | null> {
    return this.store.waitCondition(condition, {timeoutMillis, onTimeout});
  }

  /**
   * Returns a Promise that resolves when some actions meet the given `condition`.
   *
   * If `completeImmediately` is false (the default), this method will throw an error if the
   * condition was already true when the method was called. Otherwise, the promise will complete
   * immediately and throw no error.
   *
   * The `condition` is a function that takes the set of actions "in progress", as well as an
   * action that just entered the set (by being dispatched) or left the set (by finishing
   * dispatching). The function should return `true` when the condition is met, and `false`
   * otherwise. For example:
   *
   * ```ts
   * let action = await this.waitActionCondition((actionsInProgress, triggerAction) => { ... });
   * ```
   *
   * Important: Your condition function should NOT modify the set of actions.
   *
   * You get back the set of the actions being dispatched that met the condition, as well as
   * the action that triggered the condition by being added or removed from the set.
   *
   * Note: The condition is only checked when some action is dispatched or finishes dispatching.
   * It's not checked every time action statuses change.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   *  ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  async waitActionCondition(
    //
    /// The condition receives the current actions in progress, and the action that triggered the condition.
    condition:
      (
        actions: Set<KissAction<St>>,
        triggerAction: KissAction<St> | null
      ) => boolean,
    {
      // If `completeImmediately` is `false` (the default), this method will throw an error if the
      // condition is already true when the method is called. Otherwise, the promise will complete
      // immediately and throw no error.
      completeImmediately = false,
      //
      // The maximum time to wait for the condition to be met. The default is 3 seconds.
      // To disable the timeout, make it 0 or -1.
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {})
    : Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    return this.store.waitActionCondition(
      condition, {
      completeImmediately: completeImmediately,
      timeoutMillis: timeoutMillis,
      onTimeout: onTimeout,
    });
  }

  /**
   * Returns a promise that resolves when ALL given actions finished dispatching.
   *
   * If `completeImmediately` is false (the default), this method will throw an error if none
   * of the given actions are in progress when the method is called. Otherwise, the promise will
   * complete immediately and throw no error.
   *
   * However, if you don't provide any actions (empty list or `null`), the promise will complete
   * when ALL current actions in progress finish dispatching. In other words, when no actions are
   * currently in progress. In this case, if [completeImmediately] is `false`, the method will
   * throw an error if no actions are in progress when the method is called.
   *
   * Note: Waiting until no actions are in progress should only be done in test, never in
   * production, as it's very easy to create a deadlock. However, waiting for specific actions to
   * finish is safe in production, as long as you're waiting for actions you just dispatched.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   *  ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  waitAllActions(
    actions: KissAction<St>[] | null,
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    return this.store.waitAllActions(
      actions, {
      completeImmediately: completeImmediately,
      timeoutMillis: timeoutMillis,
      onTimeout: onTimeout,
    });
  }

  /**
   * Returns a promise that completes when an action of the given type is NOT in progress
   * (it's not being dispatched):
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is false, this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true (the default), the promise completes immediately, returns `null`,
   *   and throws no error.
   *
   * - If an action of the given type is in progress, the promise completes when the action
   *   finishes, and returns the action. You can use the returned action to check its `status`:
   *
   *   ```ts
   *   let action = await this.waitActionType(MyAction);
   *   expect(action.status.originalError).toBeInstanceOf(UserException);
   *   ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   *  ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  async waitActionType(
    actionType: { new(...args: any[]): KissAction<St> },
    {
      completeImmediately = true,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<KissAction<St> | null> {
    return this.store.waitActionType(
      actionType, {
      completeImmediately: completeImmediately,
      timeoutMillis: timeoutMillis,
      onTimeout: onTimeout,
    });
  }

  /**
   * Returns a promise that completes when ALL actions of the given type are NOT in progress
   * (none of them is being dispatched):
   *
   * - If NO action of the given types is currently in progress when the method is called,
   *   and `completeImmediately` is false, this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true (the default), the promise completes immediately and throws no error.
   *
   * - If any action of the given types is in progress, the promise completes only when
   *   no action of the given types is in progress anymore.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   *  ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  async waitAllActionTypes(
    actionTypes: { new(...args: any[]): KissAction<any> }[],
    {
      completeImmediately = true,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<void> {
    return this.store.waitAllActionTypes(
      actionTypes, {
      completeImmediately: completeImmediately,
      timeoutMillis: timeoutMillis,
      onTimeout: onTimeout,
    });
  }

  /**
   * Returns a promise which will complete when ANY action of the given types FINISHES
   * dispatching. IMPORTANT: This method is different from the other similar methods, because
   * it does NOT complete immediately if no action of the given types is in progress. Instead,
   * it waits until an action of the given types finishes dispatching, even if they
   * were not yet in progress when the method was called.
   *
   * This method returns the action that completed the promise, which you can use to check
   * its `status`.
   *
   * It's useful when the actions you are waiting for are not yet dispatched when you call this
   * method. For example, suppose action `StartAction` starts a process that takes some time
   * to run and then dispatches an action called `MyFinalAction`. You can then write:
   *
   * ```ts
   * this.dispatch(new StartAction());
   * let action = await this.waitAnyActionTypeFinishes([MyFinalAction]);
   * expect(action.status.originalError).toBeInstanceOf(UserException);
   * ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an actions that changes the state, then await for the state change:
   * expect(this.state.name).toBe('John');
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Dispatches actions and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.stocks).toEqual(['IBM', 'TSLA']);
   *
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(this.state.portfolio).toEqual(['TSLA']);
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new SellAction('TSLA'));
   * await this.waitAllActionTypes([BuyAction, SellAction]);
   * expect(this.state.portfolio).toEqual(['IBM']);
   *
   * // Dispatches actions in PARALLEL and wait until no actions are in progress.
   * this.dispatch(new BuyAction('IBM'));
   * this.dispatch(new BuyAction('TSLA'));
   * await this.waitAllActions([]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(true);
   *
   * // Dispatches two actions in PARALLEL and wait for them:
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * this.dispatch(action1);
   * this.dispatch(action2);
   * await this.waitAllActions([action1, action2]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches two actions in SERIES and wait for them:
   * await this.dispatchAndWait(new BuyAction('IBM'));
   * await this.dispatchAndWait(new SellAction('TSLA'));
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   * expect(this.state.portfolio.includes('TSLA')).toBe(false);
   *
   * // Dispatches an action and waits until no action of its type is in progress.
   * this.dispatch(new ChangeNameAction('Bill'));
   * let action = await this.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
   * expect(this.state.name).toBe('Bill');
   *
   * // Wait until some action of the given types is dispatched.
   * this.dispatch(new ProcessStocksAction());
   * let action = await this.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(this.state.portfolio.includes('IBM')).toBe(true);
   *  ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options: { timeoutMillis?: number | null, onTimeout: () => void }
  ): Promise<KissAction<St> | null>;
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options?: { timeoutMillis?: number | null }
  ): Promise<KissAction<St>>;
  async waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    {
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<KissAction<St> | null> {
    return this.store.waitAnyActionTypeFinishes(
      actionTypes, {
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      } as { timeoutMillis?: number | null, onTimeout: () => void });
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    this._store = _store;
    this._initialState = _store.state;

    if (this.retry) {
      this._validateRetry(this.retry);
      this._retry = { ...this._retry, on: true, ...this.retry };
      this.retry = this._retry;
    }
  }

  /**
   * Throws a `StoreException` if some `retry` option has an invalid value.
   * Options that are not set (`undefined`) use their defaults.
   */
  private _validateRetry(retry: Retry) {
    const fail = (option: string, rule: string, value: any) => {
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid retry option: ` +
        `retry.${option} ${rule}, but got ${typeof value === 'string' ? `"${value}"` : String(value)}.`);
    };

    const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);

    const check = (option: keyof Retry, isValid: (v: any) => boolean, rule: string) => {
      const value = retry[option];
      if (value !== undefined && !isValid(value)) fail(option, rule, value);
    };

    check('on', v => typeof v === 'boolean', 'must be a boolean');
    check('unlimitedRetries', v => typeof v === 'boolean', 'must be a boolean');
    check('initialDelay', v => isNumber(v) && v >= 0, 'must be a number >= 0 (milliseconds)');
    check('maxDelay', v => isNumber(v) && v >= 0, 'must be a number >= 0 (milliseconds)');
    check('multiplier', v => isNumber(v) && v >= 1, 'must be a number >= 1 (use 1 for a constant delay)');
    check('maxRetries', v => Number.isInteger(v) && v >= -1, 'must be an integer >= -1 (use -1 for unlimited retries)');
  }

  /**
   * For Kiss internal use only.
   */
  _changeStatus(params: {
    isDispatched?: boolean,
    hasFinishedMethodBefore?: boolean,
    hasFinishedMethodReduce?: boolean,
    hasFinishedMethodAfter?: boolean
    originalError?: any,
    wrappedError?: any,
  } = {}) {
    this._status = this._status.copy(params);
  }

  /**
   * For Kiss internal use only.
   */
  _createPromise(): Promise<ActionStatus> {
    return new Promise<ActionStatus>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  /**
   * For Kiss internal use only.
   */
  _resolvePromise(failure: { error: any } | null = null): void {
    // Settles the promise created by `dispatchAndWait()`. It rejects with the error, if the
    // action failed with an error that was not swallowed. Otherwise, it resolves with the status.
    if (failure !== null) this._reject?.(failure.error);
    else this._resolve?.(this.status);
  }

  /**
   * For Kiss internal use only.
   * Returns true if the action was dispatched with `dispatchAndWait()`.
   */
  _isAwaited(): boolean {
    return this._resolve !== null;
  }

  /**
   * Prints a readable description of the action, for debugging purposes.
   * Example: `MyAction(increment:10)`.
   */
  toString(): string {
    // Initialize an array to hold key-value pairs as strings
    const keyValuePairs: string[] = [];
    for (const key of Object.keys(this)) {
      if (!key.startsWith('_') && (key != 'nonReentrant') && (key != 'retry') && (key != 'checkInternet') && (key != 'wrapReduce')) { // Continue to exclude base class/internal fields
        // For each property, push "key:value" string to the array
        // Note: This simple line assumes that `value` can be meaningfully represented as a string.
        // You might need a more complex handling for objects, arrays, etc.
        const value = (this as any)[key];
        keyValuePairs.push(`${key}:${KissAction._describeValue(value)}`);
      }
    }
    // Join all key-value pairs with a comma and space, and format it according to your requirements
    return `${this.constructor.name}(${keyValuePairs.join(', ').replace(/"/g, '')})`;
  }

  /**
   * Turns a field value into a string for `toString()`. Never throws, so that an action
   * with a circular, BigInt or otherwise unserializable field can still be dispatched.
   */
  private static _describeValue(value: any): string {
    if (typeof value === 'bigint') return `${value}n`;
    try {
      return JSON.stringify(value, (_key, v) => typeof v === 'bigint' ? `${v}n` : v);
    } catch {
      try {
        return String(value);
      } catch {
        return '[object]';
      }
    }
  }
}

/**
 * The `status` is a property of the action, used to keep track of the action's lifecycle.
 * If you have a reference to the action you can check its status at any time with `action.status`:
 *
 * ```ts
 * const action = new MyAction();
 * await store.dispatchAndWait(action);
 * if (action.status.isCompletedOk) { ... }
 * ```
 *
 * However, `dispatchAndWait` also returns the action status after it finishes:
 *
 * ```ts
 * const status = await store.dispatchAndWait(new MyAction());
 * if (status.isCompletedOk) { ... }
 * ```
 */
export class ActionStatus {

  /**
   * Returns true if the action was already dispatched. An action cannot be dispatched
   * more than once, which means that you have to create a new action each time.
   *
   * Note this may be true even if the action has not yet FINISHED dispatching.
   * To check if it has finished, use `action.status.isCompleted`.
   */
  readonly isDispatched: boolean;

  /**
   * Is true when the `before` method finished executing normally.
   * Is false if it has not yet finished executing or if it threw an error.
   */
  readonly hasFinishedMethodBefore: boolean;

  /**
   * Is true when the `reduce` method finished executing normally, returning a value.
   * Is false if it has not yet finished executing or if it threw an error.
   */
  readonly hasFinishedMethodReduce: boolean;

  /**
   * Is true if the `after` method finished executing. Note the `after` method should
   * never throw any errors, but if it does the error will be swallowed and ignored.
   * Is false if it has not yet finished executing.
   */
  readonly hasFinishedMethodAfter: boolean;

  /**
   * Holds the error thrown by the action's before/reduce methods, if any.
   * This may or may not be equal to the error thrown by the action, because the original error
   * will still be processed by the action's `wrapError` and the `globalWrapError`. However,
   * if `originalError` is non-null, it means the reducer did not finish running.
   */
  readonly originalError: any;

  /**
   * Holds the error thrown by the action. This may or may not be the same as `originalError`,
   * because any errors thrown by the action's before/reduce methods may still be changed or
   * cancelled by the action's `wrapError` and the `globalWrapError`. This is the final error
   * after all these wraps.
   */
  readonly wrappedError: any;

  /**
   * Returns true only if the action has completed executing, either with or without errors.
   * If this is true, the 'after' method already ran.
   */
  get isCompleted(): boolean {
    return this.hasFinishedMethodAfter;
  }

  /**
   * Returns true only if the action has completed, and none of the 'before' or 'reduce'
   * methods have thrown an error. This indicates that the 'reduce' method completed and
   * returned a result (even if the result was null). The 'after' method also already ran.
   *
   * This can be useful if you need to dispatch a second method only if the first method
   * succeeded:
   *
   * ```ts
   * let action = new LoadInfo();
   * await dispatchAndWait(action);
   * if (action.status.isCompletedOk) dispatch(new ShowInfo());
   * ```
   *
   * Or you can also get the state directly from `dispatchAndWait`:
   *
   * ```ts
   * let status = await dispatchAndWait(new LoadInfo());
   * if (status.isCompletedOk) dispatch(new ShowInfo());
   * ```
   */
  get isCompletedOk(): boolean {
    return this.isCompleted && (this.originalError === null);
  }

  /**
   * Returns true only if the action has completed (the 'after' method already ran), but either
   * the 'before' or the 'reduce' methods have thrown an error. If this is true, it indicates that
   * the reducer could NOT complete, and could not return a value to change the state.
   */
  get isCompletedFailed(): boolean {
    return this.isCompleted && (this.originalError != null);
  }

  constructor(params: {
    isDispatched?: boolean,
    hasFinishedMethodBefore?: boolean,
    hasFinishedMethodReduce?: boolean,
    hasFinishedMethodAfter?: boolean,
    originalError?: any,
    wrappedError?: any,
  } = {}) {
    this.isDispatched = params.isDispatched ?? false;
    this.hasFinishedMethodBefore = params.hasFinishedMethodBefore ?? false;
    this.hasFinishedMethodReduce = params.hasFinishedMethodReduce ?? false;
    this.hasFinishedMethodAfter = params.hasFinishedMethodAfter ?? false;
    this.originalError = params.originalError ?? null;
    this.wrappedError = params.wrappedError ?? null;
  }

  copy(params: {
    isDispatched?: boolean,
    hasFinishedMethodBefore?: boolean,
    hasFinishedMethodReduce?: boolean,
    hasFinishedMethodAfter?: boolean
    originalError?: any,
    wrappedError?: any,
  }) {
    return new ActionStatus({
      isDispatched: params.isDispatched ?? this.isDispatched,
      hasFinishedMethodBefore: params.hasFinishedMethodBefore ?? this.hasFinishedMethodBefore,
      hasFinishedMethodReduce: params.hasFinishedMethodReduce ?? this.hasFinishedMethodReduce,
      hasFinishedMethodAfter: params.hasFinishedMethodAfter ?? this.hasFinishedMethodAfter,
      originalError: params.originalError ?? this.originalError,
      wrappedError: params.wrappedError ?? this.wrappedError,
    });
  }
}

/**
 * The `OptimisticUpdate` abstract class is designed to facilitate optimistic updates in your application.
 * This pattern can significantly enhance the user experience by immediately reflecting changes in the UI
 * before confirming those changes on the backend. It is particularly useful in scenarios where
 * you're dealing with asynchronous updates, such as saving or updating data on a remote server.
 *
 * This class provides a structured way to implement optimistic updates by defining a series of abstract
 * methods that you'll need to override in your subclasses. These methods include:
 *
 * - `newValue()`: Define the new value that you intend to add or update in your application state.
 * - `getValueFromState(state)`: Extract and return the current value from the given state.
 * - `applyState(value, state)`: Apply the given value to the specified state and return the updated state.
 * - `saveValue(newValue)`: Handle the saving of the new value to your backend or cloud service.
 * - `reloadValue()`: Optionally, reload the value from the backend to ensure the UI is in sync with the latest data.
 *
 * By implementing these methods, `OptimisticUpdate` helps manage the optimistic update process,
 * including rolling back changes if necessary. This approach allows for a smoother and more responsive
 * user interface, even when operations may fail or require more time to complete.
 *
 * ---
 *
 * The `OptimisticUpdate` abstract class is still EXPERIMENTAL. You can use it, but test it well.
 *
 * Let's use this example: We want to save a new TodoItem to a TodoList.
 *
 * This code saves the TodoItem, then reloads the TodoList from the cloud:
 *
 * ```typescript
 * class SaveTodo extends KissAction<AppState> {
 *    newTodo: TodoItem;
 *    constructor(newTodo: TodoItem) {
 *        super();
 *        this.newTodo = newTodo;
 *    }
 *
 *    async reduce() {
 *
 *       try {
 *          // Saves the new TodoItem to the cloud.
 *          await saveTodoItem(this.newTodo);
 *       } finally {
 *          // Loads the complete TodoList from the cloud.
 *          let reloadedTodoList = await loadTodoList();
 *          return (state: AppState) => state.copy({ todoList: reloadedTodoList });
 *       }
 *    }
 * }
 * ```
 *
 * The problem with the above code is that it may take a second to update the TodoList on
 * the screen, while we save then load, which is not a good user experience.
 *
 * The solution is optimistically updating the TodoList before saving the new TodoItem to the cloud:
 *
 * ```typescript
 * class SaveTodo extends KissAction<AppState> {
 *    newTodo: TodoItem;
 *    constructor(newTodo: TodoItem) {
 *        super();
 *        this.newTodo = newTodo;
 *    }
 *
 *    async reduce() {
 *
 *       // Updates the TodoList optimistically.
 *       this.dispatch(new UpdateStateAction((state: AppState) => state.copy({ todoList: state.todoList.add(this.newTodo) })));
 *
 *       try {
 *          // Saves the new TodoItem to the cloud.
 *          await saveTodoItem(this.newTodo);
 *       } finally {
 *          // Loads the complete TodoList from the cloud.
 *          let reloadedTodoList = await loadTodoList();
 *          this.dispatch(new UpdateStateAction((state: AppState) => state.copy({ todoList: reloadedTodoList })));
 *       }
 *    }
 * }
 * ```
 *
 * That's better. But if the saving fails, the users still have to wait for the reload until
 * they see the reverted state. We can further improve this:
 *
 * ```typescript
 * class SaveTodo extends KissAction<AppState> {
 *    newTodo: TodoItem;
 *    constructor(newTodo: TodoItem) {
 *        super();
 *        this.newTodo = newTodo;
 *    }
 *
 *    async reduce() {
 *
 *       // Updates the TodoList optimistically.
 *       let newTodoList = this.state.todoList.add(this.newTodo);
 *       this.dispatch(new UpdateStateAction((state: AppState) => state.copy({ todoList: newTodoList })));
 *
 *       try {
 *          // Saves the new TodoItem to the cloud.
 *          await saveTodoItem(this.newTodo);
 *       } catch (e) {
 *          // If the state still contains our optimistic update, we roll back.
 *          // If the state now contains something else, we DO NOT roll back.
 *          if (this.state.todoList === newTodoList) {
 *             return (state: AppState) => state.copy({ todoList: this.initialState.todoList }); // Rollback.
 *          }
 *       } finally {
 *          // Loads the complete TodoList from the cloud.
 *          let reloadedTodoList = await loadTodoList();
 *          this.dispatch(new UpdateStateAction((state: AppState) => state.copy({ todoList: reloadedTodoList })));
 *       }
 *    }
 * }
 * ```
 *
 * Now the user sees the rollback immediately after the saving fails.
 *
 * Note: If you are using a realtime database or WebSockets to receive real-time updates from the
 * server, you may not need the finally block above, as long as the `newTodoList` above can be
 * told apart from the current `state.todoList`. This can be a problem if the state in question
 * is a primitive (boolean, number, etc.) or string.
 *
 * The `OptimisticUpdate` abstract class helps you implement the above code for you when you
 * provide the following:
 *
 * * `newValue()`: Is the new value, that you want to see saved and applied to the state.
 * * `getValueFromState(state: St)`: Is a function that extracts the value from the given state.
 * * `reloadValue()`: Is a function that reloads the value from the cloud.
 * * `applyState(value: any, state: St)`: Is a function that applies the given value to the given state.
 */

export abstract class OptimisticUpdate<St> extends KissAction<St> {

  /**
   * You should return here the value that you want to update. For example, if you want to add
   * a new TodoItem to the todoList, you should return the new todoList with the new TodoItem added.
   *
   * You can access the fields of the action, and the state, and return the new value.
   */
  abstract newValue(): any;

  /**
   * Using the given `state`, you should return the `value` from that state.
   */
  abstract getValueFromState(state: St): any;

  /**
   * Using the given `state`, you should apply the given `value` to it, and return the result.
   */
  abstract applyState(value: any, state: St): St;

  /**
   * You should save the `value` or other related value in the cloud.
   */
  abstract saveValue(newValue: any): Promise<void>;

  /**
   * You should reload the `value` from the cloud.
   * If you want to skip this step, simply don't provide this method.
   *
   * If the save fails, the rollback is applied before the reload, so the reloaded value wins.
   * If the reload throws, the action fails with that error (unless the save also failed,
   * in which case the action fails with the save error).
   */
  reloadValue?(): Promise<any>;

  async reduce() {
    // Updates the value optimistically.
    const _newValue = this.newValue();
    const action = new UpdateStateAction((state: St) => this.applyState(_newValue, state));
    this.dispatch(action);

    let saveError: unknown = undefined;
    let saveFailed = false;

    try {
      // Saves the new value to the cloud.
      await this.saveValue(_newValue);
    } catch (e) {
      saveFailed = true;
      saveError = e;

      // If the state still contains our optimistic update, we roll back.
      // If the state now contains something else, we DO NOT roll back.
      // The rollback is dispatched right away, so that it comes before the reload.
      if (this.getValueFromState(this.state) === _newValue) {
        const initialValue = this.getValueFromState(this.initialState);
        this.dispatch(new UpdateStateAction((state: St) => this.applyState(initialValue, state)));
      }
    }

    // Loads the value from the cloud, if `reloadValue` was provided.
    if (this.reloadValue !== undefined) {
      try {
        const reloadedValue = await this.reloadValue();
        this.dispatch(new UpdateStateAction((state: St) => this.applyState(reloadedValue, state)));
      } catch (reloadError) {
        // If both fail, the save error is the one that matters.
        if (!saveFailed) throw reloadError;
      }
    }

    // Rethrow, so that the action fails, and the user can be notified.
    if (saveFailed) throw saveError;

    return null;
  }
}

/**
 * The `UpdateStateAction` replaces all the store state, synchronously,
 * using the given `stateUpdateFunction`.
 *
 * By default, `ifPersists` is true, which means the persistor may persist
 * the state change.
 *
 * However, if `ifPersists` is false, the persistor will ignore this state change,
 * and won't persist the state change. This is useful when you read some state from
 * the local persistence (the device disk) and you don't want to persist it again.
 */
export class UpdateStateAction<St> extends KissAction<St> {

  constructor(
    readonly updateFunction: (state: St) => (St | null),
    readonly ifPersists: boolean = true,
  ) {
    super();
  }

  reduce(): St | null {
    return this.updateFunction(this.state);
  }

  toString(): string {
    return `${this.constructor.name}(state)`;
  }
}

export type Retry = {
  on?: boolean,
  initialDelay?: number,
  multiplier?: number,
  maxRetries?: number,
  maxDelay?: number,
  unlimitedRetries?: boolean
};

export type RetryOptions = {
  on: boolean,
  attempts: number,
  currentDelay: number | null,
  initialDelay: number,
  multiplier: number,
  maxRetries: number,
  maxDelay: number,
  unlimitedRetries: boolean
};

/** The `UserException` is a special type of error that Kiss automatically
 * catches and shows to the user in a dialog, or other UI of your choice.
 *
 * For this to work, you must throw the `UserException` from inside an action's
 * `before()` or `reduce()` functions. Only then, Kiss will be able to
 * catch the exception and show it to the user.
 *
 * However, if you are **not** inside an action, but you still want to show an
 * error dialog to the user, you may use the provided `UserExceptionAction`.
 *
 * ```ts
 * dispatch(new UserExceptionAction('Please enter a valid number'));
 * ```
 *
 * This action simply throws a corresponding `UserException` from its
 * own `reduce()` function.
 *
 * The `UserExceptionAction` is also useful inside of actions themselves,
 * if you want to display an error dialog to the user, but you don't want
 * to interrupt the action by throwing an exception.
 *
 * For example, here an invalid number will show an error dialog to the user,
 * but the action will continue running and set the counter state to `0`:
 *
 * ```ts
 * class ConvertAction extends Action {
 *   constructor(private text: string) { super(); }
 *
 *   reduce() {
 *     let value = parseInt(this.text);
 *
 *     if (isNaN(value)) {
 *       this.dispatch(new UserExceptionAction('Please enter a valid number'));
 *       value = 0;
 *     }
 *
 *     return { counter: value };
 *   }
 * }
 * ```
 */
export class UserExceptionAction<St> extends KissAction<St> {
  constructor(readonly message: string) {
    super();
  }

  reduce(): null {
    throw new UserException(this.message);
  }
}
