import { Store } from "./Store";
import { AbortDispatchException, StoreException } from "./StoreException";
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

// The options of the `checkInternet` property: `dialog`, or `abort`. Setting `dialog` together
// with `abort: true` makes the dispatch throw. Note the literal type `abort: true` can't be used
// here, because TypeScript widens `checkInternet = { abort: true }` to `{ abort: boolean }`.
type CheckInternetOptions =
  | {
    /** Whether to show a dialog when no internet connection is available. */
    dialog: boolean,
    abort?: boolean,
  }
  | {
    /** Whether to abort the action silently when no internet connection is available. */
    abort: boolean,
    dialog?: boolean,
  };

/**
 * The values of the `poll` property of an action that uses polling.
 * See the documentation of `KissAction.poll` for details.
 */
export enum Poll {
  /**
   * Start polling.
   * If polling is already active, does nothing.
   * Otherwise, runs the action immediately and starts periodic polling.
   */
  start = 'start',

  /** Stop polling (cancels the timer and does not run the action). */
  stop = 'stop',

  /**
   * Run the action immediately and restart polling from now.
   * If polling is not active, behaves like `Poll.start`.
   */
  runNowAndRestart = 'runNowAndRestart',

  /**
   * Run the action once immediately.
   * Does not start, stop, cancel, or restart polling.
   */
  once = 'once',
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
   * present, it throws a `UserException` (or an `AbortDispatchException`, with
   * `checkInternet = { abort: true }`), preventing the reducer from running.
   *
   * Note the `after()` method always runs, even if the `before()` method throws an exception.
   */
  before(): void | Promise<void> {
    if (this.checkInternet) {
      const { dialog, abort } = this.checkInternet;

      return this._hasInternet().then((isConnected: boolean) => {
        if (!isConnected) {
          if (abort) {
            throw new AbortDispatchException('No Internet');
          } else if (dialog) {
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
  *
  * Note: This method is not called while the internet connection is being simulated with
  * `internetOnOffSimulation` or `store.forceInternetOnOffSimulation`.
  */
  protected hasInternet(): Promise<boolean> {

    // In the browser, use navigator.onLine. Otherwise (Node.js, React Native, which has
    // `navigator` but no `navigator.onLine`), assume connected.
    const hasOnLine = typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean';
    return Promise.resolve(hasOnLine ? navigator.onLine : true);
  }

  /**
   * If you are running tests, you can override this getter to simulate the internet connection
   * as on or off, for actions that use `checkInternet` or `unlimitedRetryCheckInternet`:
   *
   * - Return `true` if there IS internet.
   * - Return `false` if there is NO internet.
   * - Return `null` to use the real internet connection status (default).
   *
   * If you want to change this for all actions that check the internet, you can do that at
   * the store level:
   *
   * ```ts
   * store.forceInternetOnOffSimulation = () => false;
   * ```
   *
   * Using `store.forceInternetOnOffSimulation` is also useful during tests, for testing what
   * happens when you have no internet connection. And since it's tied to the store, it
   * automatically resets when the store is recreated.
   */
  get internetOnOffSimulation(): boolean | null {
    return this.store.forceInternetOnOffSimulation();
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
   * If the action should check for internet connection or not. If there is no internet:
   *
   * - If `checkInternet = { dialog: true }`, the action fails with a `UserException`, and
   *   shows a dialog to the user with title "There is no Internet", and content "Please, verify
   *   your connection.".
   *
   * - If `checkInternet = { dialog: false }`, the action fails with a `UserException`, without
   *   a dialog. You can still display some information in your components, since the action
   *   failed: `if (isFailed(LoadText)) return <p>No Internet connection</p>;`
   *
   * - If `checkInternet = { abort: true }`, the action aborts silently, as if it had never been
   *   dispatched. It throws an `AbortDispatchException`, so it doesn't fail, and doesn't show
   *   any errors. Its status has `isDispatchAborted: true`.
   *
   * - If `checkInternet` is undefined/null, don't check for internet.
   *
   * For example:
   *
   * ```ts
   * class LoadText extends KissAction<State> {
   *   checkInternet = { abort: true };
   *
   *   async reduce() { ... }
   * }
   * ```
   *
   * IMPORTANT: It only checks if the internet is on or off on the device, not if the internet
   * provider is really providing the service or if the server is available. So, it is possible
   * that the check succeeds but internet requests still fail.
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
   *
   * Notes:
   * - The internet check runs in the default `before()` method. If you override `before()`,
   *   you must call `super.before()` (and await it), or the internet won't be checked.
   * - It can be combined with `sequential`. The internet check then happens when the action
   *   gets its turn in the queue. Note that with `{ abort: true }`, aborting the action releases
   *   the queue, so the next action runs normally (unless `discardQueueOnError()` returns
   *   `true` for the `AbortDispatchException`).
   * - With `retry`, the internet is only checked once, since `before()` is not retried. So,
   *   `retry` plus `checkInternet` doesn't retry when there is no internet. It only retries if
   *   there IS internet but the action fails for some other reason. To retry indefinitely until
   *   internet is available, use `unlimitedRetryCheckInternet` instead.
   * - It should not be combined with `unlimitedRetryCheckInternet`, which already checks the
   *   internet. Doing so throws a `StoreException`.
   * - Setting both `dialog` and `abort: true` makes the dispatch throw a `StoreException`.
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
   *
   * When the dispatch is aborted, `dispatchAndWait` returns a status with
   * `isDispatchAborted: true`. Note `abortDispatch()` must decide synchronously. To abort the
   * action after some ASYNC check, throw an `AbortDispatchException` from `before` instead.
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
   * - It should not be combined with `throttle` or `fresh`. Doing so throws a `StoreException`.
   * - It should not be combined with `unlimitedRetryCheckInternet`, which is already
   *   non-reentrant. Doing so throws a `StoreException`.
   * - It can be combined with `sequential`. Duplicates are then dropped while the original
   *   action is waiting in the queue or running, and the actions that do get through still
   *   run one at a time.
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
   * For Kiss internal use only.
   * How many times `store.clearInternalActionProps()` had been called when this action was
   * dispatched. If it's called again later, the action stops retrying.
   */
  _clearCountAtDispatch: number = 0;

  /**
   * Set `debounce` to delay the execution of the action until after a certain period of
   * inactivity. Each time the action is dispatched, the period of inactivity (or wait time)
   * is reset.
   *
   * The action will only run its reducer after it stops being dispatched for the duration of
   * the wait time. Debouncing is useful in situations where you want to ensure that an action
   * does not run too frequently, and only runs after some "quiet time".
   *
   * For example, it's commonly used for handling input validation in text fields, or for
   * searching while the user types, where you might not want to run the action every time the
   * user presses a key, but rather after they've stopped typing for a certain amount of time.
   *
   * Set `debounce` to `true` to use the default wait time of 333 milliseconds (1/3 of a
   * second), or set it to the wait time you want, in milliseconds:
   *
   * ```ts
   * class SearchText extends KissAction<State> {
   *   constructor(readonly searchTerm: string) { super(); }
   *
   *   debounce = 1000; // Here!
   *
   *   async reduce() {
   *     let result = await loadJson('https://example.com/?q=', this.searchTerm);
   *     return (state: State) => state.copy({ searchResult: result });
   *   }
   * }
   * ```
   *
   * The wait time starts after the `before()` method finishes, and the action is in progress
   * while it waits. So, `isWaiting(SearchText)` is `true` during the wait time.
   *
   * When another action with the same lock is dispatched during the wait time, the previous
   * action finishes right away, without running its reducer (it doesn't change the state, and
   * doesn't fail). Its `before()` and `after()` methods still run. Only the last action runs
   * its reducer, after the wait time.
   *
   * To turn off a debounce that a base class turned on, use `debounce = false`. Note: For
   * TypeScript to accept that, the base class must declare it as `debounce: number | boolean`.
   *
   * ## Advanced usage
   *
   * The debounce is, by default, based on the action class. This means it will reset the
   * debounce period when another action of the same class is dispatched within the debounce
   * period. In other words, the class is the "lock". Note subclasses are different classes,
   * so they don't debounce each other. If you want to debounce based on a different lock,
   * you can override the `debounceLockBuilder()` method. For example, here we debounce two
   * different actions based on the same lock:
   *
   * ```ts
   * class MyAction1 extends KissAction<State> {
   *   debounce = true;
   *   debounceLockBuilder() { return 'myLock'; }
   *   ...
   * }
   *
   * class MyAction2 extends KissAction<State> {
   *   debounce = true;
   *   debounceLockBuilder() { return 'myLock'; }
   *   ...
   * }
   * ```
   *
   * Another example is to debounce based on some field of the action:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   debounce = true;
   *   constructor(readonly lock: string) { super(); }
   *   debounceLockBuilder() { return this.lock; }
   *   ...
   * }
   * ```
   *
   * To remove all debounce locks at once, call `removeAllDebounceLocks()`. Alternatively,
   * `store.clearInternalActionProps()` removes them together with the information kept for the
   * other action features, which is useful during logout.
   *
   * Notes:
   * - It should not be combined with `retry`, nor used in an `OptimisticCommand`.
   *   Dispatching it with those throws a `StoreException`.
   * - It works with both SYNC and ASYNC reducers, but the action is always ASYNC, since it
   *   waits for the debounce period. So, it can't be dispatched with `dispatchSync`.
   *   Doing so throws a `StoreException`.
   * - It should not be combined with `sequential`, because the debounce period would only
   *   start when the action gets its turn in the queue, which defeats the purpose of
   *   debouncing. Doing so throws a `StoreException`.
   * - An invalid value (for example, a negative number) makes the dispatch throw a
   *   `StoreException`.
   */
  declare debounce?: number | boolean;

  /**
   * The default lock for debouncing is the action class, meaning it will debounce the dispatch
   * of actions of the same class. Override this method to customize the lock to any value.
   * For example, you can return a string, and actions with the same lock value will debounce
   * each other:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   debounce = true;
   *   debounceLockBuilder() { return 'myLock'; }
   *   ...
   * }
   * ```
   *
   * Locks are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[this.constructor, this.userId]` is a valid lock.
   */
  debounceLockBuilder(): any {
    return this.constructor;
  }

  /**
   * Removes all debounce locks. Actions that are still waiting for their debounce period
   * finish right away, without running their reducer.
   * You generally don't need to call this method.
   */
  removeAllDebounceLocks(): void {
    this.store._removeAllDebounceLocks();
  }

  /**
   * For Kiss internal use only.
   * The debounce wait time in milliseconds, or `null` if the action doesn't debounce.
   */
  get _debounceMillis(): number | null {
    if (this.debounce === true) return 333;
    if (typeof this.debounce === 'number') return this.debounce;
    return null;
  }

  /**
   * Set `throttle` to make sure the action will be dispatched at most once in the specified
   * throttle period. It acts as a simple rate limit, so the action does not run too often.
   *
   * If an action is dispatched multiple times within a throttle period, only the first dispatch
   * runs and the others are aborted. After the throttle period has passed, the next dispatch is
   * allowed to run again, which starts a new throttle period.
   *
   * This is useful when an action may be triggered many times in a short time, for example by
   * fast user input or component re-renders, but you only want it to run from time to time
   * instead of on every dispatch.
   *
   * For example, if you have a component that needs to load some information, you can dispatch
   * the loading action when the component mounts, and specify a throttle period so that it does
   * not reload that information too often:
   *
   * ```tsx
   * function MyScreen() {
   *   useDispatch({ onMount: (store) => store.dispatch(new LoadInformation()) }); // Here!
   *   const information = useSelect((state: State) => state.information);
   *
   *   return <div>Information: {information}</div>;
   * }
   * ```
   *
   * and then:
   *
   * ```ts
   * class LoadInformation extends KissAction<State> {
   *
   *   throttle = 5000;
   *
   *   async reduce() {
   *     let information = await loadInformation();
   *     return (state: State) => state.copy({ information });
   *   }
   * }
   * ```
   *
   * The `throttle` value is given in milliseconds. Set it to `true` to use the default of 1000
   * milliseconds (1 second):
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   throttle = true; // Here!
   *   ...
   * }
   * ```
   *
   * You can also override `ignoreThrottle` if you want the action to ignore the throttle period
   * under some conditions. For example, suppose you want the action to provide a flag called
   * `force` that will ignore the throttle period:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   constructor(readonly force = false) { super(); }
   *
   *   get ignoreThrottle() { return this.force; } // Here!
   *
   *   throttle = 500;
   *   ...
   * }
   * ```
   *
   * To turn off a throttle that a base class turned on, use `throttle = false`. Note: For
   * TypeScript to accept that, the base class must declare it as `throttle: number | boolean`.
   *
   * ## If the action fails
   *
   * The throttle lock is NOT removed if the action fails. This means that if the action throws
   * and you dispatch it again within the throttle period, it will not run a second time.
   *
   * If you want, you can specify a different behavior by making `removeThrottleLockOnError`
   * true, like this:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   throttle = 500;
   *   removeThrottleLockOnError = true; // Here!
   *   ...
   * }
   * ```
   *
   * Now, if the action fails, it will remove the lock and allow the action to be dispatched
   * again right away. If you need more control, you can instead call `removeThrottleLock()`
   * yourself, for example in the `after()` method:
   *
   * ```ts
   * after() {
   *   if (this.status.originalError instanceof SomeSpecificError) this.removeThrottleLock();
   * }
   * ```
   *
   * ## Advanced usage
   *
   * The throttle is, by default, based on the action class. This means it will throttle an
   * action if another action of the same class was previously dispatched within the throttle
   * period. In other words, the class is the "lock". Note subclasses are different classes,
   * so they don't throttle each other. If you want to throttle based on a different lock, you
   * can override the `throttleLockBuilder()` method. For example, here we throttle two
   * different actions based on the same lock:
   *
   * ```ts
   * class MyAction1 extends KissAction<State> {
   *   throttle = 500;
   *   throttleLockBuilder() { return 'myLock'; }
   *   ...
   * }
   *
   * class MyAction2 extends KissAction<State> {
   *   throttle = 500;
   *   throttleLockBuilder() { return 'myLock'; }
   *   ...
   * }
   * ```
   *
   * Another example is to throttle based on some field of the action:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   throttle = 500;
   *   constructor(readonly lock: string) { super(); }
   *   throttleLockBuilder() { return this.lock; }
   *   ...
   * }
   * ```
   *
   * Note: Expired locks are removed, to prevent memory leaks.
   *
   * To remove all throttle locks at once, call `removeAllThrottleLocks()`. Alternatively,
   * `store.clearInternalActionProps()` removes them together with the information kept for the
   * other action features, which is useful during logout.
   *
   * Notes:
   * - The throttle period starts when the action is dispatched, not when it finishes.
   * - It works with both SYNC and ASYNC actions, and can be combined with `retry`,
   *   `checkInternet` and `debounce`.
   * - It should not be combined with `nonReentrant` or `fresh`, nor used in an
   *   `OptimisticCommand`. Dispatching it with those throws a `StoreException`.
   * - It can be combined with `sequential`. Note the throttle period then starts when the
   *   action is dispatched, and not when it gets its turn in the queue.
   * - An invalid value (for example, a negative number) makes the dispatch throw a
   *   `StoreException`.
   */
  declare throttle?: number | boolean;

  /**
   * Override this getter if you want the action to ignore the throttle period under some
   * conditions. When it returns `true`, the action runs even inside the throttle period, and
   * starts a new throttle period. For example:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   constructor(readonly force = false) { super(); }
   *   get ignoreThrottle() { return this.force; } // Here!
   *   throttle = 500;
   *   ...
   * }
   * ```
   */
  get ignoreThrottle(): boolean {
    return false;
  }

  /**
   * The throttle lock is NOT removed if the action fails. This means that if the action throws
   * and you dispatch it again within the throttle period, it will not run a second time.
   * Set `removeThrottleLockOnError` to `true` so that, if the action fails, it removes the lock
   * and allows the action to be dispatched again right away.
   */
  declare removeThrottleLockOnError?: boolean;

  /**
   * The default lock for throttling is the action class, meaning it will throttle the dispatch
   * of actions of the same class. Override this method to customize the lock to any value.
   * For example, you can return a string, and actions with the same lock value will throttle
   * each other:
   *
   * ```ts
   * class MyAction extends KissAction<State> {
   *   throttle = 500;
   *   throttleLockBuilder() { return 'myLock'; }
   *   ...
   * }
   * ```
   *
   * Locks are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[this.constructor, this.userId]` is a valid lock.
   *
   * Note: Expired locks are removed, to prevent memory leaks.
   */
  throttleLockBuilder(): any {
    return this.constructor;
  }

  /**
   * Removes the throttle lock of this action, allowing an action with the same lock to be
   * dispatched again right away. You generally don't need to call this method.
   */
  removeThrottleLock(): void {
    this.store._removeThrottleLock(this.throttleLockBuilder());
  }

  /**
   * Removes all throttle locks, allowing all actions to be dispatched again right away.
   * You generally don't need to call this method.
   */
  removeAllThrottleLocks(): void {
    this.store._removeAllThrottleLocks();
  }

  /**
   * For Kiss internal use only.
   * The throttle period in milliseconds, or `null` if the action doesn't throttle, or if its
   * `throttle` value is invalid (in which case the dispatch throws).
   */
  get _throttleMillis(): number | null {
    const throttle: any = this.throttle;
    if (throttle === true) return 1000;
    if (typeof throttle === 'number' && Number.isFinite(throttle) && throttle >= 0) return throttle;
    return null;
  }

  /**
   * Set `fresh` to treat the result of an action as fresh for a given time period. While the
   * information is fresh, repeated dispatches of the same action (or other actions with the
   * same "fresh-key") are aborted, because that information is assumed to still be valid in
   * the state.
   *
   * After the fresh period ends, the information is considered "stale". The next dispatch of
   * an action with the same fresh-key is allowed to run again, update the state, and start a
   * new fresh period.
   *
   * In short, `fresh` helps you avoid reloading the same information too often.
   *
   * ## Basic usage
   *
   * This is often used for actions that load information from a server. You can think of the
   * fresh period as the time during which the loaded data is still good to use. After that
   * time, a new dispatch will reload it.
   *
   * A simple example in a component that loads information when it mounts:
   *
   * ```tsx
   * function MyScreen() {
   *   useDispatch({ onMount: (store) => store.dispatch(new LoadInformation()) }); // Here!
   *   const information = useSelect((state: State) => state.information);
   *
   *   return <div>Information: {information}</div>;
   * }
   * ```
   *
   * Use `fresh` on the loading action, so that it does not run again while its data is still
   * fresh:
   *
   * ```ts
   * class LoadInformation extends KissAction<State> {
   *
   *   fresh = true; // Here!
   *
   *   async reduce() {
   *     let information = await loadInformation();
   *     return (state: State) => state.copy({ information });
   *   }
   * }
   * ```
   *
   * ## How fresh-keys work
   *
   * - Dispatched actions with different fresh-keys are not affected.
   *
   * - Dispatched actions with the same fresh-key:
   *   - Are aborted while the data is fresh (the fresh period has not passed).
   *   - Run again when the data is stale (after the fresh period has passed).
   *
   * In other words, freshness is tracked per fresh-key. Any two dispatches that share the same
   * fresh-key share the same fresh period.
   *
   * By default, the key is based on:
   * - The action class, and
   * - The value returned by `freshKeyParams()`.
   *
   * In the previous example, the fresh-key of the `LoadInformation` action is simply the
   * action class, since it did not override `freshKeyParams()`. Note subclasses are different
   * classes, so they don't share the fresh period.
   *
   * If you dispatch `LoadInformation` many times in a short period, only the first one runs
   * while the data is fresh. The others are aborted. Later, when the fresh period ends, the
   * next dispatch will run the action again.
   *
   * The default `freshKeyParams()` returns `null`, so the key is only the action class. This
   * means all actions of the same class share the same fresh period, and different action
   * classes do not affect each other.
   *
   * ### Using `freshKeyParams()` to separate instances
   *
   * Many actions need a separate fresh period per id, url, or some other field. In that case,
   * override `freshKeyParams()`. Actions of the same class but with different
   * `freshKeyParams()` values do not affect each other.
   *
   * ```ts
   * class LoadUserCart extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly userId: string) { super(); }
   *
   *   // The fresh-key parameter here is the `userId`, which means
   *   // each different `(LoadUserCart, userId)` has its own fresh period.
   *   freshKeyParams() { return this.userId; }
   *   ...
   * }
   * ```
   *
   * You can also return more than one field by using an array:
   *
   * ```ts
   * // Each different `(LoadUserCart, userId, cartId)` has its own fresh period.
   * freshKeyParams() { return [this.userId, this.cartId]; }
   * ```
   *
   * ## Configuring how long data stays fresh
   *
   * The `fresh` value is given in milliseconds. Set it to `true` to use the default of 1000
   * milliseconds (1 second).
   *
   * To keep the data fresh for 5 seconds:
   *
   * ```ts
   * class LoadInformation extends KissAction<State> {
   *   fresh = 5000; // Here!
   *   ...
   * }
   * ```
   *
   * To turn off a fresh period that a base class turned on, use `fresh = false`. Note: For
   * TypeScript to accept that, the base class must declare it as `fresh: number | boolean`.
   *
   * ## Forcing the action to run
   *
   * Sometimes you want to run the action even if the data is still fresh. For that, you can
   * override `ignoreFresh`. When `ignoreFresh` is `true`, the action always runs, and also
   * starts a new fresh period for its key.
   *
   * A common pattern is to add a `force` flag:
   *
   * ```ts
   * class LoadInformation extends KissAction<State> {
   *   constructor(readonly force = false) { super(); }
   *
   *   get ignoreFresh() { return this.force; } // Here!
   *
   *   fresh = 5000;
   *   ...
   * }
   * ```
   *
   * With this setup:
   * - `new LoadInformation()` runs only when its key is stale.
   * - `new LoadInformation(true)` always runs, and also refreshes the key.
   *
   * ## When the action fails
   *
   * If an action that uses `fresh` throws an error, it behaves as if that failing run did not
   * make the key fresh. In practice:
   *
   * - The key the action made fresh is removed, so you can dispatch the action again right
   *   away. This is also true for a forced run (`ignoreFresh`): if it fails, the key becomes
   *   stale, even if it was fresh before the forced run.
   * - If another action using the same key started after this one (for example, a forced run),
   *   that newer fresh period is kept as is.
   *
   * This means:
   * - Errors never extend the fresh period by themselves.
   * - A failure from an older action does not cancel a newer successful action that used
   *   the same fresh-key.
   *
   * You can also control this by hand:
   *
   * - Call `removeFreshKey()` from your action (for example inside `reduce()` or `before()`)
   *   to remove the key used by that action, so the next dispatch for that key can run
   *   immediately.
   * - Call `removeAllFreshKeys()` from your action to clear all keys, and let all actions run
   *   again as if nothing was fresh. This is probably useful during logout or similar
   *   scenarios. Alternatively, `store.clearInternalActionProps()` clears them together with
   *   the information kept for the other action features.
   *
   * Expired keys are removed automatically, so you usually do not need to worry about old
   * entries.
   *
   * ## Using `computeFreshKey()` to share keys across actions
   *
   * If you want different action classes to share the same key, override `computeFreshKey()`.
   * This is useful when several actions read or write the same logical resource, and should
   * respect the same fresh period.
   *
   * For example, two actions that work on the same user data:
   *
   * ```ts
   * class LoadUserProfile extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly userId: string) { super(); }
   *   computeFreshKey() { return this.userId; } // Key is only userId
   *   ...
   * }
   *
   * class LoadUserSettings extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly userId: string) { super(); }
   *   computeFreshKey() { return this.userId; } // Same key as above
   *   ...
   * }
   * ```
   *
   * Here:
   * - `new LoadUserProfile('123')` and `new LoadUserSettings('123')` share one fresh period,
   *   because they use the same key.
   * - Any value can be a key, for example an enum value or a constant string.
   *
   * Notes:
   * - The fresh period starts when the action is dispatched, not when it finishes.
   * - If `abortDispatch()` returns `true`, the action is aborted before the fresh check, and
   *   doesn't make its key fresh.
   * - It works with both SYNC and ASYNC actions, and can be combined with `retry`,
   *   `checkInternet` and `debounce`. With `retry`, the key is only removed if the last
   *   attempt fails.
   * - It should not be combined with `nonReentrant` or `throttle`, nor used in an
   *   `OptimisticCommand`. Dispatching it with those throws a `StoreException`.
   * - It can be combined with `sequential`. Note the fresh period then starts when the action
   *   is dispatched, and not when it gets its turn in the queue. If the action is discarded
   *   from the queue (see `discardQueueOnError()`), its key is removed, since it never ran.
   * - An invalid value (for example, a negative number) makes the dispatch throw a
   *   `StoreException`.
   */
  declare fresh?: number | boolean;

  /**
   * Override this getter if you want the action to run even while its data is still fresh.
   * When it returns `true`, the action always runs, and also starts a new fresh period for
   * its key. For example:
   *
   * ```ts
   * class LoadInformation extends KissAction<State> {
   *   constructor(readonly force = false) { super(); }
   *   get ignoreFresh() { return this.force; } // Here!
   *   fresh = 5000;
   *   ...
   * }
   * ```
   *
   * Note: If a forced run fails, its key becomes stale, even if it was fresh before.
   */
  get ignoreFresh(): boolean {
    return false;
  }

  /**
   * By default the fresh-key is based on the action class. For example, all actions of class
   * `LoadText` share the same freshness:
   *
   * ```ts
   * // This action runs.
   * dispatch(new LoadText('https://example.com'));
   *
   * // This does NOT run, because the previous LoadText is still fresh.
   * dispatch(new LoadText('https://another-url.com'));
   * ```
   *
   * You can override `freshKeyParams()` so that actions of the SAME CLASS but with different
   * parameters do not affect each other's freshness. In this example, the `url` field becomes
   * part of the fresh-key:
   *
   * ```ts
   * class LoadText extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly url: string) { super(); }
   *
   *   // The fresh-key includes the url.
   *   freshKeyParams() { return this.url; }
   *   ...
   * }
   * ```
   *
   * Now, dispatching two `LoadText` actions with different `url` values allows both of them
   * to run, because each one uses a different fresh-key:
   *
   * ```ts
   * // This action runs.
   * dispatch(new LoadText('https://example.com'));
   *
   * // This also runs, because the url is different, so it has a different fresh-key.
   * dispatch(new LoadText('https://another-url.com'));
   * ```
   *
   * ## In more detail
   *
   * The default fresh-key, as returned by `computeFreshKey()`, combines the action class with
   * the value returned by `freshKeyParams()`.
   *
   * Most of the time you override `freshKeyParams()` to return one field, or an array of
   * fields:
   *
   * ```ts
   * // Fresh-key is the action class + url
   * freshKeyParams() { return this.url; }
   *
   * // Fresh-key is the action class + userId + cartId
   * freshKeyParams() { return [this.userId, this.cartId]; }
   * ```
   *
   * When `freshKeyParams()` returns `null`, the key is just the action class. In that case all
   * actions of that class share the same freshness.
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[1, 'A']` and `{ id: 1 }` are valid params.
   *
   * See also:
   * - `computeFreshKey()` if you want full control over how the key is built.
   */
  freshKeyParams(): any {
    return null;
  }

  /**
   * In most cases you want to use the default fresh-key computation, which combines the
   * action class with the value returned by `freshKeyParams()`:
   *
   * ```ts
   * computeFreshKey() { return [this.constructor, this.freshKeyParams()]; }
   * ```
   *
   * However, if you want different action classes to share the same fresh period, you must
   * override `computeFreshKey()` and return any key you want. Some examples:
   *
   * ```ts
   * // The fresh-key is only the url, without the action class.
   * computeFreshKey() { return this.url; }
   *
   * // The fresh-key is a pair of values, without the action class.
   * computeFreshKey() { return [this.userId, this.cartId]; }
   *
   * // The fresh-key is a constant string.
   * computeFreshKey() { return 'myKey'; }
   *
   * // The fresh-key is an enum value.
   * computeFreshKey() { return MyFreshnessKey.myKey; }
   * ```
   *
   * For example, suppose you have two different actions, and you want them to share the same
   * fresh-key:
   *
   * ```ts
   * class LoadUserProfile extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly userId: string) { super(); }
   *
   *   // The key is the userId only, without the action class.
   *   computeFreshKey() { return this.userId; }
   *   ...
   * }
   *
   * class LoadUserSettings extends KissAction<State> {
   *   fresh = true;
   *   constructor(readonly userId: string) { super(); }
   *
   *   // The key is the userId only, without the action class.
   *   computeFreshKey() { return this.userId; }
   *   ...
   * }
   * ```
   *
   * With this setup, if you dispatch `new LoadUserProfile('123')`, then
   * `new LoadUserSettings('123')` will be aborted if dispatched within the fresh period of the
   * first action.
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   *
   * See also:
   * - `freshKeyParams()` when you want to differentiate fresh-keys by some of the fields of
   *   the action.
   */
  computeFreshKey(): any {
    return [this.constructor, this.freshKeyParams()];
  }

  /**
   * Removes the fresh-key used by this action, allowing an action using the same fresh-key to
   * be dispatched and run again, right away. Calling this method will make the action stale
   * immediately. You generally do not need to call this method, but if you do, use it only
   * from your action's `reduce()` or `before()` methods.
   */
  removeFreshKey(): void {
    this.store._removeFreshKey(this.computeFreshKey());
  }

  /**
   * Removes all fresh-keys, allowing all actions to be dispatched and run again right away.
   * Calling this method will make all actions stale immediately. You generally do not need to
   * call this method, but if you do, use it only from your action's `reduce()` or `before()`
   * methods.
   */
  removeAllFreshKeys(): void {
    this.store._removeAllFreshKeys();
  }

  /**
   * For Kiss internal use only.
   * The fresh period in milliseconds, or `null` if the action doesn't use `fresh`, or if its
   * `fresh` value is invalid (in which case the dispatch throws).
   */
  get _freshMillis(): number | null {
    const fresh: any = this.fresh;
    if (fresh === true) return 1000;
    if (typeof fresh === 'number' && Number.isFinite(fresh) && fresh >= 0) return fresh;
    return null;
  }

  /**
   * Set `sequential` to `true` to make actions run one at a time, in the exact order they were
   * dispatched. For example:
   *
   * ```ts
   * class SaveItem extends KissAction<State> {
   *   sequential = true;
   *   constructor(readonly item: Item) { super(); }
   *
   *   async reduce() {
   *     await fetch('https://myapi.com/items', { method: 'PUT', body: JSON.stringify(this.item) });
   *     return null;
   *   }
   * }
   * ```
   *
   * All actions with `sequential = true` share a single FIFO queue (first in, first out). When
   * an action is dispatched, it takes its place at the end of the queue, and then waits until
   * every action dispatched before it has finished. Only then does it run its `before`,
   * `reduce` and `after` methods.
   *
   * This works across all sequential action classes: if `SaveItem` and `DeleteItem` are both
   * sequential, they wait for each other. Two actions of the same class also enter the queue
   * and run one after the other.
   *
   * The queue position is reserved synchronously, at the moment `dispatch` is called. This
   * guarantees the run order is the dispatch order, even if the actions are dispatched from
   * different places or in quick succession.
   *
   * When an action finishes, the next action in the queue is released. This happens regardless
   * of how the action finished:
   *
   * - It completed successfully.
   * - It threw an error (from `before` or `reduce`).
   * - It was aborted by throwing an `AbortDispatchException` (from `before` or `reduce`).
   *
   * Note that when the dispatch is aborted (for example, when `abortDispatch()` returns `true`),
   * the action never enters the queue.
   *
   * ## Keys: multiple independent queues
   *
   * By default, all sequential actions share ONE queue, whose key is `null`. If you want
   * independent queues, override `sequentialKeyParams()` to return any value. Actions with the
   * same key wait for each other, while actions with different keys run in parallel. For
   * example, here each user has its own queue, so the actions of different users don't block
   * each other:
   *
   * ```ts
   * class SaveUser extends KissAction<State> {
   *   sequential = true;
   *   constructor(readonly userId: string) { super(); }
   *   sequentialKeyParams() { return this.userId; }
   *   ...
   * }
   *
   * class DeleteUser extends KissAction<State> {
   *   sequential = true;
   *   constructor(readonly userId: string) { super(); }
   *   sequentialKeyParams() { return this.userId; }
   *   ...
   * }
   * ```
   *
   * With this setup, `SaveUser('A')` and `DeleteUser('A')` run one after the other, but
   * `SaveUser('A')` and `SaveUser('B')` may run at the same time.
   *
   * Keys are removed from memory as soon as their queue becomes empty.
   *
   * ## Discarding the queue when an action fails
   *
   * Actions are often queued because each one depends on the previous ones. For example, an
   * action that creates an item, followed by one that updates it. In that case, if the first
   * action fails, running the rest makes no sense. Override `discardQueueOnError()` to return
   * `true` when you want a failure to abort all the actions that are waiting behind the failed
   * one:
   *
   * ```ts
   * class SaveItem extends KissAction<State> {
   *   sequential = true;
   *   discardQueueOnError(error: any) { return !(error instanceof AbortDispatchException); }
   *   ...
   * }
   * ```
   *
   * The discarded actions are aborted: they don't run their `before` and `reduce` methods, and
   * they finish with an `AbortDispatchException` (which the store treats silently, without
   * showing any error dialog). Their `status.isDispatchAborted` is `true`. You can check
   * `wasDiscardedFromSequentialQueue` on those actions, if you need to know. Actions dispatched
   * after the failure are not affected, and start a fresh queue. The default is `false`, which
   * means the queue simply continues.
   *
   * ## IMPORTANT: Do not wait for an action in the same queue
   *
   * An action that is running (and therefore holds the queue) must NOT wait for another action
   * that uses the same queue. If it does, both actions will wait for each other forever
   * (a deadlock):
   *
   * ```ts
   * class Parent extends KissAction<State> {
   *   sequential = true;
   *
   *   async reduce() {
   *     // WRONG: `Child` enters the queue behind `Parent`, and waits for
   *     // `Parent` to finish. But `Parent` waits for `Child` here. Deadlock!
   *     await this.dispatchAndWait(new Child());
   *     return null;
   *   }
   * }
   *
   * class Child extends KissAction<State> {
   *   sequential = true;
   *   ...
   * }
   * ```
   *
   * The same applies to any other way of waiting for a queued action, such as
   * `waitActionType(Child)`, `waitAllActions`, or a `waitCondition` that only becomes true
   * after `Child` runs.
   *
   * If you need to dispatch another action of the same queue from inside a running action, you
   * have these options:
   *
   * - Dispatch it without waiting for it: `this.dispatch(new Child())`. The child is queued and
   *   will run right after the parent finishes.
   * - Give the child a different key, so it uses a different queue.
   * - Don't make the child sequential.
   *
   * ## Other notes
   *
   * - Sequential actions are always ASYNC, even if their `before` and `reduce` methods are
   *   SYNC. This means you can't dispatch them with `dispatchSync`. Doing so throws a
   *   `StoreException`.
   *
   * - The action only runs its `before` method when it gets its turn. So you can override
   *   `before`, `reduce` and `after` as usual, and all of them run when it's the action's turn.
   *
   * - While an action is waiting in the queue, it counts as being "in progress", so
   *   `isWaiting(MyAction)` returns `true` for it. This is usually what you want, as it lets
   *   you show a spinner as soon as the action is dispatched. You can also check
   *   `isWaitingInSequentialQueue` on the action itself.
   *
   * - Calling `store.clearInternalActionProps()` (or `store.setShutDown(true)`) discards the
   *   actions waiting in all queues, as if a failed action had discarded them. The actions that
   *   are running keep running, but actions dispatched after that start new queues, and don't
   *   wait for them.
   *
   * ## Combining with other features
   *
   * - It can be combined with `retry` and `checkInternet`. Retries happen while the action
   *   holds the queue, and the internet check happens when the action gets its turn. Note
   *   that with unlimited retries, a single failing action blocks every action behind it, for
   *   as long as it keeps failing. To keep the ordering and still retry, prefer a limited
   *   number of retries, possibly together with `discardQueueOnError()`.
   *
   * - It can also be combined with `nonReentrant`, `throttle`, `fresh` and `OptimisticCommand`.
   *   For example, `nonReentrant` plus `sequential` means duplicates are dropped while the
   *   original is queued or running, and the ones that get through still run one at a time.
   *   Note the throttle and fresh periods start when the action is dispatched, not when it
   *   gets its turn in the queue. And the optimistic value of an `OptimisticCommand` is only
   *   applied to the state when the action gets its turn, and not as soon as it's dispatched.
   *
   * - It should NOT be combined with `debounce`, because the debounce period would only start
   *   when the action gets its turn in the queue, which defeats the purpose of debouncing.
   *   Dispatching it with `debounce` throws a `StoreException`.
   *
   * - It should NOT be combined with `unlimitedRetryCheckInternet`. That feature aborts the
   *   dispatch while another action with the same key is in progress (and a queued action does
   *   count as in progress), so two actions of the same class would never queue behind each
   *   other. It also retries forever while holding the queue. Dispatching it with
   *   `unlimitedRetryCheckInternet` throws a `StoreException`.
   */
  sequential: boolean = false;

  /**
   * By default, all sequential actions share a single queue, whose key is `null`. Override
   * this method to return a different key, so that only actions with the same key wait for
   * each other. The returned value is used as the queue key itself.
   *
   * For example, here each user has its own queue:
   *
   * ```ts
   * class SaveUser extends KissAction<State> {
   *   sequential = true;
   *   constructor(readonly userId: string) { super(); }
   *   sequentialKeyParams() { return this.userId; }
   *   ...
   * }
   * ```
   *
   * You may also return the action class, so that only actions of the same class wait for
   * each other:
   *
   * ```ts
   * sequentialKeyParams() { return this.constructor; }
   * ```
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[1, 'A']` and `{ id: 1 }` are valid keys.
   */
  sequentialKeyParams(): any {
    return null;
  }

  /**
   * Called when this sequential action finishes with an error, with that error. Return `true`
   * to abort all the actions that are currently waiting in the same queue, behind this one.
   * They will not run their `before` and `reduce` methods, and will finish with an
   * `AbortDispatchException`. Actions dispatched after this action finished are not affected.
   *
   * The default is `false`: the queue continues with the next action.
   *
   * Note the `error` is the original error thrown by `before` or `reduce`, before being
   * processed by `wrapError`. It may be an `AbortDispatchException`, if this action was
   * aborted. You may want to keep the queue in that case:
   *
   * ```ts
   * discardQueueOnError(error: any) { return !(error instanceof AbortDispatchException); }
   * ```
   *
   * Note: If `discardQueueOnError()` throws an error, the error is logged, and the queue
   * continues with the next action.
   */
  discardQueueOnError(error: any): boolean {
    return false;
  }

  /**
   * Returns `true` while this sequential action is waiting for previous actions in its queue
   * to finish. Returns `false` before the action is dispatched, once it gets its turn, and
   * after it finishes.
   */
  get isWaitingInSequentialQueue(): boolean {
    return this._isWaitingInSequentialQueue;
  }

  /**
   * Returns `true` if this sequential action was aborted because a previous action in the
   * same queue failed and returned `true` from `discardQueueOnError()`, or because the queues
   * were reset with `store.clearInternalActionProps()` (or `store.setShutDown(true)`) while it
   * was waiting.
   */
  get wasDiscardedFromSequentialQueue(): boolean {
    return this._wasDiscardedFromSequentialQueue;
  }

  /**
   * For Kiss internal use only.
   * Set by the store while this sequential action waits for its turn in the queue.
   */
  _isWaitingInSequentialQueue: boolean = false;

  /**
   * For Kiss internal use only.
   * Set by the store when this sequential action is discarded from its queue.
   */
  _wasDiscardedFromSequentialQueue: boolean = false;

  /**
   * Set `poll` to periodically dispatch an action at a fixed interval. Usually, you add `poll`
   * as a constructor parameter of your action. For example:
   *
   * ```ts
   * class PollPrices extends KissAction<State> {
   *   constructor(readonly poll = Poll.once) { super(); }
   *
   *   createPollingAction() { return new PollPrices(); }
   *
   *   async reduce() {
   *     const prices = await api.getPrices();
   *     return (state: State) => state.copy({ prices });
   *   }
   * }
   * ```
   *
   * This is useful when you need to keep data fresh by fetching it from a server at regular
   * intervals, such as refreshing prices, checking for new messages, or monitoring wallet
   * balances.
   *
   * The `pollInterval` is the delay between polling ticks, in milliseconds. The default is
   * 10000 (10 seconds). You can change it:
   *
   * ```ts
   * pollInterval = 5 * 60 * 1000; // 5 minutes.
   * ```
   *
   * By default, polling runs never overlap: each tick waits for the previous run to finish
   * before the `pollInterval` starts counting for the next tick. See `pollWaitsForRun` if you
   * want ticks at a fixed rate instead.
   *
   * To start polling, dispatch the action with `Poll.start`.
   * To stop, dispatch with `Poll.stop`:
   *
   * ```ts
   * // Start polling (also runs reduce immediately):
   * dispatch(new PollPrices(Poll.start));
   *
   * // Stop polling:
   * dispatch(new PollPrices(Poll.stop));
   * ```
   *
   * To stop all polling at once (for example, on logout), without dispatching `Poll.stop` for
   * each key, call `stopAllPolling()` from any action. Polling also stops when you call
   * `store.clearInternalActionProps()`, or when the store is shut down with
   * `store.setShutDown(true)`, and is not restarted if you later turn the shutdown off.
   *
   * You can display loading states and errors in your components by tracking the action
   * class that does the work:
   *
   * ```tsx
   * const isWaiting = useIsWaiting(PollPrices);
   * const isFailed = useIsFailed(PollPrices);
   * ```
   *
   * If you use two separate action classes (see Option 2 below), track the worker action
   * instead of the polling controller.
   *
   * There are two ways to use polling:
   *
   * ## Option 1: Single action for everything
   *
   * Use one action class that both controls polling and does the work. The
   * `createPollingAction()` returns the same action class with `Poll.once` (or with no poll
   * parameter at all, since `Poll.once` is the default), so timer ticks run the action without
   * restarting the timer:
   *
   * ```ts
   * class LoadBalance extends KissAction<State> {
   *   constructor(readonly address: string, readonly poll = Poll.once) { super(); }
   *
   *   pollInterval = 5 * 60 * 1000;
   *
   *   createPollingAction() { return new LoadBalance(this.address); }
   *
   *   async reduce() {
   *     const balance = await api.getBalance(this.address);
   *     return (state: State) => state.copy({ balance });
   *   }
   * }
   *
   * // Run immediately without affecting the timer
   * dispatch(new LoadBalance(address));
   *
   * // Start polling
   * dispatch(new LoadBalance(address, Poll.start));
   *
   * // Stop polling
   * dispatch(new LoadBalance(address, Poll.stop));
   * ```
   *
   * ## Option 2: Separate action classes
   *
   * Use one action to control polling, and a different action to do the work. This is useful
   * when you want `isWaiting` and `isFailed` to track a different class than the polling
   * controller:
   *
   * ```ts
   * class PollBalance extends KissAction<State> {
   *   constructor(readonly address: string, readonly poll = Poll.start) { super(); }
   *
   *   pollInterval = 5 * 60 * 1000;
   *
   *   createPollingAction() { return new LoadBalance(this.address); }
   *
   *   async reduce() {
   *     await this.dispatchAndWait(new LoadBalance(this.address));
   *     return null;
   *   }
   * }
   *
   * class LoadBalance extends KissAction<State> {
   *   constructor(readonly address: string) { super(); }
   *
   *   async reduce() {
   *     const balance = await api.getBalance(this.address);
   *     return (state: State) => state.copy({ balance });
   *   }
   * }
   *
   * // Start polling:
   * dispatch(new PollBalance(address, Poll.start));
   *
   * // Check loading state of the worker action:
   * isWaiting(LoadBalance);
   *
   * // Stop polling:
   * dispatch(new PollBalance(address, Poll.stop));
   * ```
   *
   * ## Polling keys
   *
   * By default, each action class gets its own independent polling timer, keyed by its class.
   * This means all instances of the same action class share one timer. Note subclasses are
   * different classes, so they get their own timers.
   *
   * ### Using `pollingKeyParams()` to separate instances
   *
   * If you need separate polling timers per id, address, or some other field, override
   * `pollingKeyParams()`. Actions of the same class but with different `pollingKeyParams()`
   * values get independent timers.
   *
   * ```ts
   * class PollBalance extends KissAction<State> {
   *   constructor(readonly address: string, readonly poll = Poll.once) { super(); }
   *
   *   // Each address gets its own independent polling timer.
   *   pollingKeyParams() { return this.address; }
   *
   *   createPollingAction() { return new LoadBalance(this.address); }
   *
   *   async reduce() {
   *     await this.dispatchAndWait(new LoadBalance(this.address));
   *     return null;
   *   }
   * }
   *
   * // These start two independent polling timers:
   * dispatch(new PollBalance(address1, Poll.start));
   * dispatch(new PollBalance(address2, Poll.start));
   *
   * // Stop only address1:
   * dispatch(new PollBalance(address1, Poll.stop));
   * ```
   *
   * You can also return more than one field by using an array:
   *
   * ```ts
   * // Each (userId, walletId) pair gets its own timer.
   * pollingKeyParams() { return [this.userId, this.walletId]; }
   * ```
   *
   * ### Using `computePollingKey()` to share timers across action classes
   *
   * If you want different action classes to share the same polling timer, override
   * `computePollingKey()` and return any key you want:
   *
   * ```ts
   * class PollPrices extends KissAction<State> {
   *   computePollingKey() { return 'market-data'; }
   *   ...
   * }
   *
   * class PollVolumes extends KissAction<State> {
   *   computePollingKey() { return 'market-data'; } // Same key
   *   ...
   * }
   * ```
   *
   * With this setup, starting `PollPrices` and then `PollVolumes` means `PollVolumes` is a
   * no-op (the key is already active). Stopping either one cancels the shared timer.
   *
   * ## Poll values
   *
   * - `Poll.start`: Starts polling and runs `reduce` immediately.
   *   If polling is already active for this key, does nothing.
   *
   * - `Poll.stop`: Cancels the polling for this key and skips `reduce`.
   *
   * - `Poll.runNowAndRestart`: Runs `reduce` immediately and restarts the polling timer from
   *   that moment. If polling is not active, behaves like `Poll.start`.
   *
   * - `Poll.once`: Runs `reduce` immediately, without affecting the polling (it does not start
   *   or stop the polling).
   *
   * Note that, even when `reduce` is skipped, the action's `before` and `after` methods still
   * run, and the action completes without changing the state.
   *
   * ## Overlapping runs
   *
   * Instead of using a periodic timer, each run schedules the next one.
   *
   * By default (`pollWaitsForRun` is `true`), the action returned by `createPollingAction()`
   * is dispatched with `dispatchAndWait`, and the next tick is only scheduled when it
   * finishes. This means the polling interval is measured from the END of each run, runs never
   * overlap, and the actual period is `runDuration + pollInterval`. If a run takes longer than
   * the interval, ticks simply happen less often, instead of piling up.
   *
   * If you want ticks at a fixed rate instead, set `pollWaitsForRun` to `false`. Then the
   * action is dispatched with `dispatch`, the next tick is scheduled immediately, and the
   * interval is measured from the START of each run. In this case runs may overlap when they
   * take longer than the interval, so consider adding `nonReentrant`, `throttle` or
   * `sequential` to the action returned by `createPollingAction()`:
   *
   * ```ts
   * pollWaitsForRun = false;
   * ```
   *
   * ## Errors
   *
   * Errors don't stop the polling. If a run fails, the next tick is scheduled anyway, as if
   * the run had succeeded. This is also true for the immediate run of `Poll.start` and
   * `Poll.runNowAndRestart`: if it fails, the polling is started anyway.
   *
   * The ticks are dispatched like any other action, so their errors are processed as usual
   * (`wrapError`, `errorObserver`, etc). For example, a `UserException`
   * shows an error dialog, and `isFailed` becomes `true` for the tick's action class. An error
   * that is not swallowed is thrown as an unhandled rejection, like the error of any dispatch
   * nobody waits for.
   *
   * ## Add the other features to the TICK action, not to the controller
   *
   * IMPORTANT: Polling can be combined with `checkInternet`, `nonReentrant`, `throttle`,
   * `fresh` and `sequential`, but you should add those to the action returned by
   * `createPollingAction()`, and NOT to the action that starts and stops the polling.
   *
   * The reason is that all of those features can abort or fail a dispatch, and they can't tell
   * a `Poll.stop` apart from a regular tick. So, if you add them to the polling controller, a
   * `Poll.stop` dispatch may itself be aborted or fail, and you'd be unable to stop the
   * polling. For example:
   *
   * - With `throttle`, a `Poll.stop` dispatched inside the throttle period is silently
   *   ignored, and the polling keeps going.
   *
   * - With `nonReentrant`, a `Poll.stop` dispatched while a run is still in progress is
   *   silently ignored.
   *
   * - With `fresh`, a `Poll.stop` dispatched inside the fresh period is silently ignored.
   *
   * - With `checkInternet`, a `Poll.stop` dispatched while there is no internet fails in
   *   `before`, so it never reaches the reducer.
   *
   * - With `sequential`, a `Poll.stop` has to wait for its turn in the queue, so you could be
   *   unable to stop the polling while the queue is busy.
   *
   * Adding them to the tick action instead is both safe and more useful:
   *
   * ```ts
   * class PollBalance extends KissAction<State> {
   *   constructor(readonly poll = Poll.once) { super(); }
   *
   *   // The tick action is the one that checks the internet.
   *   createPollingAction() { return new LoadBalance(); }
   *   ...
   * }
   *
   * class LoadBalance extends KissAction<State> {
   *   checkInternet = { dialog: false };
   *   ...
   * }
   * ```
   *
   * Notes:
   * - The action must override `createPollingAction()`. Otherwise, dispatching it throws a
   *   `StoreException`.
   * - It can be combined with a custom `wrapReduce()`, which wraps the action's own reducer
   *   (when it runs).
   * - It should not be combined with `retry` or `debounce`, nor used in an
   *   `OptimisticCommand`. Dispatching it with those throws a `StoreException`.
   * - With the default `pollWaitsForRun` of `true`, ticks can't pile up, since a tick is only
   *   scheduled after the previous one finishes. Adding `nonReentrant`, `throttle` or
   *   `sequential` to the tick action only matters when `pollWaitsForRun` is `false`.
   * - An invalid `poll` or `pollInterval` value makes the dispatch throw a `StoreException`.
   * - When `poll` is `undefined` (the default), the action doesn't use polling.
   *
   * See also:
   * - `throttle` - If you want to limit how often an action runs, but don't need periodic
   *   repetition.
   * - `debounce` - If you want to wait for a pause in activity before running the action.
   * - `nonReentrant` - If you want to prevent overlapping executions of the same action.
   */
  declare poll?: Poll;

  /**
   * The delay between polling ticks, in milliseconds. The default is 10000 (10 seconds).
   * This is only used by actions that use polling (see `poll`).
   *
   * How this delay is measured depends on `pollWaitsForRun`:
   *
   * - When `pollWaitsForRun` is `true` (the default), the delay is measured from the moment
   *   the previous run FINISHES.
   *
   * - When `pollWaitsForRun` is `false`, the delay is measured from the moment the previous
   *   run STARTS.
   */
  declare pollInterval?: number;

  /**
   * Whether each polling tick must wait for the previous run to finish, before the next tick
   * is scheduled. The default is `true`. This is only used by actions that use polling (see
   * `poll`).
   *
   * - When `true` (the default), runs never overlap. The action returned by
   *   `createPollingAction()` is dispatched with `dispatchAndWait`, and only when it finishes
   *   does the `pollInterval` start counting for the next tick. In other words, the interval is
   *   measured from the END of each run, and the actual period is
   *   `runDuration + pollInterval`. This is what you usually want, as it prevents piling up
   *   requests when the server is slow.
   *
   * - When `false`, the next tick is scheduled as soon as the current one is dispatched,
   *   without waiting for it to finish. The action is dispatched with `dispatch`, the interval
   *   is measured from the START of each run, and the period is a fixed `pollInterval`. Use
   *   this only when you want ticks at a fixed rate, and you are fine with runs overlapping
   *   when they take longer than `pollInterval`. Consider adding `nonReentrant`, `throttle` or
   *   `sequential` to the action returned by `createPollingAction()`, to control what happens
   *   when runs overlap.
   *
   * Note this also applies to the immediate run done by `Poll.start` and
   * `Poll.runNowAndRestart`: when `true`, the first tick is only scheduled after that
   * immediate run finishes.
   */
  declare pollWaitsForRun?: boolean;

  /**
   * Must return a new action instance that the timer will dispatch on each tick. This can be
   * the same action class with `Poll.once`, or a completely different action class (see the
   * documentation of `poll` for both patterns).
   *
   * Every action that uses polling must override this method. Otherwise, dispatching it throws
   * a `StoreException`.
   */
  createPollingAction(): KissAction<St> {
    throw new StoreException(
      `Action ${this.constructor.name} uses polling, but doesn't override createPollingAction().`);
  }

  /**
   * By default, the polling key is based on the action class. All instances of the same action
   * class share one polling timer.
   *
   * Override this to give each instance its own timer based on some field:
   *
   * ```ts
   * // Each address gets its own polling timer.
   * pollingKeyParams() { return this.address; }
   *
   * // Each (userId, walletId) pair gets its own timer.
   * pollingKeyParams() { return [this.userId, this.walletId]; }
   * ```
   *
   * When `pollingKeyParams()` returns `null` (the default), the key is just the action class.
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents. For example, `[1, 'A']` and `{ id: 1 }` are valid params.
   */
  pollingKeyParams(): any {
    return null;
  }

  /**
   * Returns the key used to identify this action's polling timer.
   *
   * The default combines the action class with `pollingKeyParams()`:
   *
   * ```ts
   * computePollingKey() { return [this.constructor, this.pollingKeyParams()]; }
   * ```
   *
   * Override this for full control, for example to share a timer across different action
   * classes:
   *
   * ```ts
   * computePollingKey() { return 'shared-market-data'; }
   * ```
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   */
  computePollingKey(): any {
    return [this.constructor, this.pollingKeyParams()];
  }

  /**
   * Stops all polling at once, for all polling keys, as if `Poll.stop` was dispatched for each
   * of them. This is probably useful during logout or similar scenarios. Runs that are already
   * in progress still finish, but no new ticks are dispatched.
   */
  stopAllPolling(): void {
    this.store._stopAllPolling();
  }

  /**
   * For Kiss internal use only.
   * The delay between polling ticks in milliseconds, or `null` if the `pollInterval` value is
   * invalid (in which case the dispatch throws).
   */
  get _pollIntervalMillis(): number | null {
    const pollInterval: any = this.pollInterval;
    if (pollInterval === undefined) return 10000;
    if (typeof pollInterval === 'number' && Number.isFinite(pollInterval) && pollInterval >= 0) return pollInterval;
    return null;
  }

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
   * - Calling `store.clearInternalActionProps()` (for example, on logout), or shutting down the
   *   store with `store.setShutDown(true)`, stops the retries. The action is then aborted with
   *   an `AbortDispatchException`, so it doesn't fail.
   *
   * - If the `before` method throws an error, the retry will NOT happen.
   *
   * - Combining `retry` with `checkInternet` will not retry when there is no internet. It will
   *   only retry if there IS internet but the action fails for some other reason. To retry
   *   indefinitely until internet is available, use `unlimitedRetryCheckInternet` instead,
   *   which can't be combined with `retry`.
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
   *
   * - It can be combined with `sequential`. The retries then happen while the action holds
   *   the queue, which delays the actions waiting behind it.
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
   * If the delay exceeds the given `maxDelay` (by default, the retry `maxDelay`), it will be set
   * to `maxDelay`.
   */
  _nextRetryDelay(maxDelay: number = this._retry.maxDelay): number {
    const retry = this._retry;

    retry.currentDelay = (retry.currentDelay == null)
      ? retry.initialDelay
      : retry.currentDelay * retry.multiplier;

    if (retry.currentDelay > maxDelay) retry.currentDelay = maxDelay;

    return retry.currentDelay;
  }

  /**
   * Set `unlimitedRetryCheckInternet` to `true` to check if there is internet when you run some
   * action that needs it. If there is no internet, the action will abort silently, and then retry
   * the `reduce` method unlimited times, until there is internet. It will also retry if there is
   * internet but the action failed. For example:
   *
   * ```ts
   * class LoadText extends KissAction<State> {
   *   unlimitedRetryCheckInternet = true;
   *
   *   async reduce() {
   *     const response = await fetch('https://swapi.dev/api/people/42/');
   *     const json = await response.json();
   *     return (state: State) => state.copy({ text: json.name ?? 'Unknown' });
   *   }
   * }
   * ```
   *
   * IMPORTANT: This combines `retry` (with unlimited retries), `checkInternet` and
   * `nonReentrant`, but there is a difference. Combining `retry` with `checkInternet` will not
   * retry when there is no internet. It will only retry if there IS internet but the action fails
   * for some other reason. To retry indefinitely until internet is available, you should use
   * `unlimitedRetryCheckInternet`.
   *
   * The action is non-reentrant: while it is running, dispatching another one with the same
   * non-reentrant key is aborted silently. Since it keeps retrying until it succeeds, this
   * non-reentrant period lasts the whole time from when the action is dispatched until it
   * succeeds, including the waits between retries. As with `nonReentrant`, the key is based on
   * the action class by default. Override `nonReentrantKeyParams()` so that actions of the same
   * class but with different parameters don't block each other, or `computeNonReentrantKey()`
   * so that different action classes share the same key. These keys are shared with
   * `nonReentrant` actions and `OptimisticCommand`s.
   *
   * The retry parameters, and their default values, are:
   *
   * - `initialDelay`: The delay before the first retry attempt. Default is `350` milliseconds.
   * - `multiplier`: The factor by which the delay increases for each subsequent retry.
   *   Default is `2`. A `multiplier` of `1` keeps the delay constant.
   * - `maxDelay`: The maximum delay between retries to avoid excessively long wait times.
   *   This is for errors that are not related to the internet. Default is `5000` milliseconds.
   * - `maxDelayNoInternet`: The maximum delay between retries when there is no internet.
   *   Default is `1000` milliseconds.
   *
   * You can change one or more of the default values. Doing so also turns it on:
   *
   * ```ts
   * class LoadText extends KissAction<State> {
   *   unlimitedRetryCheckInternet = { initialDelay: 100, maxDelayNoInternet: 3000 };
   *   ...
   * }
   * ```
   *
   * Invalid values (for example, a `multiplier` below `1`, or a negative delay) make the
   * dispatch throw a `StoreException` that explains the problem.
   *
   * The internet is checked before each attempt, with the `hasInternet()` method. Override it to
   * customize how the internet connection is checked, or to simulate the internet as on or off
   * during tests. IMPORTANT: By default, it only checks if the internet is on or off on the
   * device, not if the internet provider is really providing the service or if the server is
   * available. So, it is possible that the check succeeds and the request still fails.
   *
   * Notes:
   * - If you `await dispatchAndWait(action)`, it only finishes when the action succeeds, and
   *   this may take a long time (or never happen) if there is no internet, or if it keeps failing.
   * - Calling `store.clearInternalActionProps()` (for example, on logout), or shutting down the
   *   store with `store.setShutDown(true)`, stops the retries. The action is then aborted with
   *   an `AbortDispatchException`, so it doesn't fail.
   * - Make sure your `before` method does not throw an error, or the retry will NOT happen.
   * - It only works with ASYNC reducers, that return `Promise<(state: St) => St>`, just like
   *   `retry`. Dispatching it with a SYNC reducer fails with a `StoreException`.
   * - An action that aborts itself by throwing an `AbortDispatchException` is not retried.
   * - All retries are logged (see `Store.log`), including the action, the attempt, and if the
   *   problem was no internet or not.
   * - If necessary, you can know the current "attempt number" by using `this.attempts`.
   *   Attempts that found no internet count too.
   * - It should not be combined with `retry`, `checkInternet` or `nonReentrant`, since it
   *   already does what they do, nor with `debounce`, `throttle`, `fresh` or polling, nor used in
   *   an `OptimisticCommand`. Doing so throws a `StoreException`. When polling, add it to the
   *   action returned by `createPollingAction()` instead.
   * - It should not be combined with `sequential`. It aborts the dispatch while another action
   *   with the same key is in progress (and a queued action does count as in progress), so two
   *   actions of the same class would never queue behind each other. It also retries forever
   *   while holding the queue. Doing so throws a `StoreException`.
   */
  declare unlimitedRetryCheckInternet?: boolean | UnlimitedRetryCheckInternet;

  /**
   * For Kiss internal use only.
   * True if `unlimitedRetryCheckInternet` is turned on. Note this doesn't validate it, which
   * only happens when the action is dispatched.
   */
  get _isUnlimitedRetryCheckInternet(): boolean {
    const value: any = this.unlimitedRetryCheckInternet;
    return value === true || (typeof value === 'object' && value !== null);
  }

  /**
   * For Kiss internal use only.
   * The maximum delay between retries when there is no internet, for actions that use
   * `unlimitedRetryCheckInternet`. Set when the action is dispatched.
   */
  _maxDelayNoInternet: number = 1000;

  /**
   * For Kiss internal use only.
   * Checks the internet connection with the (protected) `hasInternet()` method, unless it's
   * being simulated with `internetOnOffSimulation`, which takes precedence. Used by
   * `checkInternet` and `unlimitedRetryCheckInternet`.
   */
  _hasInternet(): Promise<boolean> {
    const simulation = this.internetOnOffSimulation;
    if (simulation === true || simulation === false) return Promise.resolve(simulation);
    return this.hasInternet();
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

    const debounce: any = this.debounce;
    if (debounce !== undefined && typeof debounce !== 'boolean' &&
      !(typeof debounce === 'number' && Number.isFinite(debounce) && debounce >= 0))
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid debounce: ` +
        `it must be a boolean, or a number >= 0 (milliseconds), but got ` +
        `${typeof debounce === 'string' ? `"${debounce}"` : String(debounce)}.`);

    if (this._debounceMillis !== null && this.ifRetryIsOn)
      throw new StoreException(
        `Action ${this.constructor.name} uses both debounce and retry, which can't be combined. ` +
        'Remove one of them.');

    const throttle: any = this.throttle;
    if (throttle !== undefined && typeof throttle !== 'boolean' && this._throttleMillis === null)
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid throttle: ` +
        `it must be a boolean, or a number >= 0 (milliseconds), but got ` +
        `${typeof throttle === 'string' ? `"${throttle}"` : String(throttle)}.`);

    if (this._throttleMillis !== null && this.nonReentrant)
      throw new StoreException(
        `Action ${this.constructor.name} uses both throttle and nonReentrant, which can't be combined. ` +
        'Remove one of them.');

    const fresh: any = this.fresh;
    if (fresh !== undefined && typeof fresh !== 'boolean' && this._freshMillis === null)
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid fresh: ` +
        `it must be a boolean, or a number >= 0 (milliseconds), but got ` +
        `${typeof fresh === 'string' ? `"${fresh}"` : String(fresh)}.`);

    if (this._freshMillis !== null && this.nonReentrant)
      throw new StoreException(
        `Action ${this.constructor.name} uses both fresh and nonReentrant, which can't be combined. ` +
        'Remove one of them.');

    if (this._freshMillis !== null && this._throttleMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} uses both fresh and throttle, which can't be combined. ` +
        'Remove one of them.');

    const checkInternet: any = this.checkInternet;
    if (checkInternet && checkInternet.abort === true && checkInternet.dialog !== undefined)
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid checkInternet: ` +
        'it can\'t have both `dialog` and `abort: true`. Remove one of them.');

    if (this.sequential && this._debounceMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} uses both sequential and debounce, which can't be combined. ` +
        'Remove one of them.');

    if (this.poll !== undefined) this._validatePolling();

    if (this.unlimitedRetryCheckInternet !== undefined) this._injectUnlimitedRetryCheckInternet();
  }

  /**
   * Throws a `StoreException` if this action uses `unlimitedRetryCheckInternet` in a way that is
   * not allowed. Otherwise, if it's on, sets up its retry options.
   */
  private _injectUnlimitedRetryCheckInternet() {
    const value: any = this.unlimitedRetryCheckInternet;
    const name = this.constructor.name;

    if (typeof value !== 'boolean' && (typeof value !== 'object' || value === null || Array.isArray(value)))
      throw new StoreException(
        `Action ${name} has an invalid unlimitedRetryCheckInternet: ` +
        `it must be a boolean, or an object with the retry options, but got ` +
        `${typeof value === 'string' ? `"${value}"` : String(value)}.`);

    if (!this._isUnlimitedRetryCheckInternet) return;

    const options: UnlimitedRetryCheckInternet = (value === true) ? {} : value;

    const isNumber = (v: any) => typeof v === 'number' && Number.isFinite(v);
    const check = (option: keyof UnlimitedRetryCheckInternet, isValid: (v: any) => boolean, rule: string) => {
      const optionValue = options[option];
      if (optionValue !== undefined && !isValid(optionValue))
        throw new StoreException(
          `Action ${name} has an invalid unlimitedRetryCheckInternet option: ` +
          `unlimitedRetryCheckInternet.${option} ${rule}, but got ` +
          `${typeof optionValue === 'string' ? `"${optionValue}"` : String(optionValue)}.`);
    };

    check('initialDelay', v => isNumber(v) && v >= 0, 'must be a number >= 0 (milliseconds)');
    check('maxDelay', v => isNumber(v) && v >= 0, 'must be a number >= 0 (milliseconds)');
    check('maxDelayNoInternet', v => isNumber(v) && v >= 0, 'must be a number >= 0 (milliseconds)');
    check('multiplier', v => isNumber(v) && v >= 1, 'must be a number >= 1 (use 1 for a constant delay)');

    const incompatible = (feature: string, isUsed: boolean, hint = 'Remove one of them.') => {
      if (isUsed)
        throw new StoreException(
          `Action ${name} uses both unlimitedRetryCheckInternet and ${feature}, which can't be combined. ` +
          hint);
    };

    const already = (feature: string) => `Remove its \`${feature}\` property, since unlimitedRetryCheckInternet already does that.`;
    incompatible('retry', this.ifRetryIsOn, already('retry'));
    incompatible('checkInternet', !!this.checkInternet, already('checkInternet'));
    incompatible('nonReentrant', this.nonReentrant, already('nonReentrant'));
    incompatible('debounce', this._debounceMillis !== null);
    incompatible('throttle', this._throttleMillis !== null);
    incompatible('fresh', this._freshMillis !== null);
    incompatible('sequential', this.sequential);
    incompatible('polling', this.poll !== undefined,
      'Remove one of them, or add unlimitedRetryCheckInternet to the action returned by createPollingAction().');

    if (this instanceof OptimisticCommand)
      throw new StoreException(
        `Action ${name} is an OptimisticCommand, which can't use unlimitedRetryCheckInternet. ` +
        'Remove its `unlimitedRetryCheckInternet` property.');

    const { initialDelay, multiplier, maxDelay, maxDelayNoInternet } = options;
    this._retry = {
      ...this._retry,
      ...(initialDelay !== undefined && { initialDelay }),
      ...(multiplier !== undefined && { multiplier }),
      ...(maxDelay !== undefined && { maxDelay }),
      unlimitedRetries: true,
    };
    if (maxDelayNoInternet !== undefined) this._maxDelayNoInternet = maxDelayNoInternet;
  }

  /**
   * Throws a `StoreException` if this action uses polling in a way that is not allowed.
   */
  private _validatePolling() {
    const poll: any = this.poll;
    if (!Object.values(Poll).includes(poll))
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid poll: ` +
        `it must be Poll.start, Poll.stop, Poll.runNowAndRestart or Poll.once, but got ` +
        `${typeof poll === 'string' ? `"${poll}"` : String(poll)}.`);

    if (this.createPollingAction === KissAction.prototype.createPollingAction)
      throw new StoreException(
        `Action ${this.constructor.name} uses polling, but doesn't override createPollingAction().`);

    const pollInterval: any = this.pollInterval;
    if (this._pollIntervalMillis === null)
      throw new StoreException(
        `Action ${this.constructor.name} has an invalid pollInterval: ` +
        `it must be a number >= 0 (milliseconds), but got ` +
        `${typeof pollInterval === 'string' ? `"${pollInterval}"` : String(pollInterval)}.`);

    if (this.ifRetryIsOn)
      throw new StoreException(
        `Action ${this.constructor.name} uses both polling and retry, which can't be combined. ` +
        'Remove one of them, or add the retry to the action returned by createPollingAction().');

    if (this._debounceMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} uses both polling and debounce, which can't be combined. ` +
        'Remove one of them.');

    if (this instanceof OptimisticCommand)
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use polling. ` +
        'Remove its `poll` property.');
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
    isDispatchAborted?: boolean,
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
      if (!key.startsWith('_') && (key != 'nonReentrant') && (key != 'retry') && (key != 'checkInternet') && (key != 'wrapReduce') && (key != 'debounce') && (key != 'throttle') && (key != 'removeThrottleLockOnError') && (key != 'fresh') && (key != 'sequential') && (key != 'pollInterval') && (key != 'pollWaitsForRun') && (key != 'unlimitedRetryCheckInternet')) { // Continue to exclude base class/internal fields
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
   * Is true if the dispatch of the action was aborted:
   * - Because `abortDispatch()` returned `true`.
   * - Because the action is `nonReentrant` (or an `OptimisticCommand`), and another action
   *   with the same non-reentrant key was running.
   * - Because of its `throttle` period, or because its `fresh` data was still fresh.
   * - Because it was mocked as `null`, or the store was shut down.
   * - Because an `AbortDispatchException` was thrown by the action's `before` or `reduce`
   *   methods. This includes a `sequential` action discarded from its queue.
   *
   * Note in the last case the action was dispatched and finished (the `after` method ran),
   * but in the other cases it was never dispatched (`isDispatched` is `false`).
   */
  readonly isDispatchAborted: boolean;

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
   * will still be processed by the action's `wrapError` and the `errorObserver`. However,
   * if `originalError` is non-null, it means the reducer did not finish running.
   *
   * If the action was aborted by throwing an `AbortDispatchException`, this holds that
   * exception (which is not processed by `wrapError` and the `errorObserver`).
   */
  readonly originalError: any;

  /**
   * Holds the error thrown by the action. This may or may not be the same as `originalError`,
   * because any errors thrown by the action's before/reduce methods may still be changed or
   * cancelled by the action's `wrapError` and the `errorObserver`. This is the final error
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
   *
   * Note this is also true when the action was aborted by throwing an
   * `AbortDispatchException`. In that case, `isDispatchAborted` is also true.
   */
  get isCompletedFailed(): boolean {
    return this.isCompleted && (this.originalError != null);
  }

  constructor(params: {
    isDispatched?: boolean,
    isDispatchAborted?: boolean,
    hasFinishedMethodBefore?: boolean,
    hasFinishedMethodReduce?: boolean,
    hasFinishedMethodAfter?: boolean,
    originalError?: any,
    wrappedError?: any,
  } = {}) {
    this.isDispatched = params.isDispatched ?? false;
    this.isDispatchAborted = params.isDispatchAborted ?? false;
    this.hasFinishedMethodBefore = params.hasFinishedMethodBefore ?? false;
    this.hasFinishedMethodReduce = params.hasFinishedMethodReduce ?? false;
    this.hasFinishedMethodAfter = params.hasFinishedMethodAfter ?? false;
    this.originalError = params.originalError ?? null;
    this.wrappedError = params.wrappedError ?? null;
  }

  copy(params: {
    isDispatched?: boolean,
    isDispatchAborted?: boolean,
    hasFinishedMethodBefore?: boolean,
    hasFinishedMethodReduce?: boolean,
    hasFinishedMethodAfter?: boolean
    originalError?: any,
    wrappedError?: any,
  }) {
    return new ActionStatus({
      isDispatched: params.isDispatched ?? this.isDispatched,
      isDispatchAborted: params.isDispatchAborted ?? this.isDispatchAborted,
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
 * `checkInternet` is `{ dialog: true }`), or is silently aborted (if `checkInternet` is
 * `{ abort: true }`).
 *
 * Notes:
 *
 * - The default rollback check compares values with `Object.is` (which is the same as `===`,
 *   except that `NaN` is equal to `NaN`). So, make sure `getValueFromState` returns the same
 *   object you applied, or override `shouldRollback`.
 * - It can be combined with `retry` and `checkInternet`.
 * - It can be combined with `sequential`. Note the optimistic value is then only applied to
 *   the state when the action gets its turn in the queue, and not as soon as the action is
 *   dispatched.
 * - It should not be combined with `nonReentrant` (it's already non-reentrant), nor with
 *   unlimited retries (a command that never finishes would never release its non-reentrant
 *   key), nor with `debounce` or `throttle`. Dispatching it with those throws a `StoreException`.
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
        // An aborted command is not retried.
        if (error instanceof AbortDispatchException) throw error;
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

    if (this._debounceMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use debounce. ` +
        'Remove its `debounce` property.');

    if (this._throttleMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use throttle. ` +
        'Remove its `throttle` property.');

    if (this._freshMillis !== null)
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use fresh. ` +
        'Remove its `fresh` property.');

    if (this.ifRetryIsOn && (this._retry.unlimitedRetries || this._retry.maxRetries === -1))
      throw new StoreException(
        `Action ${this.constructor.name} is an OptimisticCommand, which can't use unlimited retries. ` +
        'Use a `retry.maxRetries` of 0 or more.');
  }
}

/**
 * The `OptimisticSync` abstract class is for actions where user interactions (like toggling a
 * "like" button) should update the UI immediately and send the updated value to the server,
 * making sure the server and the UI are eventually consistent.
 *
 * ---
 *
 * The action is not throttled or debounced in any way, and every dispatch applies an optimistic
 * update to the state immediately. This guarantees a very good user experience, because there
 * is immediate feedback on every interaction.
 *
 * However, while the first updated value (created by the first time the action is dispatched)
 * is immediately sent to the server, any other value changes that occur while the first request
 * is in flight will NOT be sent immediately.
 *
 * Instead, when the first request completes, it checks if the state is still the same as the
 * value that was sent. If not, a follow-up request is sent with the latest value. This process
 * repeats until the state stabilizes.
 *
 * Note this guarantees that only **one** request is in flight at a time per key, potentially
 * reducing the number of requests sent to the server while still coalescing intermediate
 * changes.
 *
 * Optionally:
 *
 * - If the server responds with a value, that value is applied to the state. This is useful
 *   when the server normalizes or modifies values.
 *
 * - When the state finally stabilizes and the request finishes, `onFinish` is called, allowing
 *   you to perform side effects.
 *
 * - In special, if the last request fails, the optimistic state remains, but in `onFinish` you
 *   can then load the current state from the server, or handle the error as you see fit, by
 *   returning a state that will be applied.
 *
 * In other words, it makes it easy for you to maintain perfect UI responsiveness while
 * minimizing server load, and making sure the server and the UI eventually agree on the same
 * value.
 *
 * Note: It's not built for commands that must run once per dispatch (create, delete, submit,
 * upload, checkout...). For those, use `OptimisticCommand`.
 *
 * Note: If your app receives server pushes (WebSockets, Server-Sent Events, Firebase) that may
 * change the same value, use `OptimisticSyncWithPush` instead.
 *
 * ---
 *
 * ## How it works
 *
 * 1. **Immediate UI feedback**: Every dispatch applies `valueToApply()` to the state
 *    immediately, using `applyOptimisticValueToState`.
 *
 * 2. **Single in-flight request**: Only one request runs at a time per key (see
 *    `optimisticSyncKeyParams()`). The first dispatch takes the key and calls
 *    `sendValueToServer` to send a request to the server.
 *
 * 3. **Follow-up requests**: If the store state changed while a request started by
 *    `sendValueToServer` was in flight (for example, the user tapped a "like" button again while
 *    the first request was pending), a follow-up request is automatically sent after the current
 *    one completes. The change is detected by comparing `getValueFromState` with the value that
 *    was sent (see `ifShouldSendAnotherRequest`).
 *
 * 4. **No unnecessary requests**: If, while the request is in flight, the state changes but then
 *    returns to the same value as before (for example, the user tapped a "like" button again
 *    TWICE while the first request was pending), `getValueFromState` matches the sent value, and
 *    no follow-up request is needed.
 *
 * 5. **Server response handling**: If `sendValueToServer` returns a value (not `null` or
 *    `undefined`), it's applied to the state using `applyServerResponseToState`, when the state
 *    stabilizes. This is optional but useful.
 *
 * 6. **Completion callback**: When the synchronization for this key finishes, `onFinish` is
 *    called. On success, it runs after the state is stable (no follow-up needed) and the key has
 *    been released. On failure, it runs right after the request fails and the key is released,
 *    and then the action fails with the error.
 *
 * ```
 * State: liked = false (server confirmed)
 *
 * User taps LIKE:
 *   → State: liked = true (optimistic)
 *   → Key taken, Request 1 sends: setLiked(true)
 *
 * User taps UNLIKE (Request 1 still in flight):
 *   → State: liked = false (optimistic)
 *   → No request sent (key is taken)
 *
 * User taps LIKE (Request 1 still in flight):
 *   → State: liked = true (optimistic)
 *   → No request sent (key is taken)
 *
 * Request 1 completes:
 *   → Sent value was `true`, current state is `true`
 *   → They match, no follow-up needed, key released
 * ```
 *
 * If the state had been `false` when Request 1 completed, a follow-up Request 2 would
 * automatically be sent with `false`.
 *
 * ## How to use it
 *
 * Extend `OptimisticSync` instead of your base action, and DO NOT implement `reduce()`.
 * Instead, you must provide:
 *
 * - `valueToApply()` returns the value to apply optimistically, and then send to the server.
 * - `applyOptimisticValueToState(state, optimisticValue)` applies the value to the state.
 * - `getValueFromState(state)` reads the value from the state (to detect if a follow-up is needed).
 * - `sendValueToServer(value)` sends the value to the server.
 *
 * And optionally:
 *
 * - `optimisticSyncKeyParams()` so that different items can have concurrent requests.
 * - `applyServerResponseToState(state, serverResponse)` applies the server response to the state.
 * - `onFinish(error)` runs when the synchronization finishes, with or without errors.
 * - `ifShouldSendAnotherRequest` and `maxFollowUpRequests`, to customize the follow-ups.
 *
 * ```ts
 * class ToggleLike extends OptimisticSync<State, boolean> {
 *   constructor(readonly itemId: string) { super(); }
 *
 *   // Different items can have concurrent requests.
 *   optimisticSyncKeyParams() { return this.itemId; }
 *
 *   // The new value to apply (toggle the current state).
 *   valueToApply() { return !this.state.items.get(this.itemId).liked; }
 *
 *   // Apply the optimistic value to the state.
 *   applyOptimisticValueToState(state: State, isLiked: boolean) {
 *     return state.copy({ items: state.items.setLiked(this.itemId, isLiked) });
 *   }
 *
 *   // Read the current value from the state (used to detect if a follow-up is needed).
 *   getValueFromState(state: State) { return state.items.get(this.itemId).liked; }
 *
 *   // Send the value to the server, and optionally return the server-confirmed value.
 *   async sendValueToServer(isLiked: boolean) {
 *     const response = await api.setLiked(this.itemId, isLiked);
 *     return response.liked; // Or return null if the server doesn't return a value.
 *   }
 *
 *   // Apply the server response to the state (can be different from the optimistic value).
 *   applyServerResponseToState(state: State, liked: boolean) {
 *     return state.copy({ items: state.items.setLiked(this.itemId, liked) });
 *   }
 *
 *   // Called when the state stabilizes (optional). Return a state to apply, or null.
 *   async onFinish(error: any) {
 *     if (error !== null) {
 *       // Handle the error: reload from the server to restore the correct state.
 *       const reloaded = await api.getItem(this.itemId);
 *       return this.state.copy({ items: this.state.items.update(this.itemId, reloaded) });
 *     }
 *     return null; // Success, no state change needed.
 *   }
 * }
 * ```
 *
 * ## Server response handling
 *
 * `sendValueToServer` can return a value from the server. If it's not `null` or `undefined`,
 * this value is applied to the state **only when the state stabilizes** (no pending changes).
 * This is useful when:
 * - The server normalizes or modifies values.
 * - You want to confirm the server accepted the change.
 * - The server returns the current state after the update.
 *
 * The server response is applied as is, and doesn't start a follow-up request.
 *
 * ## Error handling
 *
 * On failure, the optimistic state remains, `onFinish` is called with the error, and then the
 * action fails with the error. There are no follow-up requests after a failure.
 *
 * ## Difference from other features
 *
 * - **vs `debounce`**: Debounce waits for inactivity before sending *any* request.
 *   `OptimisticSync` sends the first request immediately, and only coalesces subsequent changes.
 *
 * - **vs `nonReentrant`**: NonReentrant aborts subsequent dispatches entirely. `OptimisticSync`
 *   applies the optimistic update and, if needed, sends a follow-up request.
 *
 * - **vs `OptimisticCommand`**: An `OptimisticCommand` runs once per dispatch, rolls back on
 *   failure, and is non-reentrant, so it aborts the dispatches made while it's running.
 *   `OptimisticSync` is designed for rapid toggling, where only the final value matters.
 *
 * ## Rollback support
 *
 * Two fields help with rollback logic in `onFinish`:
 *
 * - `optimisticValue`: The value returned by `valueToApply()` for this dispatch. It's set once
 *   when the reducer starts, and remains available until the action finishes, including in
 *   `onFinish`.
 *
 * - `lastSentValue`: The most recent value passed to `sendValueToServer`. Updated right before
 *   each server request. Useful for debugging and logging.
 *
 * Example rollback guard using `optimisticValue`:
 *
 * ```ts
 * async onFinish(error: any) {
 *   if (error !== null) {
 *     // Only roll back if the state still reflects our optimistic update.
 *     // If the user made another change, don't overwrite it.
 *     if (this.getValueFromState(this.state) === this.optimisticValue) {
 *       return this.applyOptimisticValueToState(this.state, this.getValueFromState(this.initialState));
 *     }
 *   }
 *   return null;
 * }
 * ```
 *
 * Note `initialState` is the state when the action that sends the requests was dispatched.
 * If some of its requests succeeded before one failed, the server may already have a newer
 * value. That's why reloading is usually a safer choice than rolling back.
 *
 * Another possibility is to use `onFinish` to reload the value from the server. For example:
 *
 * ```ts
 * async onFinish(error: any) {
 *   try {
 *     const fresh = await api.fetchValue(this.itemId);
 *     return this.applyServerResponseToState(this.state, fresh);
 *   } catch (_) {
 *     return null; // Ignore reload failures and keep the current state.
 *   }
 * }
 * ```
 *
 * ## Which dispatch sends the requests
 *
 * Only the dispatch that took the key sends the requests (including the follow-ups), and only
 * it waits for them: `dispatchAndWait` waits until the state stabilizes, and `isWaiting` is
 * `true` meanwhile. The dispatches made while the key is taken apply their optimistic value,
 * and then finish right away.
 *
 * ## Clearing
 *
 * `store.clearInternalActionProps()` (which is also called by `store.setShutDown(true)`)
 * releases all keys at once, which is useful on logout. The dispatches made from then on take
 * the key again, and send their own requests. An action whose request was in flight when the
 * keys were released stops when that request finishes: it doesn't send follow-up requests,
 * doesn't apply the server response, and doesn't call `onFinish`. It's aborted with an
 * `AbortDispatchException`, so it doesn't fail, and doesn't show errors.
 *
 * Notes:
 * - It can be combined with `checkInternet`, both `{ dialog: true | false }` and
 *   `{ abort: true }`. If there is no internet, the optimistic value is not applied, and no
 *   request is sent.
 * - It should not be combined with `nonReentrant`, `retry`, `unlimitedRetryCheckInternet`,
 *   `debounce`, `throttle`, `fresh` or polling. Dispatching it with those throws a
 *   `StoreException`.
 * - It should not be combined with `sequential`, which throws a `StoreException` too.
 *   `OptimisticSync` needs dispatches to overlap: it applies the optimistic value as soon as the
 *   action is dispatched, and coalesces the dispatches made while a request is in flight into a
 *   single follow-up request. With `sequential`, the UI would stop responding immediately, and
 *   nothing would ever be coalesced. Note `OptimisticSync` already guarantees a single
 *   in-flight request per key, so you don't need `sequential` to serialize the requests.
 */
export abstract class OptimisticSync<St, T = any> extends KissAction<St> {

  /**
   * The optimistic value that was applied to the state by this dispatch. It's set once, when
   * the reducer starts, to the value returned by `valueToApply()`, and remains available in
   * `onFinish` for rollback logic.
   */
  optimisticValue!: T;

  /**
   * The most recent value that was passed to `sendValueToServer`. It's updated right before
   * each server request (including follow-ups), and is `undefined` if this dispatch sent no
   * request (because another dispatch was already sending them). Useful for debugging, logging,
   * or implementing custom guards.
   */
  lastSentValue: T | undefined = undefined;

  /**
   * Safety limit for the number of follow-up requests, to avoid infinite loops. If the state is
   * still changing after this many follow-ups, the action fails with a `StoreException`.
   * Use `-1` for no limit. The default is 10000.
   */
  maxFollowUpRequests: number = 10000;

  /**
   * Optionally, override `optimisticSyncKeyParams()` to differentiate the coalescing by the
   * action parameters. For example, if you have a like button per item, return the item ID, so
   * that different items can have concurrent requests:
   *
   * ```ts
   * optimisticSyncKeyParams() { return this.itemId; }
   * ```
   *
   * You can also return an array of values:
   *
   * ```ts
   * optimisticSyncKeyParams() { return [this.userId, this.itemId]; }
   * ```
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   *
   * Important: If the action changes a different part of the state depending on its fields,
   * make the key depend on them too. Otherwise, while `ToggleLike('A')` has a request in flight,
   * `ToggleLike('B')` changes the state but doesn't send its own request, and the follow-up of
   * `ToggleLike('A')` only checks item A, so item B may never be sent to the server.
   *
   * See also: `computeOptimisticSyncKey()`, which uses this method by default to build the key.
   */
  optimisticSyncKeyParams(): any {
    return null;
  }

  /**
   * By default, the coalescing key combines the action class with `optimisticSyncKeyParams()`.
   * Override this method if you want different action classes to share the same coalescing key.
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared by
   * their contents.
   */
  computeOptimisticSyncKey(): any {
    return [this.constructor, this.optimisticSyncKeyParams()];
  }

  /**
   * Return the value that should be applied optimistically to the state, and then sent to the
   * server. This is called synchronously, and only once per dispatch, when the reducer starts.
   *
   * The value to apply can be anything, and is usually constructed from the action fields,
   * and/or from the current `state`. Valid examples are:
   *
   * ```ts
   * // Set the like button to "liked".
   * valueToApply() { return true; }
   *
   * // Set the like button to "liked" or "not liked", according to
   * // the field `isLiked` of the action.
   * valueToApply() { return this.isLiked; }
   *
   * // Toggle the current state of the like button.
   * valueToApply() { return !this.state.items.get(this.itemId).liked; }
   * ```
   */
  abstract valueToApply(): T;

  /**
   * Return a new state where the given `optimisticValue` is applied to the given `state`.
   *
   * Note, Kiss calculates `optimisticValue` by previously calling `valueToApply()`.
   *
   * ```ts
   * applyOptimisticValueToState(state: State, isLiked: boolean) {
   *   return state.copy({ items: state.items.setLiked(this.itemId, isLiked) });
   * }
   * ```
   */
  abstract applyOptimisticValueToState(state: St, optimisticValue: T): St;

  /**
   * Return the value from the given `state`. It's compared with the value that was sent to the
   * server, to determine if a follow-up request is needed.
   *
   * Here is the rationale: When a request completes, if the value in the state is different from
   * the value that was sent, it means the user changed it again while the request was in flight,
   * so a follow-up request is needed to sync the latest value with the server.
   *
   * ```ts
   * getValueFromState(state: State) { return state.items.get(this.itemId).liked; }
   * ```
   */
  abstract getValueFromState(state: St): T;

  /**
   * Send the given `value` to the server, and optionally return the server's response.
   *
   * The first request sends the `optimisticValue` (calculated by previously calling
   * `valueToApply()`). But the value in the store state may change while the request is in
   * flight. For example, if the user presses a like button once, but then presses it again
   * before the first request finishes, the value in the store state is now different from the
   * value that was sent. In this case, `sendValueToServer` will be called again, with the value
   * from the state, to create a follow-up request to sync the updated state with the server.
   *
   * If `sendValueToServer` returns a value that is not `null` or `undefined`, that value will be
   * passed to `applyServerResponseToState`, but **only when the state stabilizes** (when there
   * are no more pending requests and the key is about to be released). This prevents the server
   * response from overwriting subsequent user interactions that occurred while the request was
   * in flight.
   *
   * If `sendValueToServer` returns `null` or `undefined`, the current optimistic state is
   * assumed to be correct and valid.
   *
   * ```ts
   * async sendValueToServer(isLiked: boolean) {
   *   const response = await api.setLiked(this.itemId, isLiked);
   *   return response?.liked; // Return the server-confirmed value, or null.
   * }
   * ```
   */
  abstract sendValueToServer(value: T): Promise<any>;

  /**
   * Override `applyServerResponseToState` to return a new state, where the given
   * `serverResponse` (previously received from the server when running `sendValueToServer`) is
   * applied to the current `state`. Example:
   *
   * ```ts
   * applyServerResponseToState(state: State, serverResponse: Response) {
   *   return state.copy({ items: state.items.setLiked(this.itemId, serverResponse.isLiked) });
   * }
   * ```
   *
   * Note `serverResponse` is never `null` or `undefined` here, because this method is only
   * called when `sendValueToServer` returned some value.
   *
   * If you DO NOT want to apply the server response to the state, return `null`
   * (which is the default).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  applyServerResponseToState(state: St, serverResponse: any): St | null {
    return null;
  }

  /**
   * Optionally, override `onFinish` to run any code after the synchronization completes. For
   * example, you might want to reload related data from the server, show a confirmation message,
   * or perform cleanup.
   *
   * Note `onFinish` is called in both success and failure scenarios. On success, it runs only
   * after the state is stable for this key. On failure, it runs immediately after the request
   * fails (there is no further stabilization or follow-up).
   *
   * Important: The key is released *before* `onFinish` runs. This means new dispatches for the
   * same key may start a new request while `onFinish` is still running.
   *
   * The `error` parameter is `null` on success, or contains the error if the request failed.
   *
   * If `onFinish` returns a state (not `null`), it will be applied automatically. If it returns
   * `null`, no state change is made.
   *
   * ```ts
   * async onFinish(error: any) {
   *   if (error === null) {
   *     // Success: show a confirmation, log analytics, etc.
   *     return null;
   *   } else {
   *     // Failure:
   *     // - Show a dialog.
   *     // - Reload data from the server.
   *     // - Roll back the optimistic update.
   *   }
   * }
   * ```
   *
   * To show an error dialog in `onFinish`:
   *
   * ```ts
   * this.dispatch(new UserExceptionAction('The server request failed. Info reloaded.'));
   * ```
   *
   * To reload data from the server in `onFinish`:
   *
   * ```ts
   * return this.state.copy({ info: await api.loadInfo() });
   * ```
   *
   * To roll back the optimistic update in `onFinish`:
   *
   * ```ts
   * return this.state.copy({ isLiked: this.getValueFromState(this.initialState) });
   * ```
   *
   * You can combine the above strategies as needed:
   *
   * ```ts
   * async onFinish(error: any) {
   *   if (error === null) return null;
   *
   *   // 1. Show an error message to the user.
   *   this.dispatch(new UserExceptionAction('The server request failed. Info reloaded.'));
   *
   *   // 2. Immediately roll back to the value before the action.
   *   this.dispatch(new UpdateStateAction((state: State) =>
   *     state.copy({ isLiked: this.getValueFromState(this.initialState) })));
   *
   *   // 3. Then, to be sure, reload the value from the server.
   *   return this.state.copy({ info: await api.loadInfo() });
   * }
   * ```
   *
   * Important:
   *
   * - If `onFinish(error)` throws, the original `error` is lost, and the error thrown by
   *   `onFinish` becomes the action error. You can handle it in `wrapError`.
   *
   * - Same on success: If `onFinish(null)` throws, the whole action fails even though the
   *   server request succeeded. You can handle it in `wrapError`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  onFinish(error: any): Promise<St | null> | St | null {
    return null;
  }

  /**
   * If `ifShouldSendAnotherRequest` returns true, the action will send one more request, with
   * the value from the state.
   *
   * The default behavior of this method is to compare:
   * - The `stateValue`, which is the value currently in the store state.
   * - The `sentValue`, which is the value that was sent to the server.
   *
   * If they are different, it means the state was changed after we sent the request, so we
   * should send another request with the new value.
   *
   * Values are compared with `Object.is` (which is the same as `===`, except that `NaN` is equal
   * to `NaN`). So, make sure `getValueFromState` returns the same object you applied, or
   * override this method if you need custom equality logic.
   *
   * The `requestCount` is the number of requests already sent by this action (1 after the first
   * request). Note the number of follow-up requests is limited by `maxFollowUpRequests`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  ifShouldSendAnotherRequest({ stateValue, sentValue, requestCount }: {
    stateValue: T,
    sentValue: T,
    requestCount: number,
  }): boolean {
    return !Object.is(stateValue, sentValue);
  }

  /**
   * Do NOT override this method. Implement `valueToApply`, `applyOptimisticValueToState`,
   * `getValueFromState` and `sendValueToServer` instead.
   */
  async reduce(): Promise<null> {
    const value = this.valueToApply();
    this.optimisticValue = value;

    // Always applies the optimistic update immediately.
    this._applyState(this.applyOptimisticValueToState(this.state, value));

    // If another dispatch has the key, its request is in flight. The optimistic update is
    // already applied, so we just finish. When that request completes, it checks if a
    // follow-up is needed.
    if (!this.store._takeOptimisticSyncKey(this.computeOptimisticSyncKey(), this)) return null;

    await this._sendAndFollowUp(value);
    return null;
  }

  /**
   * Sends the request, and then sends follow-up requests while the value in the state (from
   * `getValueFromState`) is different from the value that was sent.
   */
  private async _sendAndFollowUp(value: T): Promise<void> {
    let sentValue = value;
    let requestCount = 0;
    let finishError: any = null;

    try {
      while (true) {
        requestCount++;
        this.lastSentValue = sentValue;

        // Sends the value, and gets the server response (may be null or undefined).
        const serverResponse = await this.sendValueToServer(sentValue);

        // The keys were released by `store.clearInternalActionProps()` while the request was
        // in flight (for example, on logout). So, stop here.
        if (!this.store._hasOptimisticSyncKey(this)) throw this._clearedError();

        const stateValue = this.getValueFromState(this.state);

        // If the state changed while the request was in flight, sends a follow-up request with
        // the current value, without applying the server response, since the state isn't stable.
        if (this.ifShouldSendAnotherRequest({ stateValue, sentValue, requestCount })) {
          if ((this.maxFollowUpRequests !== -1) && (requestCount > this.maxFollowUpRequests))
            throw new StoreException(
              `Too many follow-up requests in action ${this.constructor.name} (> ${this.maxFollowUpRequests}).`);
          sentValue = stateValue;
          continue;
        }

        // The state is stable for this key, so we apply the server response, if any.
        if (serverResponse !== null && serverResponse !== undefined) {
          const newState = this.applyServerResponseToState(this.state, serverResponse);
          if (newState !== null) this._applyState(newState);
        }

        break;
      }
    } catch (error) {
      if (!this.store._hasOptimisticSyncKey(this)) throw this._clearedError();
      finishError = error;
    }

    // Releases the key before `onFinish`, so that new dispatches can send requests.
    this.store._releaseOptimisticSyncKey(this);

    const newState = await this.onFinish(finishError);
    if (newState !== null && newState !== undefined) this._applyState(newState);

    // Fails, so that the user can be notified.
    if (finishError !== null) throw finishError;
  }

  private _clearedError(): AbortDispatchException {
    return new AbortDispatchException(
      'The internal action props were cleared, so the action stopped syncing.');
  }

  private _applyState(newState: St): void {
    this.dispatch(new UpdateStateAction(() => newState));
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    super._injectStore(_store);
    _checkIncompatibleFeatures(this, 'an OptimisticSync', false);
  }
}

// The device ID returned by the default `OptimisticSyncWithPush.deviceId`, generated once.
let _deviceId: number | undefined = undefined;

/**
 * The `OptimisticSyncWithPush` abstract class is for actions where:
 *
 * 1. Your app receives server-pushed updates (WebSockets, Server-Sent Events (SSE), Firebase)
 *    that may change the same state this action controls. It must be resilient to out-of-order
 *    delivery, and multiple devices can change the same data.
 *
 * 2. Non-blocking user interactions (like toggling a "like" button) should update the UI
 *    immediately and send the updated value to the server, making sure the server and the UI
 *    are eventually consistent.
 *
 * 3. You want "last write wins" semantics across devices. In other words, with multiple devices,
 *    that's how we decide what the truth is when two devices disagree.
 *
 * In other words, it allows:
 * - Optimistic UI
 * - Multi-device writes
 * - Server push
 * - Out-of-order delivery
 *
 * **IMPORTANT:** If your app does not receive server-pushed updates, use `OptimisticSync`
 * instead. In any case, please read the documentation of `OptimisticSync` first, as this class
 * builds upon that behavior, with additional logic to handle server-pushed updates.
 *
 * ## How it works
 *
 * 1. **Immediate UI feedback**: The action is not throttled or debounced in any way, and every
 *    dispatch applies an optimistic update to the state immediately. This guarantees a very good
 *    user experience, because there is immediate feedback on every interaction. Technically,
 *    every dispatch applies `valueToApply()` to the state immediately, using
 *    `applyOptimisticValueToState`.
 *
 * 2. **Single in-flight request**: The first time the action is dispatched, the updated value is
 *    immediately sent to the server. However, any other value changes that occur while the first
 *    request is in flight will NOT be sent, at least not immediately. In other words, only
 *    **one** request is in flight at a time per key (as defined by `computeOptimisticSyncKey()`
 *    and `optimisticSyncKeyParams()`), because the first dispatch takes that key, and other
 *    dispatches don't send requests while the key is taken. This potentially reduces the number
 *    of requests sent to the server, while coalescing intermediate changes.
 *
 * 3. **Follow-up requests**: If the action is dispatched while a request started by
 *    `sendValueToServer` is in flight (for example, the user tapped a "like" button again while
 *    the first request was pending), a follow-up request may be automatically sent after the
 *    current one completes. Whether a follow-up is needed is decided when the current request
 *    finishes, using a local-revision that is kept for the key, and incremented by each
 *    dispatch. This process repeats until the state stabilizes.
 *
 * 4. **Push handling**: If a server push changes the same state while a request is in flight,
 *    when the request completes it checks whether the most recent change for this key came from
 *    a PUSH. If so, no follow-up request is needed, because the push already came from the
 *    server. This requires server pushes to be applied by an action that extends `ServerPush`,
 *    with the same key as the corresponding `OptimisticSyncWithPush` action.
 *
 * 5. **Fewer intermediate requests**: If the state changes many times while the request is in
 *    flight, all those changes are coalesced into a single follow-up request. However, since
 *    `OptimisticSyncWithPush` uses a local-revision to track changes, it can send a follow-up
 *    request even if the final value is the same as the value that was sent. This is necessary
 *    because here we assume other devices or users may have changed the value on the server in
 *    the meantime. Note this is different from `OptimisticSync`, which assumes only the current
 *    user/device changes the value, and compares the sent value with the current state value to
 *    decide if a follow-up request is needed.
 *
 * 6. **Server response handling**: Your implementation of `sendValueToServer` must call
 *    `informServerRevision()` after each successful request. If the revision is not informed,
 *    the action fails with a `StoreException`. This is necessary to handle out-of-order pushes
 *    correctly. Also, optionally, if `sendValueToServer` returns a value (not `null` or
 *    `undefined`), it's applied to the state using `applyServerResponseToState` when the state
 *    stabilizes, unless a newer server revision is already known for this key (for example,
 *    because of a newer push).
 *    Note: If the request started by `sendValueToServer` fails, then `sendValueToServer` should
 *    throw an error, and not call `informServerRevision()`.
 *
 * 7. **Completion callback**: When the synchronization for this key finishes, `onFinish` is
 *    called, allowing you to handle errors or perform side effects, like showing a message or
 *    reloading data. On success, it runs after the state is stable (no follow-up needed) and the
 *    key has been released. On failure, it runs right after the request fails and the key is
 *    released, and then the action fails with the error.
 *    Note: If the action is dispatched while the key is taken, it still applies the optimistic
 *    update immediately, but it does not call `onFinish`. Only the dispatch that took the key
 *    sends the requests and calls `onFinish`.
 *
 * 8. **Safety limit**: To avoid infinite loops, there is a maximum number of follow-up requests
 *    (`maxFollowUpRequests`, default 10000). If exceeded, the action fails with a
 *    `StoreException`. Change it to use a different limit, or use `-1` for no limit.
 *
 * ## Flow example
 *
 * ```
 * State: liked = false
 *
 * User taps LIKE:
 *   → State: liked = true (optimistic).
 *   → Key taken, Request 1 sends: setLiked(true).
 *   → Local-revision is 1.
 *
 * User taps UNLIKE (Request 1 still in flight):
 *   → State: liked = false (optimistic).
 *   → No request sent (key is taken).
 *   → Local-revision is 2.
 *
 * User taps LIKE (Request 1 still in flight):
 *   → State: liked = true (optimistic).
 *   → No request sent (key is taken).
 *   → Local-revision is 3.
 *
 * Request 1 completes:
 *   → The last state change was NOT done by a PUSH.
 *   → Compares the local-revision of Request 1 (revision 1) with the current
 *     local-revision (revision 3).
 *   → They do NOT match, so a follow-up is needed.
 *   → Request 2 sends: setLiked(true).
 *
 * Request 2 completes:
 *   → The last state change was NOT done by a PUSH.
 *   → Compares the local-revision of Request 2 (revision 3) with the current
 *     local-revision (also revision 3).
 *   → They match, no follow-up needed.
 *   → Key released.
 * ```
 *
 * ## Flow example with PUSH
 *
 * ```
 * State: liked = false
 *
 * User taps LIKE:
 *   → State: liked = true (optimistic).
 *   → Key taken, Request 1 sends: setLiked(true).
 *   → Local-revision is 1.
 *
 * User taps UNLIKE (Request 1 still in flight):
 *   → State: liked = false (optimistic).
 *   → No request sent (key is taken).
 *   → Local-revision is 2.
 *
 * A PUSH arrives with liked = false.
 *
 * Request 1 completes:
 *   → The last state change was done by a PUSH.
 *   → So a follow-up is NOT needed.
 *   → Key released.
 * ```
 *
 * ## How to use it
 *
 * Extend `OptimisticSyncWithPush` instead of your base action, and DO NOT implement `reduce()`.
 * Instead, you must provide:
 *
 * - `valueToApply()` returns the value to apply optimistically, and then send to the server.
 * - `applyOptimisticValueToState(state, optimisticValue)` applies the value to the state.
 * - `getValueFromState(state)` reads the value from the state (sent by the follow-up requests).
 * - `sendValueToServer(value, localRevision, deviceId)` sends the value to the server, and calls
 *   `informServerRevision()` with the server revision of the response.
 * - `getServerRevisionFromState(state, key)` reads the server revision that `ServerPush` saved
 *   in the state, or returns `-1`.
 *
 * And optionally:
 *
 * - `optimisticSyncKeyParams()` so that different items can have concurrent requests.
 * - `applyServerResponseToState(state, serverResponse)` applies the server response to the state.
 * - `onFinish(error)` runs when the synchronization finishes, with or without errors.
 * - `maxFollowUpRequests`, to limit the follow-up requests.
 *
 * ```ts
 * class ToggleLike extends OptimisticSyncWithPush<State, boolean> {
 *   constructor(readonly itemId: string) { super(); }
 *
 *   optimisticSyncKeyParams() { return this.itemId; }
 *   valueToApply() { return !this.state.isLiked(this.itemId); }
 *   applyOptimisticValueToState(state: State, liked: boolean) { return state.setLiked(this.itemId, liked); }
 *   getValueFromState(state: State) { return state.isLiked(this.itemId); }
 *   getServerRevisionFromState(state: State, key: any) { return state.revisionOf(key) ?? -1; }
 *
 *   async sendValueToServer(liked: boolean, localRevision: number, deviceId: number) {
 *     const response = await api.setLiked(this.itemId, liked, localRevision, deviceId);
 *     if (!response.ok) throw new Error('Server error');
 *     this.informServerRevision(response.serverRevision);
 *     return response.liked;
 *   }
 *
 *   applyServerResponseToState(state: State, liked: boolean) { return state.setLiked(this.itemId, liked); }
 * }
 * ```
 *
 * The server pushes are applied by a separate action, that extends `ServerPush`, and whose
 * `associatedAction()` returns `ToggleLike`. See `ServerPush` for details.
 *
 * ## Clearing
 *
 * `store.clearInternalActionProps()` (which is also called by `store.setShutDown(true)`)
 * releases all keys, and removes all the revisions kept for them (local-revisions, and the
 * server revisions that are not in the state), which is useful on logout. An action whose
 * request was in flight when the keys were released stops when that request finishes: it
 * doesn't send follow-up requests, doesn't apply the server response, and doesn't call
 * `onFinish`. It's aborted with an `AbortDispatchException`, so it doesn't fail, and doesn't
 * show errors.
 *
 * Notes:
 * - It can be combined with `checkInternet`, both `{ dialog: true | false }` and
 *   `{ abort: true }`. If there is no internet, the optimistic value is not applied, and no
 *   request is sent.
 * - It should not be combined with `nonReentrant`, `retry`, `unlimitedRetryCheckInternet`,
 *   `debounce`, `throttle`, `fresh` or polling. Dispatching it with those throws a
 *   `StoreException`.
 * - It should not be combined with `sequential`, which throws a `StoreException` too, for the
 *   same reasons given in `OptimisticSync`, and also because the revision tracking assumes the
 *   server pushes can be applied to the state while a request is in flight.
 * - Apply the server pushes with a separate action that extends `ServerPush`.
 */
export abstract class OptimisticSyncWithPush<St, T = any> extends KissAction<St> {

  /**
   * The device ID is used to tell apart the revisions of different devices. It's sent to the
   * server by `sendValueToServer`, and the server pushes must return it (see `ServerPush`), so
   * that the app can recognize the pushes of its own requests.
   *
   * The default is a random integer generated once per app run, but you can change it to
   * return a persistent unique ID per device:
   *
   * ```ts
   * OptimisticSyncWithPush.deviceId = () => myDeviceId;
   * ```
   */
  static deviceId: () => number = () => {
    _deviceId ??= Math.floor(Math.random() * 4294967296) + (Math.floor(Math.random() * 10000) * 10000000000);
    return _deviceId;
  };

  /**
   * The optimistic value that was applied to the state by this dispatch. It's set once, when
   * the reducer starts, to the value returned by `valueToApply()`, and remains available in
   * `onFinish` for rollback logic.
   */
  optimisticValue!: T;

  /**
   * The most recent value that was passed to `sendValueToServer`. It's updated right before
   * each server request (including follow-ups), and is `undefined` if this dispatch sent no
   * request (because another dispatch was already sending them). Useful for debugging, logging,
   * or implementing custom guards.
   */
  lastSentValue: T | undefined = undefined;

  /**
   * Safety limit for the number of follow-up requests, to avoid infinite loops. If the state is
   * still changing after this many follow-ups, the action fails with a `StoreException`.
   * Use `-1` for no limit. The default is 10000.
   */
  maxFollowUpRequests: number = 10000;

  // The key of this dispatch, computed once when the reducer starts.
  private _key: any = undefined;

  // The server revision informed by `informServerRevision()` during the current request, or
  // `null` if it was not informed. It's reset before each request.
  private _informedServerRevision: number | null = null;

  /**
   * Optionally, override `optimisticSyncKeyParams()` to differentiate the coalescing by the
   * action parameters. For example, if you have a like button per item, return the item ID, so
   * that different items can have concurrent requests:
   *
   * ```ts
   * optimisticSyncKeyParams() { return this.itemId; }
   * ```
   *
   * You can also return an array of values:
   *
   * ```ts
   * optimisticSyncKeyParams() { return [this.userId, this.itemId]; }
   * ```
   *
   * Params are compared with `Object.is`, except arrays and plain objects, which are compared
   * by their contents.
   *
   * Important: If the action changes a different part of the state depending on its fields,
   * make the key depend on them too. Otherwise, while `ToggleLike('A')` has a request in flight,
   * `ToggleLike('B')` changes the state but doesn't send its own request, and the follow-up of
   * `ToggleLike('A')` only reads item A from the state, so item B may never be sent to the
   * server.
   *
   * The `ServerPush` actions that apply the pushes of this value must return the same params
   * from their own `optimisticSyncKeyParams()`.
   *
   * See also: `computeOptimisticSyncKey()`, which uses this method by default to build the key.
   */
  optimisticSyncKeyParams(): any {
    return null;
  }

  /**
   * By default, the coalescing key combines the action class with `optimisticSyncKeyParams()`.
   * Override this method if you want different action classes to share the same coalescing key.
   * In this case, override `computeOptimisticSyncKey()` in the `ServerPush` actions too, so
   * that they compute the same key.
   *
   * Keys are compared with `Object.is`, except arrays and plain objects, which are compared by
   * their contents.
   */
  computeOptimisticSyncKey(): any {
    return [this.constructor, this.optimisticSyncKeyParams()];
  }

  /**
   * Return the value that should be applied optimistically to the state, and then sent to the
   * server. This is called synchronously, and only once per dispatch, when the reducer starts.
   *
   * The value to apply can be anything, and is usually constructed from the action fields,
   * and/or from the current `state`. Valid examples are:
   *
   * ```ts
   * // Set the like button to "liked".
   * valueToApply() { return true; }
   *
   * // Set the like button to "liked" or "not liked", according to
   * // the field `isLiked` of the action.
   * valueToApply() { return this.isLiked; }
   *
   * // Toggle the current state of the like button.
   * valueToApply() { return !this.state.items.get(this.itemId).liked; }
   * ```
   */
  abstract valueToApply(): T;

  /**
   * Return a new state where the given `optimisticValue` is applied to the given `state`.
   *
   * Note, Kiss calculates `optimisticValue` by previously calling `valueToApply()`.
   *
   * ```ts
   * applyOptimisticValueToState(state: State, isLiked: boolean) {
   *   return state.copy({ items: state.items.setLiked(this.itemId, isLiked) });
   * }
   * ```
   */
  abstract applyOptimisticValueToState(state: St, optimisticValue: T): St;

  /**
   * Return the value from the given `state`. If a follow-up request is needed, the value
   * returned by `getValueFromState` is the one that will be sent to the server.
   *
   * ```ts
   * getValueFromState(state: State) { return state.items.get(this.itemId).liked; }
   * ```
   */
  abstract getValueFromState(state: St): T;

  /**
   * Override `sendValueToServer` to:
   * - Send the given `value`, the `localRevision`, and the `deviceId` to the server.
   * - Inform the server revision of the response, by calling `informServerRevision()`.
   * - Optionally, return the server's response.
   * - Throw an error if the request fails (in this case, don't call `informServerRevision()`).
   *
   * Notes:
   * - The first request sends the `optimisticValue` (calculated by previously calling
   *   `valueToApply()`). The follow-up requests send the value from `getValueFromState`.
   * - The server must return the server revision in the response.
   * - The server pushes must provide 3 pieces of information: the server revision, the
   *   `deviceId`, and the `localRevision`. See `ServerPush` for details.
   *
   * If `sendValueToServer` returns a value that is not `null` or `undefined`, that value will be
   * passed to `applyServerResponseToState`, but **only when the state stabilizes** (when there
   * are no more pending requests and the key is about to be released). This prevents the server
   * response from overwriting subsequent user interactions that occurred while the request was
   * in flight.
   *
   * The value in the store state may change while the request is in flight, both because of
   * user interactions and because of server pushes. If the most recent state change was due to
   * a user interaction (for example, if the user presses a like button once, but then presses
   * it again before the first request finishes), then `sendValueToServer` will be called again,
   * to create a follow-up request to sync the updated state with the server. If the most recent
   * state change was due to a server push, no follow-up request is needed.
   *
   * ```ts
   * async sendValueToServer(isLiked: boolean, localRevision: number, deviceId: number) {
   *   const response = await api.setLiked(this.itemId, isLiked, localRevision, deviceId);
   *   if (!response.ok) throw new Error('Server error');
   *   this.informServerRevision(response.serverRevision);
   *   return response.liked; // Kiss decides whether to apply this.
   * }
   * ```
   */
  abstract sendValueToServer(value: T, localRevision: number, deviceId: number): Promise<any>;

  /**
   * Return the server revision you saved in the given `state` for the given `key`, in
   * `ServerPush.applyServerPushToState`. Return `-1` when unknown.
   *
   * Saving the server revision in the state is what lets the app ignore stale pushes even after
   * the revisions kept by Kiss are lost, for example, when the app restarts with a persisted
   * state, or after `store.clearInternalActionProps()`.
   *
   * ```ts
   * getServerRevisionFromState(state: State, key: any) { return state.revisionOf(key) ?? -1; }
   * ```
   */
  abstract getServerRevisionFromState(state: St, key: any): number;

  /**
   * Override `applyServerResponseToState` to return a new state, where the given
   * `serverResponse` (previously received from the server when running `sendValueToServer`) is
   * applied to the current `state`. Example:
   *
   * ```ts
   * applyServerResponseToState(state: State, serverResponse: Response) {
   *   return state.copy({ items: state.items.setLiked(this.itemId, serverResponse.isLiked) });
   * }
   * ```
   *
   * Note `serverResponse` is never `null` or `undefined` here, because this method is only
   * called when `sendValueToServer` returned some value. It's also not called when a newer
   * server revision is known for the key (for example, because of a newer push), since then the
   * response is stale.
   *
   * If you DO NOT want to apply the server response to the state, return `null`
   * (which is the default).
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  applyServerResponseToState(state: St, serverResponse: any): St | null {
    return null;
  }

  /**
   * You must call `informServerRevision()` from your `sendValueToServer`, to inform the server
   * revision returned in the response. If you don't, the action fails with a `StoreException`.
   *
   * The server must provide a monotonically increasing revision number (for example, a
   * timestamp, or a version number), comparable across devices and users, that allows the app
   * to determine the ordering of the updates. You can also pass a `Date`, which is converted to
   * its milliseconds since the epoch.
   *
   * Kiss uses this information to:
   * - Track the latest known server revision (for "last write wins" ordering).
   * - Determine whether to apply the server response (stale responses are automatically
   *   ignored).
   *
   * **Usage:** Just call this method with the server revision from the response. Kiss handles
   * all the logic, so you don't need to check or compare anything yourself. Example:
   *
   * ```ts
   * async sendValueToServer(isLiked: boolean, localRevision: number, deviceId: number) {
   *   const response = await api.setLiked(this.itemId, isLiked, localRevision, deviceId);
   *   if (!response.ok) throw new Error('Server error');
   *   this.informServerRevision(response.serverRevision);
   *   return response.liked;
   * }
   * ```
   *
   * **Behavior:** It only updates the server revision kept for this key if `revision` is greater
   * than the newest known server revision, considering both the revision kept by Kiss, and
   * `getServerRevisionFromState()`. This prevents regressions from stale or out-of-order
   * updates. The server response is only applied if this revision is not older than the newest
   * known revision.
   */
  informServerRevision(revision: number | Date): void {
    const value = (revision instanceof Date) ? revision.getTime() : revision;

    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new StoreException(
        `Action ${this.constructor.name} informed an invalid server revision: ` +
        `it must be a finite number, or a valid Date, but got ${String(revision)}.`);

    this._informedServerRevision = value;

    // Only while this dispatch sends the requests. Otherwise, the key may have been released by
    // `store.clearInternalActionProps()`, and the revision would belong to the previous user.
    if (!this.store._hasOptimisticSyncKey(this)) return;

    const known = this._revisionOf(this._key);

    // Only moves forward. Since this revision is newer than any push, the latest change is no
    // longer from a push.
    if (value > known.serverRevision)
      this.store._setOptimisticSyncRevision(this._key, {
        localRevision: known.localRevision,
        serverRevision: value,
        isPush: false,
      });
  }

  /**
   * Optionally, override `onFinish` to run any code after the synchronization completes. For
   * example, you might want to reload related data from the server, show a confirmation message,
   * or perform cleanup.
   *
   * Note `onFinish` is called in both success and failure scenarios. On success, it runs only
   * after the state is stable for this key. On failure, it runs immediately after the request
   * fails (there is no further stabilization or follow-up).
   *
   * Important: The key is released *before* `onFinish` runs. This means new dispatches for the
   * same key may start a new request while `onFinish` is still running.
   *
   * The `error` parameter is `null` on success, or contains the error if the request failed.
   *
   * If `onFinish` returns a state (not `null`), it will be applied automatically. If it returns
   * `null`, no state change is made.
   *
   * ```ts
   * async onFinish(error: any) {
   *   if (error === null) {
   *     // Success: show a confirmation, log analytics, etc.
   *     return null;
   *   } else {
   *     // Failure: reload data from the server.
   *     const reloadedInfo = await api.loadInfo();
   *     return this.state.copy({ info: reloadedInfo });
   *   }
   * }
   * ```
   *
   * Important:
   *
   * - If `onFinish(error)` throws, the original `error` is lost, and the error thrown by
   *   `onFinish` becomes the action error. You can handle it in `wrapError`.
   *
   * - Same on success: If `onFinish(null)` throws, the whole action fails even though the
   *   server request succeeded. You can handle it in `wrapError`.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The parameters document the signature to override.
  onFinish(error: any): Promise<St | null> | St | null {
    return null;
  }

  /**
   * Do NOT override this method. Implement `valueToApply`, `applyOptimisticValueToState`,
   * `getValueFromState`, `sendValueToServer` and `getServerRevisionFromState` instead.
   */
  async reduce(): Promise<null> {
    const key = this._key = this.computeOptimisticSyncKey();

    const value = this.valueToApply();
    this.optimisticValue = value;
    const newState = this.applyOptimisticValueToState(this.state, value);

    // Each dispatch is a new local change, so it increments the local-revision of the key.
    // The latest change is now local, and not from a push.
    const known = this._revisionOf(key);
    const localRevision = known.localRevision + 1;
    this.store._setOptimisticSyncRevision(key, {
      localRevision,
      serverRevision: known.serverRevision,
      isPush: false,
    });

    // Always applies the optimistic update immediately.
    this._applyState(newState);

    // If another dispatch has the key, its request is in flight. The optimistic update is
    // already applied, so we just finish. When that request completes, it checks if a
    // follow-up is needed.
    if (!this.store._takeOptimisticSyncKey(key, this)) return null;

    await this._sendAndFollowUp(value, localRevision);
    return null;
  }

  /**
   * Sends the request, and then sends follow-up requests while the latest change of the key is
   * local (not from a push), and newer than the change that was sent.
   */
  private async _sendAndFollowUp(value: T, localRevision: number): Promise<void> {
    let sentValue = value;
    let sentLocalRevision = localRevision;
    let requestCount = 0;
    let finishError: any = null;

    try {
      while (true) {
        requestCount++;
        this.lastSentValue = sentValue;

        // Reset before each request, to detect if `informServerRevision()` was called.
        this._informedServerRevision = null;

        // Sends the value, and gets the server response (may be null or undefined).
        const serverResponse = await this.sendValueToServer(
          sentValue, sentLocalRevision, OptimisticSyncWithPush.deviceId());

        // The keys were released by `store.clearInternalActionProps()` while the request was
        // in flight (for example, on logout). So, stop here.
        if (!this.store._hasOptimisticSyncKey(this)) throw this._clearedError();

        const informedServerRevision = this._informedServerRevision as number | null;
        if (informedServerRevision === null)
          throw new StoreException(
            `Action ${this.constructor.name} is an OptimisticSyncWithPush, which requires calling ` +
            '`informServerRevision()` inside `sendValueToServer()`. ' +
            'If you don\'t need server-push handling, use `OptimisticSync` instead.');

        const known = this._revisionOf(this._key);

        // If the latest change was made locally (not by a push), and the local-revision advanced
        // since this request was sent, the user changed the value while the request was in
        // flight. So, sends a follow-up request with the current value, without applying the
        // server response, since the state isn't stable.
        if (!known.isPush && (known.localRevision > sentLocalRevision)) {
          if ((this.maxFollowUpRequests !== -1) && (requestCount > this.maxFollowUpRequests))
            throw new StoreException(
              `Too many follow-up requests in action ${this.constructor.name} (> ${this.maxFollowUpRequests}).`);
          sentValue = this.getValueFromState(this.state);
          sentLocalRevision = known.localRevision;
          continue;
        }

        // The state is stable for this key, so we apply the server response, if any, but only
        // if it's not stale (no newer server revision is known, for example from a push).
        if (serverResponse !== null && serverResponse !== undefined &&
          informedServerRevision >= known.serverRevision) {
          const newState = this.applyServerResponseToState(this.state, serverResponse);
          if (newState !== null) this._applyState(newState);
        }

        break;
      }
    } catch (error) {
      if (!this.store._hasOptimisticSyncKey(this)) throw this._clearedError();
      finishError = error;
    }

    // Releases the key before `onFinish`, so that new dispatches can send requests.
    this.store._releaseOptimisticSyncKey(this);

    const newState = await this.onFinish(finishError);
    if (newState !== null && newState !== undefined) this._applyState(newState);

    // Fails, so that the user can be notified.
    if (finishError !== null) throw finishError;
  }

  /**
   * The revision kept for the given key, where the server revision is the newest of the one
   * kept by Kiss, and the one in the state.
   */
  private _revisionOf(key: any): _OptimisticSyncRevision {
    return _revisionOf(this.store, key, this.getServerRevisionFromState(this.state, key));
  }

  private _clearedError(): AbortDispatchException {
    return new AbortDispatchException(
      'The internal action props were cleared, so the action stopped syncing.');
  }

  private _applyState(newState: St): void {
    this.dispatch(new UpdateStateAction(() => newState));
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    super._injectStore(_store);
    _checkIncompatibleFeatures(this, 'an OptimisticSyncWithPush', false);
  }
}

/**
 * The information that comes with each server push, used by `ServerPush`:
 *
 * - `serverRevision`: The server revision of the pushed value.
 * - `localRevision`: The local-revision that the device that changed the value sent to the
 *   server in `OptimisticSyncWithPush.sendValueToServer`.
 * - `deviceId`: The device ID that the device that changed the value sent to the server in
 *   `OptimisticSyncWithPush.sendValueToServer`.
 */
export type PushMetadata = {
  serverRevision: number,
  localRevision: number,
  deviceId: number,
};

/**
 * The revision that `OptimisticSyncWithPush` and `ServerPush` keep for each key. For Kiss
 * internal use only.
 */
export type _OptimisticSyncRevision = {
  // Incremented by each `OptimisticSyncWithPush` dispatch.
  localRevision: number,
  // The newest known server revision, or -1 if unknown.
  serverRevision: number,
  // True if the latest change of the key came from a push.
  isPush: boolean,
};

/**
 * The revision kept in the store for the given key, where the server revision is the newest of
 * the one kept in the store, and the given one (which comes from the state).
 */
function _revisionOf(store: Store<any>, key: any, serverRevisionFromState: number): _OptimisticSyncRevision {
  const kept = store._getOptimisticSyncRevision(key);
  return {
    localRevision: kept?.localRevision ?? 0,
    serverRevision: Math.max(kept?.serverRevision ?? -1, serverRevisionFromState),
    isPush: kept?.isPush ?? false,
  };
}

/**
 * The `ServerPush` abstract class is for actions that put in the store state the values that
 * were received by server push, through WebSockets, Server-Sent Events (SSE), Firebase, etc.
 *
 * It works together with `OptimisticSyncWithPush`, to make sure out-of-order pushes don't
 * corrupt the state, and that local optimistic updates are not overwritten by stale pushes.
 *
 * ## How it works
 *
 * Each push comes with its `PushMetadata` (the server revision, and the local-revision and
 * device ID that were sent by the device that changed the value). When the action is
 * dispatched:
 *
 * 1. If the push is not newer than the newest known server revision for the key (considering
 *    both the revision kept by Kiss, and `getServerRevisionFromState()`), it's stale or out of
 *    order, so it's ignored.
 *
 * 2. If the push is the echo of an older request of this same device (the user changed the
 *    value again after that request was sent), it's not applied, since the state already has a
 *    newer local value. Its server revision is still recorded, but it doesn't count as a push,
 *    so the newer local value is still sent in a follow-up request.
 *
 * 3. Otherwise (a push from another device, or the echo of the latest request of this device),
 *    it's applied with `applyServerPushToState`, and recorded as the latest change of the key.
 *    Then, the `OptimisticSyncWithPush` request in flight for that key doesn't send a follow-up
 *    request when it finishes, since the push already came from the server.
 *
 * ## How to use it
 *
 * Extend `ServerPush` instead of your base action, and DO NOT implement `reduce()`. Instead,
 * you must provide:
 *
 * - `associatedAction()` returns the `OptimisticSyncWithPush` class that controls the value.
 * - `pushMetadata()` returns the `PushMetadata` that came with the push.
 * - `applyServerPushToState(state, key, serverRevision)` applies the pushed value, and the
 *   server revision, to the state.
 * - `getServerRevisionFromState(state, key)` reads the server revision saved in the state, or
 *   returns `-1`.
 *
 * And optionally, `optimisticSyncKeyParams()`, which must return the same as the one of the
 * associated action.
 *
 * ```ts
 * class PushLikeUpdate extends ServerPush<State> {
 *   constructor(readonly itemId: string, readonly liked: boolean, readonly metadata: PushMetadata) {
 *     super();
 *   }
 *
 *   associatedAction() { return ToggleLike; }
 *   optimisticSyncKeyParams() { return this.itemId; }
 *   pushMetadata() { return this.metadata; }
 *
 *   applyServerPushToState(state: State, key: any, serverRevision: number) {
 *     return state.setLiked(this.itemId, this.liked).setRevision(key, serverRevision);
 *   }
 *
 *   getServerRevisionFromState(state: State, key: any) { return state.revisionOf(key) ?? -1; }
 * }
 *
 * // When the server pushes a change:
 * socket.on('like', (msg) => store.dispatch(new PushLikeUpdate(msg.itemId, msg.liked, {
 *   serverRevision: msg.serverRevision,
 *   localRevision: msg.localRevision,
 *   deviceId: msg.deviceId,
 * })));
 * ```
 *
 * To reset the revisions shared with `OptimisticSyncWithPush` (for example, on logout), call
 * `store.clearInternalActionProps()`, which is also called by `store.setShutDown(true)`. The
 * server revisions you saved in the state are kept, and still used.
 *
 * Notes:
 * - This class should be used alone. It can't be combined with any other feature: dispatching
 *   it with `checkInternet`, `nonReentrant`, `retry`, `unlimitedRetryCheckInternet`, `debounce`,
 *   `throttle`, `fresh`, `sequential` or polling throws a `StoreException`.
 * - In particular, it should not be combined with `sequential`. Pushed values must be applied to
 *   the state as soon as they arrive, and `sequential` would delay them behind unrelated queued
 *   actions. Worse, a push is also what tells an in-flight `OptimisticSyncWithPush` request that
 *   no follow-up is needed, and that signal would arrive too late.
 * - Use it in a separate action from `OptimisticSyncWithPush`, which can't apply pushes itself.
 */
export abstract class ServerPush<St> extends KissAction<St> {

  /**
   * Return the class of the `OptimisticSyncWithPush` action that controls this value, so that
   * both compute the same key. For example:
   *
   * ```ts
   * associatedAction() { return ToggleLike; }
   * ```
   */
  abstract associatedAction(): abstract new (...args: any[]) => OptimisticSyncWithPush<St, any>;

  /**
   * Same meaning as in `OptimisticSyncWithPush`: the params that differentiate the keys. It
   * must return the same as the `optimisticSyncKeyParams()` of the associated action. For
   * example, if each item has its own key:
   *
   * ```ts
   * optimisticSyncKeyParams() { return this.itemId; }
   * ```
   */
  optimisticSyncKeyParams(): any {
    return null;
  }

  /**
   * Must compute the same key as the `computeOptimisticSyncKey()` of the associated
   * `OptimisticSyncWithPush` action. By default, it combines `associatedAction()` with
   * `optimisticSyncKeyParams()`.
   */
  computeOptimisticSyncKey(): any {
    return [this.associatedAction(), this.optimisticSyncKeyParams()];
  }

  /**
   * Return the `PushMetadata` that came with the push:
   *
   * - The server revision.
   * - The local-revision.
   * - The device ID.
   *
   * For example:
   *
   * ```ts
   * class PushLikeUpdate extends ServerPush<State> {
   *   constructor(readonly liked: boolean, readonly metadata: PushMetadata) { super(); }
   *
   *   associatedAction() { return ToggleLike; }
   *   pushMetadata() { return this.metadata; }
   *
   *   applyServerPushToState(state: State, key: any, serverRevision: number) {
   *     return state.copy({ liked: this.liked, revision: serverRevision });
   *   }
   *
   *   getServerRevisionFromState(state: State, key: any) { return state.revision; }
   * }
   * ```
   */
  abstract pushMetadata(): PushMetadata;

  /**
   * Return a new state, where:
   * - The pushed data is applied to the given `state`.
   * - The given `serverRevision` is saved for the given `key`.
   *
   * Return `null` to ignore the push. Note its server revision is still recorded as the newest
   * known one, so older pushes and responses are ignored.
   */
  abstract applyServerPushToState(state: St, key: any, serverRevision: number): St | null;

  /**
   * Return the server revision you saved in the given `state` for the given `key`, in
   * `applyServerPushToState`. Return `-1` when unknown.
   */
  abstract getServerRevisionFromState(state: St, key: any): number;

  /**
   * Do NOT override this method. Implement `associatedAction`, `pushMetadata`,
   * `applyServerPushToState` and `getServerRevisionFromState` instead.
   */
  reduce(): St | null {
    const key = this.computeOptimisticSyncKey();
    const { serverRevision, localRevision, deviceId } = this.pushMetadata();

    const known = _revisionOf(this.store, key, this.getServerRevisionFromState(this.state, key));

    // Ignores stale and out-of-order pushes.
    if (serverRevision <= known.serverRevision) return null;

    const isSelf = (deviceId === OptimisticSyncWithPush.deviceId());

    // The echo of an older request of this device: the state already has a newer local value.
    // So, it only records the server revision. It does NOT apply the push, and does NOT count
    // as a push, since then the newer local value would not be sent in a follow-up request.
    if (isSelf && (localRevision < known.localRevision)) {
      this.store._setOptimisticSyncRevision(key, {
        localRevision: known.localRevision,
        serverRevision,
        isPush: false,
      });
      return null;
    }

    // Safe to apply (a push from another device, or the echo of the latest local value).
    const newState = this.applyServerPushToState(this.state, key, serverRevision);

    // Always records the newest known server revision, even if the push is ignored by
    // `applyServerPushToState` (which returned null).
    this.store._setOptimisticSyncRevision(key, {
      localRevision: isSelf ? Math.max(known.localRevision, localRevision) : known.localRevision,
      serverRevision,
      isPush: true,
    });

    return newState;
  }

  /**
   * For Kiss internal use only.
   */
  _injectStore(_store: Store<St>) {
    super._injectStore(_store);
    _checkIncompatibleFeatures(this, 'a ServerPush', true);
  }
}

/**
 * Throws a `StoreException` if the given action, which is described by `description` (for
 * example, "an OptimisticSync"), uses a feature it can't use. It can only use `checkInternet`,
 * unless `noCheckInternet` is true, in which case it can't use any feature.
 */
function _checkIncompatibleFeatures(action: KissAction<any>, description: string, noCheckInternet: boolean): void {
  const incompatible = (feature: string, isUsed: boolean) => {
    if (isUsed)
      throw new StoreException(
        `Action ${action.constructor.name} is ${description}, which can't use ${feature}. ` +
        `Remove its \`${feature === 'polling' ? 'poll' : feature}\` property.`);
  };

  if (noCheckInternet) incompatible('checkInternet', !!action.checkInternet);
  incompatible('nonReentrant', action.nonReentrant);
  incompatible('unlimitedRetryCheckInternet', action._isUnlimitedRetryCheckInternet);
  incompatible('retry', action.ifRetryIsOn);
  incompatible('debounce', action._debounceMillis !== null);
  incompatible('throttle', action._throttleMillis !== null);
  incompatible('fresh', action._freshMillis !== null);
  incompatible('sequential', action.sequential);
  incompatible('polling', action.poll !== undefined);
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

/**
 * The retry options of `unlimitedRetryCheckInternet`. All are optional, and use their defaults
 * when not set. See the documentation of `KissAction.unlimitedRetryCheckInternet` for details.
 */
export type UnlimitedRetryCheckInternet = {
  /** The delay before the first retry attempt, in milliseconds. Default is `350`. */
  initialDelay?: number,
  /** The factor by which the delay increases for each subsequent retry. Default is `2`. */
  multiplier?: number,
  /**
   * The maximum delay between retries, in milliseconds, when there is internet but the action
   * failed. Default is `5000`.
   */
  maxDelay?: number,
  /** The maximum delay between retries, in milliseconds, when there is no internet. Default is `1000`. */
  maxDelayNoInternet?: number,
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
