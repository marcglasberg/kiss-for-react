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
   *
   * Inside `abortDispatch()`, you can read `this.state`, `this.store` and `this.initialState`.
   * For example, to only run the action when there are no items loaded:
   *
   * ```ts
   * abortDispatch() { return this.state.items.length > 0; }
   * ```
   *
   * Note: If `abortDispatch()` throws an error, the error is logged and the action is aborted.
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
   * Set `nonReentrant` to `true` to abort the action in case the action is still running
   * from a previous dispatch. For example:
   *
   * ```ts
   * class SaveAction extends KissAction<State> {
   *   nonReentrant = true;
   *
   *   async reduce() {
   *     await fetch('https://myapi.com/save', { method: 'PUT', body: 'data' });
   *     return null;
   *   }
   * }
   * ```
   *
   * The aborted action is ignored silently, as if it had never been dispatched.
   *
   * ## Advanced usage
   *
   * The non-reentrant check is, by default, based on the action class. This means it will
   * abort an action if another action of the same class is currently running. Note subclasses
   * are different classes, so they don't block each other. If you want to check based on more
   * than simply the class, you can override the `nonReentrantKeyParams()` method. For example,
   * here we use a field of the action to differentiate:
   *
   * ```ts
   * class SaveItem extends KissAction<State> {
   *   nonReentrant = true;
   *   constructor(readonly itemId: string) { super(); }
   *   nonReentrantKeyParams() { return this.itemId; }
   *   ...
   * }
   * ```
   *
   * With this setup, `SaveItem('A')` and `SaveItem('B')` can run in parallel,
   * but two `SaveItem('A')` cannot.
   *
   * You can also override `computeNonReentrantKey()` if you want different action classes
   * to share the same non-reentrant key. Check the documentation of that method for more
   * information.
   *
   * The key is released when the action finishes, with or without errors.
   *
   * Notes:
   * - It can be combined with `retry` and `checkInternet`. With `retry`, the key is only
   *   released after the last attempt.
   * - If `abortDispatch()` returns `true`, the action is aborted before the non-reentrant
   *   check, and doesn't take the key.
   * - It should not be used in an `OptimisticCommand`, which is already non-reentrant.
   *   Dispatching it with `nonReentrant` throws a `StoreException`.
   */
  nonReentrant: boolean = false;

  /**
   * By default, the non-reentrant key is based on the action class.
   * Override `nonReentrantKeyParams()` so that actions of the SAME CLASS but with different
   * parameters don't block each other. For example:
   *
   * ```ts
   * class SaveItem extends KissAction<State> {
   *   nonReentrant = true;
   *   constructor(readonly itemId: string) { super(); }
   *   nonReentrantKeyParams() { return this.itemId; }
   *   ...
   * }
   * ```
   *
   * Now `SaveItem('A')` and `SaveItem('B')` can run in parallel, but two concurrent dispatches
   * of `SaveItem('A')` will not both run.
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[1, 'A']` and `{ id: 1 }` are valid params.
   *
   * This is used by `nonReentrant` actions, and by `OptimisticCommand`.
   */
  nonReentrantKeyParams(): any {
    return null;
  }

  /**
   * By default, the non-reentrant key combines the action class with `nonReentrantKeyParams()`.
   * Override this method if you want different action classes to share the same key:
   *
   * ```ts
   * class SaveUser extends KissAction<State> {
   *   nonReentrant = true;
   *   constructor(readonly userId: string) { super(); }
   *   computeNonReentrantKey() { return this.userId; }
   *   ...
   * }
   *
   * class DeleteUser extends KissAction<State> {
   *   nonReentrant = true;
   *   constructor(readonly userId: string) { super(); }
   *   computeNonReentrantKey() { return this.userId; }
   *   ...
   * }
   * ```
   *
   * With this setup, `SaveUser('123')` and `DeleteUser('123')` can't run at the same time,
   * because they share the same key.
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   *
   * This is used by `nonReentrant` actions, and by `OptimisticCommand`. They share the same
   * keys, so a `nonReentrant` action and an `OptimisticCommand` with the same key can't run
   * at the same time either.
   */
  computeNonReentrantKey(): any {
    return [this.constructor, this.nonReentrantKeyParams()];
  }

  /**
   * For Kiss internal use only.
   * The non-reentrant key of this action, saved by the store when the action is dispatched.
   */
  _nonReentrantKey: any = undefined;

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
   * For Kiss internal use only.
   * Start with the `initialDelay`, and then increase it by `multiplier` each time this is called.
   * If the delay exceeds `maxDelay`, it will be set to `maxDelay`.
   */
  _nextRetryDelay(): number {
    const retry = this._retry;

    retry.currentDelay = (retry.currentDelay == null)
      ? retry.initialDelay
      : retry.currentDelay * retry.multiplier;

    if (retry.currentDelay > retry.maxDelay) retry.currentDelay = retry.maxDelay;

    return retry.currentDelay;
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
   * Sets the store and the initial state, so that the action can access them, even in
   * `abortDispatch()`, which runs before `_injectStore`.
   */
  _setStore(_store: Store<St>) {
    this._store = _store;
    this._initialState = _store.state;
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    this._setStore(_store);

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
 * The `OptimisticCommand` abstract class is for actions that represent a command.
 * A command is something you want to run on the server once per dispatch.
 * Typical examples are:
 *
 * - Create something (add todo, create comment, send message)
 * - Delete something
 * - Submit a form
 * - Upload a file
 * - Checkout, place order, confirm payment
 *
 * It gives fast UI feedback by applying an optimistic state change immediately, then running
 * the command on the server, and optionally rolling back and reloading.
 *
 * Note: It's not built for save operations where only the final value matters, and users may
 * tap many times quickly (like/follow toggles, settings switches, sliders, checkboxes). For
 * those, each tap would be a separate server call.
 *
 * ## The problem
 *
 * Let's use a Todo app as an example. We want to save a new Todo to a TodoList.
 * This code saves the Todo, then reloads the TodoList from the cloud:
 *
 * ```ts
 * class SaveTodo extends Action {
 *   constructor(readonly newTodo: Todo) { super(); }
 *
 *   async reduce() {
 *     try {
 *       // Saves the new Todo to the cloud.
 *       await saveTodo(this.newTodo);
 *     } finally {
 *       // Loads the complete TodoList from the cloud.
 *       let reloadedTodoList = await loadTodoList();
 *       return (state: State) => state.copy({ todoList: reloadedTodoList });
 *     }
 *   }
 * }
 * ```
 *
 * The problem with the above code is that it may take a second to update the TodoList on
 * screen, while we save then load.
 *
 * The solution is to optimistically update the TodoList before saving:
 *
 * ```ts
 * class SaveTodo extends Action {
 *   constructor(readonly newTodo: Todo) { super(); }
 *
 *   async reduce() {
 *     // Updates the TodoList optimistically.
 *     this.dispatch(new UpdateStateAction((state: State) =>
 *       state.copy({ todoList: state.todoList.add(this.newTodo) })));
 *
 *     try {
 *       // Saves the new Todo to the cloud.
 *       await saveTodo(this.newTodo);
 *     } finally {
 *       // Loads the complete TodoList from the cloud.
 *       let reloadedTodoList = await loadTodoList();
 *       return (state: State) => state.copy({ todoList: reloadedTodoList });
 *     }
 *   }
 * }
 * ```
 *
 * That's better. But if saving fails, users still have to wait for the reload until they see
 * the reverted state. We can further improve this:
 *
 * ```ts
 * class SaveTodo extends Action {
 *   constructor(readonly newTodo: Todo) { super(); }
 *
 *   async reduce() {
 *     // Updates the TodoList optimistically.
 *     let newTodoList = this.state.todoList.add(this.newTodo);
 *     this.dispatch(new UpdateStateAction((state: State) => state.copy({ todoList: newTodoList })));
 *
 *     try {
 *       // Saves the new Todo to the cloud.
 *       await saveTodo(this.newTodo);
 *     } catch (error) {
 *       // If the state still contains our optimistic update, we roll back.
 *       // If the state now contains something else, we do not roll back.
 *       if (this.state.todoList === newTodoList) {
 *         let initialTodoList = this.initialState.todoList;
 *         this.dispatch(new UpdateStateAction((state: State) => state.copy({ todoList: initialTodoList })));
 *       }
 *       throw error;
 *     } finally {
 *       // Loads the complete TodoList from the cloud.
 *       let reloadedTodoList = await loadTodoList();
 *       this.dispatch(new UpdateStateAction((state: State) => state.copy({ todoList: reloadedTodoList })));
 *     }
 *     return null;
 *   }
 * }
 * ```
 *
 * Now the user sees the rollback immediately after the saving fails. The `OptimisticCommand`
 * class helps you implement this pattern easily, and takes care of the edge cases.
 *
 * ## How to use it
 *
 * Extend `OptimisticCommand` instead of your base action, and DO NOT implement `reduce()`.
 * Instead, you must provide:
 *
 * - `optimisticValue()` returns the optimistic value you want to apply right away.
 * - `getValueFromState(state)` extracts the current value from a given state.
 * - `applyValueToState(state, value)` applies a value to a given state and returns the new state.
 * - `sendCommandToServer(optimisticValue)` runs the server command (it may use the action fields).
 *
 * And optionally:
 *
 * - `applyServerResponseToState(state, serverResponse)` applies the server response to the state.
 * - `reloadFromServer()` reloads from the server (do not implement it to skip reloading).
 * - `applyReloadResultToState(state, reloadResult)` applies the reload result to the state
 *   (the default uses `applyValueToState`).
 * - `rollbackState`, `shouldRollback`, `shouldReload` and `shouldApplyReload`, to customize
 *   when and how the rollback and the reload happen.
 *
 * Important details:
 *
 * - The optimistic update is applied immediately.
 *
 * - If `sendCommandToServer` fails, the rollback happens only if the current state still
 *   matches the optimistic value created by this dispatch. The rollback restores the value
 *   from `initialState`. Then the action fails with the error of `sendCommandToServer`.
 *
 * - The reload is optional. If implemented, it runs after `sendCommandToServer` finishes,
 *   only in case of error (this can be changed by overriding `shouldReload`).
 *
 * Complete example:
 *
 * ```ts
 * class SaveTodo extends OptimisticCommand<State, Todo | undefined> {
 *   constructor(readonly newTodo: Todo) { super(); }
 *
 *   // The new Todo is going to be optimistically applied to the state, right away.
 *   optimisticValue() { return this.newTodo; }
 *
 *   // We teach the action how to read the Todo from the state.
 *   getValueFromState(state: State) { return state.todoList.getById(this.newTodo.id); }
 *
 *   // Apply the value to the state.
 *   applyValueToState(state: State, todo: Todo | undefined) {
 *     return state.copy({ todoList: (todo === undefined)
 *       ? state.todoList.removeById(this.newTodo.id)
 *       : state.todoList.add(todo) });
 *   }
 *
 *   // Contact the server to send the command (save the Todo).
 *   async sendCommandToServer(newTodo: Todo) { return await saveTodo(newTodo); }
 *
 *   // If the server returns a value, we may apply it to the state.
 *   applyServerResponseToState(state: State, todo: Todo) {
 *     return state.copy({ todoList: state.todoList.add(todo) });
 *   }
 *
 *   // Reload from the cloud (in case of error).
 *   async reloadFromServer() { return await loadTodo(this.newTodo.id); }
 * }
 * ```
 *
 * ## Non-reentrant
 *
 * `OptimisticCommand` is always non-reentrant. If the same action is dispatched while a
 * previous dispatch is still running, the new dispatch is aborted. This prevents race
 * conditions such as:
 *
 * - Conflicting optimistic updates overwriting each other.
 * - Incorrect rollback behavior (the rollback check may no longer match).
 * - Race conditions in the reload phase.
 * - Server side conflicts from concurrent requests.
 *
 * Your UI should let the user know that the command is in progress, so they don't try to
 * dispatch it again until it finishes. That's easy to do, just check if the action is in
 * progress with `useIsWaiting(SaveTodo)`.
 *
 * By default, the non-reentrant check is based on the action class. If your action has
 * parameters and you want to allow concurrent dispatches for different parameters (for
 * example, saving different items), override `nonReentrantKeyParams()`. For example:
 *
 * ```ts
 * class SaveTodo extends OptimisticCommand<State> {
 *   constructor(readonly todoId: string) { super(); }
 *   nonReentrantKeyParams() { return this.todoId; }
 *   ...
 * }
 * ```
 *
 * This allows `SaveTodo('A')` and `SaveTodo('B')` to run concurrently, while blocking
 * concurrent dispatches of `SaveTodo('A')` with itself. This is useful for commands you
 * **do** want to run in parallel, as long as they are for different items. Common examples
 * are uploading multiple files at the same time (key by fileId), or sending multiple chat
 * messages at the same time (key by clientMessageId).
 *
 * You can also override `computeNonReentrantKey()` if you want different action classes to
 * share the same non-reentrant key. These keys are shared with `nonReentrant` actions, so a
 * `nonReentrant` action and an `OptimisticCommand` with the same key can't run at the same time.
 *
 * ## Retry
 *
 * When combined with `retry`, only the `sendCommandToServer` call is retried, not the
 * optimistic update or rollback. This prevents UI flickering that would otherwise occur if the
 * entire reducer was retried on each attempt. The optimistic state remains in place during
 * retries, and the rollback only happens if all retry attempts fail.
 *
 * ## CheckInternet
 *
 * When combined with `checkInternet`, if there is no internet: no optimistic state is
 * applied, no server call is attempted, and the action fails (showing a dialog, if
 * `checkInternet` is `{ dialog: true }`).
 *
 * Notes:
 *
 * - The default rollback check compares values with `Object.is` (which is the same as `===`,
 *   except that `NaN` is equal to `NaN`). So, make sure `getValueFromState` returns the same
 *   object you applied, or override `shouldRollback`.
 * - It can be combined with `retry` and `checkInternet`.
 * - It should not be combined with `nonReentrant` (it's already non-reentrant), nor with
 *   unlimited retries (a command that never finishes would never release its non-reentrant
 *   key). Dispatching it with those throws a `StoreException`.
 */
export abstract class OptimisticCommand<St, T = any> extends KissAction<St> {

  /**
   * Return the value you want to apply optimistically to the state.
   *
   * You can access the fields of the action, and the current `state`, and return the new value.
   *
   * ```ts
   * optimisticValue() { return this.newTodo; }
   * ```
   */
  abstract optimisticValue(): T;

  /**
   * Using the given `state`, you should apply the given `value` to it, and return the result.
   * This is used to apply the optimistic value to the state, and also later to roll back,
   * if necessary, by applying the initial value.
   *
   * ```ts
   * applyValueToState(state: State, todoList: TodoList) { return state.copy({ todoList }); }
   * ```
   */
  abstract applyValueToState(state: St, value: T): St;

  /**
   * Using the given `state`, you should return the current value from that state. This is used
   * to check if the state still contains the optimistic value, so it's safe to roll back.
   *
   * ```ts
   * getValueFromState(state: State) { return state.todoList; }
   * ```
   */
  abstract getValueFromState(state: St): T;

  /**
   * You should save the `optimisticValue` or other related value in the cloud, and optionally
   * return the server's response.
   *
   * Note: You can ignore `optimisticValue` and use the action fields instead, if that makes
   * more sense for your API.
   *
   * If `sendCommandToServer` returns a value that is not `null` or `undefined`, that value
   * will be passed to `applyServerResponseToState` to update the state.
   *
   * ```ts
   * async sendCommandToServer(newTodo: Todo) {
   *   let response = await saveTodo(newTodo);
   *   return response; // Return the server-confirmed value, or null.
   * }
   * ```
   */
  abstract sendCommandToServer(optimisticValue: T): Promise<any>;

  /**
   * Override `applyServerResponseToState` to return a new state, where the given
   * `serverResponse` (previously received from the server when running `sendCommandToServer`)
   * is applied to the current `state`. Example:
   *
   * ```ts
   * applyServerResponseToState(state: State, serverResponse: Response) {
   *   return state.copy({ todoList: serverResponse.todoList });
   * }
   * ```
   *
   * Note `serverResponse` is never `null` or `undefined` here, because this method is only
   * called when `sendCommandToServer` returned some value.
   *
   * If you DO NOT want to apply the server response to the state, return `null`
   * (which is the default).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  applyServerResponseToState(state: St, serverResponse: any): St | null {
    return null;
  }

  /**
   * Implement this method to reload the value from the cloud.
   * If you want to skip the reload, do not implement this method.
   *
   * Note: If you are using a realtime database or WebSockets to receive server pushed
   * updates, you may not need to reload here.
   *
   * ```ts
   * reloadFromServer() { return loadTodoList(); }
   * ```
   */
  reloadFromServer?(): Promise<any>;

  /**
   * Returns the state to apply when the command fails and it's safe to roll back.
   *
   * This method is called only when `sendCommandToServer` throws, AND `shouldRollback` returns
   * true. By default, `shouldRollback` returns true only if the current value in the store still
   * matches the optimistic value created by this dispatch (so we don't roll back over newer
   * changes).
   *
   * Parameters:
   *
   * - `initialValue` is the value extracted from `initialState` using `getValueFromState`.
   *   It's what the value was when this action was dispatched.
   *
   * - `optimisticValue` is the value returned by `optimisticValue()` and applied
   *   optimistically by this dispatch.
   *
   * - `error` is the error thrown by `sendCommandToServer`.
   *
   * By default, it restores `initialValue` by calling `applyValueToState`.
   *
   * Override this method if rollback is not simply "put the old value back".
   * For example, you may want to:
   * - Keep the optimistic item but mark it as failed.
   * - Remove only the item you added, while keeping other local changes.
   * - Roll back multiple parts of the state, not just the value handled by `applyValueToState`.
   *
   * Return `null` to skip the rollback.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  rollbackState({ initialValue, optimisticValue, error }: {
    initialValue: T,
    optimisticValue: T,
    error: any,
  }): St | null {
    return this.applyValueToState(this.state, initialValue);
  }

  /**
   * Returns true if it should roll back after `sendCommandToServer` fails. This method is
   * called only when `sendCommandToServer` throws.
   *
   * The default is to roll back only if the current value in the store still matches the
   * optimistic value created by this dispatch (compared with `Object.is`). This avoids
   * rolling back over newer changes that may have happened while the request was in flight.
   *
   * Override this if you need a different safety rule. For example:
   * - You want to always roll back, even if something else changed.
   * - You want to roll back only if a specific item is still present.
   * - You want to roll back only for some errors.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  shouldRollback({ currentValue, initialValue, optimisticValue, error }: {
    currentValue: T,
    initialValue: T,
    optimisticValue: T,
    error: any,
  }): boolean {
    // Default: roll back only if we are still seeing our own optimistic value.
    return Object.is(currentValue, optimisticValue);
  }

  /**
   * Whether it should call `reloadFromServer()`. Only called if `reloadFromServer` is
   * implemented. It's called after `sendCommandToServer` finishes, both on success and on error.
   *
   * Parameters:
   *
   * - `currentValue` is the value currently in the store (extracted with `getValueFromState`)
   *   at the moment we are deciding whether to reload.
   *
   * - `lastAppliedValue` is the last value this action applied for the same state slice.
   *   It is the optimistic value, or the value from the server response if it was applied,
   *   or the rollback value if the rollback was applied.
   *
   * - `optimisticValue` is the value returned by `optimisticValue()` and applied
   *   optimistically by this dispatch.
   *
   * - `rollbackValue` is `undefined` if no rollback state was applied. If the rollback was
   *   applied, this is the value extracted from the rollback state using `getValueFromState`.
   *
   * - `error` is `null` on success, or the error thrown by `sendCommandToServer` on failure.
   *
   * The default is to reload only on error.
   *
   * Override this method to reload in other cases. For example, to also reload on success,
   * or to skip the reload when the value already changed to something else:
   *
   * ```ts
   * shouldReload({ currentValue, lastAppliedValue }) { return currentValue === lastAppliedValue; }
   * ```
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  shouldReload({ currentValue, lastAppliedValue, optimisticValue, rollbackValue, error }: {
    currentValue: T,
    lastAppliedValue: T,
    optimisticValue: T,
    rollbackValue: T | undefined,
    error: any,
  }): boolean {
    return error !== null;
  }

  /**
   * Returns true if it should apply the result returned by `reloadFromServer` to the state.
   *
   * This method is called after `reloadFromServer` completes, both when the command
   * succeeded and when it failed.
   *
   * Parameters are the same as `shouldReload`, plus `reloadResult`, which is whatever
   * `reloadFromServer` returned. Note `currentValue` is read again after the reload finishes,
   * because the state may have changed while reloading.
   *
   * The default is to always apply the reload result. This matches the common expectation
   * that if you chose to reload, the server is the source of truth.
   *
   * Override this method if you want to avoid overwriting newer local changes, or if you need
   * custom rules based on `reloadResult` or `error`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  shouldApplyReload({ currentValue, lastAppliedValue, optimisticValue, rollbackValue, reloadResult, error }: {
    currentValue: T,
    lastAppliedValue: T,
    optimisticValue: T,
    rollbackValue: T | undefined,
    reloadResult: any,
    error: any,
  }): boolean {
    return true;
  }

  /**
   * Applies the result returned by `reloadFromServer` to the state.
   *
   * Override this method when `reloadFromServer` returns something that is not the same type
   * or shape expected by `applyValueToState`, or when applying the reload requires updating
   * multiple parts of the state.
   *
   * Return `null` to ignore the reload result.
   */
  applyReloadResultToState(state: St, reloadResult: any): St | null {
    return this.applyValueToState(state, reloadResult as T);
  }

  /**
   * Do NOT override this method. Implement `optimisticValue`, `getValueFromState`,
   * `applyValueToState` and `sendCommandToServer` instead.
   */
  async reduce(): Promise<null> {
    // Updates the value optimistically.
    const optimistic = this.optimisticValue();
    this._applyState(this.applyValueToState(this.state, optimistic));

    let commandFailed = false;
    let commandError: any = null;
    let lastAppliedValue: T = optimistic; // What this action last wrote.
    let rollbackValue: T | undefined = undefined; // Value slice after the rollback, if any.

    try {
      // Sends the command to the server.
      // If retry is on, only this call is retried, keeping the optimistic state in place.
      const serverResponse = await this._sendCommandWithRetryIfNeeded(optimistic);

      // Applies the server response, if any.
      if (serverResponse !== null && serverResponse !== undefined) {
        const newState = this.applyServerResponseToState(this.state, serverResponse);
        if (newState !== null) {
          this._applyState(newState);
          lastAppliedValue = this.getValueFromState(newState);
        }
      }
    } catch (error) {
      commandFailed = true;
      commandError = error;

      // Decides if it's safe to roll back (default: only if we are still seeing our own
      // optimistic value, to avoid undoing newer changes made while the request was in flight).
      const initialValue = this.getValueFromState(this.initialState);

      if (this.shouldRollback({
        currentValue: this.getValueFromState(this.state),
        initialValue,
        optimisticValue: optimistic,
        error,
      })) {
        const rollback = this.rollbackState({ initialValue, optimisticValue: optimistic, error });
        if (rollback !== null) {
          this._applyState(rollback);
          rollbackValue = this.getValueFromState(rollback);
          lastAppliedValue = rollbackValue;
        }
      }
    }

    // Reloads from the server, if `reloadFromServer` was implemented.
    if (this.reloadFromServer !== undefined) {
      try {
        const doReload = this.shouldReload({
          currentValue: this.getValueFromState(this.state),
          lastAppliedValue,
          optimisticValue: optimistic,
          rollbackValue,
          error: commandError,
        });

        if (doReload) {
          const reloadResult = await this.reloadFromServer();

          // Reads the current value again, because the state may have changed while reloading.
          const apply = this.shouldApplyReload({
            currentValue: this.getValueFromState(this.state),
            lastAppliedValue,
            optimisticValue: optimistic,
            rollbackValue,
            reloadResult,
            error: commandError,
          });

          if (apply) {
            const newState = this.applyReloadResultToState(this.state, reloadResult);
            if (newState !== null) this._applyState(newState);
          }
        }
      } catch (reloadError) {
        // A reload failure does not hide the original command error.
        if (!commandFailed) throw reloadError;
      }
    }

    // Rethrows, so that the action fails, and the user can be notified.
    if (commandFailed) throw commandError;

    return null;
  }

  private _applyState(newState: St): void {
    this.dispatch(new UpdateStateAction(() => newState));
  }

  /**
   * When retry is on, retries only the `sendCommandToServer` call, keeping the optimistic
   * update in place and avoiding UI flickering. Note the store does not retry the reducer
   * of an `OptimisticCommand`.
   */
  private async _sendCommandWithRetryIfNeeded(optimistic: T): Promise<any> {
    if (!this.ifRetryIsOn) return this.sendCommandToServer(optimistic);

    while (true) {
      try {
        return await this.sendCommandToServer(optimistic);
      } catch (error) {
        this._retry.attempts++;
        if (this._retry.attempts > this._retry.maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, this._nextRetryDelay()));
      }
    }
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    super._injectStore(_store);

    if (this.nonReentrant)
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which is always non-reentrant. ` +
        'Remove its `nonReentrant` property.');

    if (this.ifRetryIsOn && (this._retry.unlimitedRetries || this._retry.maxRetries === -1))
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use unlimited retries. ` +
        'Use a `retry.maxRetries` of 0 or more.');
  }
}

/**
 * Returns true if the given non-reentrant keys are the same. Keys are compared with
 * `Object.is`, except arrays and plain objects, which are compared by their contents.
 * For Kiss internal use only.
 */
export function _isSameNonReentrantKey(a: any, b: any): boolean {
  if (Object.is(a, b)) return true;

  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((value, i) => _isSameNonReentrantKey(value, b[i]));

  if (_isPlainObject(a) && _isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length &&
      keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && _isSameNonReentrantKey(a[key], b[key]));
  }

  return false;
}

function _isPlainObject(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
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
