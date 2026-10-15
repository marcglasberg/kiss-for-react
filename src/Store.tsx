import { UserException } from './UserException';
import { PersistAction, Persistor } from './Persistor';
import {
  ActionStatus,
  AsyncReducer,
  AsyncReducerResult,
  KissAction,
  MergeServerStateAction,
  OptimisticCommand,
  Poll,
  ReduxReducer,
  UpdateStateAction,
  _isSameNonReentrantKey,
  _OptimisticSyncRevision,
  StatusOptions,
} from './KissAction';
import { ProcessPersistence } from './ProcessPersistence';
import { AbortDispatchException, isKissAbort, kissAbort, StoreException, TimeoutException } from './StoreException';
import { Evt, EvtState } from './Evt';
import { capTimeoutMillis, describeValue, isPlainObject, MAX_TIMEOUT_MILLIS } from "./utils";

// An active polling cycle of the given polling key. The `timer` is the one that dispatches the
// next tick, or `null` while a tick (or the immediate run) is running, or while a tick that
// came due waits for the app to be focused or online again (see `pollOnlyWhenFocused` and
// `pollOnlyWhenOnline`). In that last case, `cancelWait` stops listening for them, and drops
// the tick.
/** One failure kept for `isFailed` and `exceptionFor`: the action's `statusKey` and its error. */
export type Failure = { statusKey: unknown, error: unknown };

/**
 * One promise given to `useSuspense`, for a component suspended while an action of `type` (or
 * of a subclass) with `statusKey` is in progress. Resolved, and removed, when no such action is
 * in progress anymore. See `Store._suspenseValue`.
 */
type SuspenseWait = {
  type: abstract new (...args: any[]) => KissAction<any>,
  statusKey: unknown,
  promise: Promise<void>,
  resolve: () => void,
};

type PollingCycle = {
  key: any,
  timer: ReturnType<typeof setTimeout> | null,
  cancelWait: (() => void) | null,
};

/**
 * A function that disposes the value of a store prop, given to `setProp` as the `dispose`
 * option. For example, `clearInterval` for an interval. It may return a promise, which
 * `store.dispose()` waits for.
 */
export type PropDispose<V = any> = (value: V) => unknown;

/**
 * The options of `store.setProp` and `KissAction.setProp`.
 */
export interface SetPropOptions<V = any> {
  /**
   * How to dispose the value, when the prop is disposed (with `disposeProp`, `disposeProps`
   * or `store.dispose()`), or when it's replaced by `setProp` with the same key. It gets the
   * value. For example, `{ dispose: clearInterval }` for an interval, or
   * `{ dispose: (unsubscribe) => unsubscribe() }` for an unsubscribe function. It may return a
   * promise, which `store.dispose()` waits for.
   *
   * Without it, Kiss disposes the value by its type (see `setProp`). Timers and functions need
   * it, since Kiss can't tell them from other numbers and functions.
   */
  dispose?: PropDispose<V>;
}

/**
 * Selects the props to dispose, for `disposeProps` and `logOut`. Gets the key and the value
 * of each prop, and returns `true` for the ones to dispose.
 */
export type PropPredicate = (key: unknown, value: unknown) => boolean;

interface ConstructorParams<St> {

  /**
   * The initial state of the app.
   */
  initialState: St;

  /**
   * The environment the app is running in: production, staging, testing, etc. Any value, and
   * usually an enum. Read it with `store.environment`, in actions with
   * `this.store.environment`, and in components with `useEnvironment()`. It never changes
   * while the app runs.
   *
   * ```ts
   * const store = createStore<State>({
   *   initialState: State.initialState,
   *   environment: Environment.production,
   * });
   * ```
   *
   * See also: `configuration` and `dependencies`, which are created by factories that get
   * the store, so they can depend on the environment.
   */
  environment?: unknown;

  /**
   * A factory that creates the configuration of the app: feature flags and other
   * configuration values. It gets the store, so it can read `store.environment`. It's called
   * once, when the store is created, before the `dependencies` factory. Read the result with
   * `store.configuration`, in actions with `this.store.configuration`, and in components with
   * `useConfiguration()`. It's meant to be immutable: it doesn't change while the app runs.
   *
   * ```ts
   * const store = createStore<State>({
   *   initialState: State.initialState,
   *   environment: Environment.production,
   *   configuration: (store) => new Config({ showAdminConsole: store.environment !== Environment.production }),
   * });
   * ```
   *
   * `store.dispose()` disposes the configuration, if it has a `[Symbol.asyncDispose]()`,
   * `[Symbol.dispose]()` or `dispose()` method.
   */
  configuration?: (store: Store<St>) => unknown;

  /**
   * A factory that creates the dependencies of the app: the services, repositories, API
   * clients, etc, that the actions use. It gets the store, so it can read `store.environment`
   * and `store.configuration` (which is created first). It's called once, when the store is
   * created. Read the result with `store.dependencies`, and in actions with
   * `this.store.dependencies`. Components should usually not need the dependencies.
   *
   * Since the dependencies belong to the store, each test creates its own store with its own
   * dependencies (fakes, for example), with nothing global to set up or reset:
   *
   * ```ts
   * const store = createStore<State>({
   *   initialState: State.initialState,
   *   environment: Environment.testing,
   *   dependencies: (store) => new FakeDependencies(),
   * });
   * ```
   *
   * `store.environment`, `store.configuration` and `store.dependencies` are typed `unknown`.
   * Declare typed getters once, in your base action:
   *
   * ```ts
   * abstract class Action extends KissAction<State> {
   *   get env() { return this.store.environment as Environment; }
   *   get config() { return this.store.configuration as Config; }
   *   get deps() { return this.store.dependencies as Dependencies; }
   * }
   * ```
   *
   * `store.dispose()` disposes the dependencies, if they have a `[Symbol.asyncDispose]()`,
   * `[Symbol.dispose]()` or `dispose()` method. They are disposed after the props, and before
   * the configuration. `logOut` keeps them, since they belong to the app, and not to the user.
   */
  dependencies?: (store: Store<St>) => unknown;

  /**
   * Kiss calls this function automatically when actions throw `UserException`s, so that
   * they can be shown to the user. Usually, this function opens some UI like a dialog or a toast,
   * with the error message.
   *
   * The `count` parameter is the number of exceptions still in the queue.
   *
   * You should explicitly call `next` function when the user is ready to see the next exception
   * in the queue, when the user dismisses the dialog or toast. If there are no more exceptions,
   * `next` will do nothing. Otherwise, it will call `showUserException` again. Example:
   *
   * ```ts
   * const showUserException: ShowUserException =
   *   (exception, count, next) => {
   *     Alert.alert(
   *       exception.title || exception.message,
   *       exception.title ? exception.message : '',
   *       [{ text: 'OK', onPress: (_value?: string) => next() }]
   *     );
   *   };
   * ```
   */
  showUserException?: (exception: UserException, count: number, next: () => void) => void;

  /**
   * The persistor saves and retrieves the application's state from the local device storage,
   * ensuring data persistence across app restarts. Without a defined persistor, the app's state
   * will not be saved.
   *
   * The `Persistor` is an abstract base class, allowing developers to easily craft their custom
   * persistors. Kiss makes it easy, by automatically invoking the persistor upon any state
   * modification, and passing it the information that needs to be saved as well as the last saved
   * state.
   *
   * Kiss also offers a built-in `ClassPersistor` that can be used to persist the state by
   * serializing it to a string and saving it to the local device storage.
   */
  persistor?: Persistor<St>;

  /**
   * How `store.mergeServerState(slice)` and the `StoreSlice` component merge a slice of
   * state, loaded on the server for a route, into the store state (see "Server-side rendering"
   * in the README). It gets the current state and the slice, and returns the new state. Return
   * the same state when nothing changes, so that nothing is published.
   *
   * Without it, the state must be a plain object, and the merge is shallow:
   * `{ ...state, ...slice }`. A class-based state needs this option, where its deserialization
   * also goes, since a slice is a plain object (in Next.js, it's a prop that a server component
   * gives to a client component, so it must be serializable):
   *
   * ```ts
   * mergeServerState: (state, slice: { user?: UserJson }) =>
   *   slice.user ? state.withUser(User.fromJson(slice.user)) : state,
   * ```
   */
  mergeServerState?: (state: St, slice: any) => St;

  /**
   * The `logger` is a function that Kiss uses when it calls `Store.log()`
   * to log information. It's set up during the creation of the store. For example:
   *
   * ```ts
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: (obj) => process.stdout.write(obj + '\n'),
   * });
   * ```
   *
   * Or using a logger library:
   *
   * ```ts
   * import { Logger } from 'my-logger-library';
   *
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: (obj) => Logger.log(obj),
   * });
   * ```
   *
   * Note, if you don't define a logger yourself, the default is to print
   * the log messages to the console with `console.log()`.
   *
   * This is how you may completely turn logging off:
   *
   * ```ts
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: null
   * });
   * ```
   */
  logger?: ((obj: any) => void) | null;

  /**
   * If `true`, will use Store.log() to log all state changes.
   * It uses `Store.describeStateChange()` to create the description of those changes.
   *
   * Note this is true (turned on) by default, as it may be useful for development, testing and
   * debugging. Be sure to turn it off in production, as it may slow down your application:
   *
   * ```ts
   * // In production
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logStateChanges: false,
   * });
   * ```
   */
  logStateChanges?: boolean;

  /**
   * An `errorObserver` can be set during the `Store` creation. It's a global way to
   * observe, change and swallow errors. It's given all errors thrown by your actions (including
   * those of type `UserException`), and also the errors of the `Persistor`.
   *
   * It's called with an object with these fields:
   *
   * - `error`: The error, AFTER the action's `wrapError` (or the persistor's `wrapError`).
   * - `originalError`: The error BEFORE `wrapError`.
   * - `action`: The action that threw the error, or `null` if the error didn't come from an
   *    action (for example, if it came from the `Persistor`). Always check for `null`.
   * - `store`: Use it to read the state, if it's relevant to the error. Do NOT use it to
   *    dispatch actions, as this may have unpredictable results.
   *
   * It must return the error to be used:
   *
   * - If it returns the same `error` unaltered, this original error will be used.
   * - If it returns something else, that will be used instead of `error`.
   * - If it returns `null` (or `undefined`, or nothing), the error is disabled (swallowed).
   *
   * IMPORTANT: If instead of RETURNING an error you THROW an error inside the
   * `errorObserver`, Kiss will catch it and use it instead of `error`. In other words,
   * returning an error or throwing an error works the same way. But it's recommended that you
   * return the error.
   *
   * Then, for the errors thrown by actions:
   * - A `UserException` is shown to the user (in the `showUserException` UI), and is not thrown.
   * - An `AbortDispatchException` aborts the action silently (see `AbortDispatchException`).
   *   Note the ones Kiss itself uses to abort actions (for example, for `ignoreOld` or
   *   `sequential`) are not given to the `errorObserver`.
   * - Any other error is thrown by `dispatch` (or rejects `dispatchAndWait`).
   *
   * And for the errors of the `Persistor` (thrown by `persistDifference` after the persistor's
   * `wrapError`, thrown while reading the persisted state, or added with `Persistor.addError`):
   * - A `UserException` is shown to the user.
   * - Any other error is thrown as an unhandled promise rejection, since there is no `dispatch`
   *   call to throw it to. Return `null` if you don't want that, for example after logging it.
   *
   * Without an `errorObserver`, all errors are used unaltered.
   *
   * Note the `errorObserver` is called AFTER the action's `wrapError`. It's not called if
   * `wrapError` returns `null`.
   *
   * Use cases:
   *
   * 1. Log errors to services like Sentry or Firebase Crashlytics in production, and print them
   *    to the console in development and tests. Since this is done in a centralized way, you
   *    don't have to "pollute" your code with logging calls. You can use the `action` to log the
   *    action name, and any action properties you may find interesting.
   *
   * 2. Have a global place to convert some errors into `UserException`s. For example, Firebase
   *    may throw some errors in response to a bad connection to the server. In this case, you
   *    may want to show the user a dialog explaining that the connection is bad, which you can
   *    do by converting it to a `UserException`. While this could also be done in the action's
   *    `wrapError`, you'd have to add it to all actions that use Firebase.
   *
   * For example:
   *
   * ```ts
   * errorObserver: ({ error, action }) => {
   *
   *   // Shows a dialog for connection errors.
   *   if (error instanceof ConnectionError)
   *     return new UserException('Please check your connection.').withHardCause(error);
   *
   *   // Throws the other errors during development and tests, so that we can see them.
   *   if (inDevelopment() || inTests() || (error instanceof UserException)) return error;
   *
   *   // In production, logs the other errors, and swallows them.
   *   Logger.error(`Got ${error} in ${action ?? 'the persistor'}.`);
   *   return null;
   * }
   * ```
   *
   * Note: Declared as a method so that observers typed with a non-null `action` still compile.
   */
  errorObserver?(params: {
    error: any,
    originalError: any,
    action: KissAction<St> | null,
    store: Store<St>,
  }): any;

  /**
   * An `actionObserver` can be set during the `Store` creation.
   * It's called whenever actions are dispatched, and also when they finish.
   * The action and the dispatch-count are available, as well as the `ini` parameter:
   * If `ini` is true, this is right before the action is dispatched.
   * If `ini` is false, this is right after the action finishes.
   *
   * The `actionObserver` is a good place to log which actions are dispatched by your application.
   * It should not throw errors. If it does, the error is ignored, and the action runs normally.
   * For example, the following code logs actions to the console in development or test mode.
   * and logs actions to Crashlytics in production mode:
   *
   * ```ts
   * actionObserver: (action, dispatchCount, ini) => {
   *   if (inDevelopment() || inTests()) {
   *      if (ini) console.log('Action dispatched: ' + action);
   *      else console.log('Action finished: ' + action);
   *   }
   *   else Crashlytics.log('Dispatched: ' + action);
   * }
   * ```
   */
  actionObserver?: (action: KissAction<St>, dispatchCount: number, ini: boolean) => void;

  /**
   * A `stateObserver`s can be set during the `Store` creation.
   * It's called for all dispatched actions, right after the reducer returns, before
   * the action's `after()` method, before the action's `wrapError()`, and before
   * the `errorObserver`.
   *
   * The parameters are:
   *
   * - action = The action itself.
   *
   * - prevState = The state right before the new state returned by the reducer is applied. Note
   *              this may be different from the state when the action was dispatched.
   *
   * - newState = The state returned by the reducer. Note: If you need to know if the state was
   *             changed or not by the reducer, you can compare both states:
   *             `let ifStateChanged = prevState !== newState;`
   *
   * - error = Is null if the action completed with no error. Otherwise, will be the error thrown
   *           by the reducer (before any wrapError is applied). Note that, in case of error, both
   *           `prevState` and `newState` will be the current store state when the error was thrown.
   *
   * - dispatchCount = The sequential number of the dispatch.
   *
   * The `stateObserver` should not throw errors. If it does, the error is ignored, and the
   * action runs normally.
   *
   * <br>
   *
   * The state-observer is a good place to add an interface to the Redux DevTools.
   * It's also a good place to add METRICS to your application. For example:
   *
   * ```ts
   * function stateObserver(action: KissAction<State>, prevState: State, newState: State, error: any, dispatchCount: number) {
   *   saveMetrics(action, newState, error);
   * }
   * ```
   *
   * An interesting idea is to add a method to the Action base class called `setMetrics`, that
   * allows actions to return tailored custom metrics about the action, and then use it in the
   * state-observer to track those metrics. For example:
   *
   * ```ts
   * class LoadUser extends Action {
   *   async reduce() {
   *     let user = await loadUser();
   *     this.log('User', user.id); // Here!
   *     return (state: State) => state.copy({ user });
   *   }
   * }
   *
   * stateObserver: (action, prevState, newState, error, dispatchCount) => {
   *   let actionLog = action.getLog(); // Here!
   *   saveMetrics(action, actionLog, newState, error);
   * }
   * ```
   */
  stateObserver?: (action: KissAction<St>, prevState: St, newState: St, error: any, dispatchCount: number) => void;

  /**
   * Where the store learns whether the app is **focused** (see `store.isFocused`). By default,
   * in the browser, the app is focused when the document is visible (`document.visibilityState`,
   * following the `visibilitychange` event), so switching to another browser tab, or minimizing
   * the window, makes it not focused. On the server, in Node and in React Native, where there
   * is no `document`, the default says the app is always focused.
   *
   * Give a source to use something else. It gets a `setFocused` function to call whenever the
   * value changes (and right away, with the current value, if it knows it), and returns a
   * function that stops listening, called by `store.dispose()`. For example, in React Native:
   *
   * ```ts
   * import { AppState } from 'react-native';
   *
   * const store = createStore<State>({
   *   initialState: State.initialState,
   *   focusSource: (setFocused) => {
   *     setFocused(AppState.currentState === 'active');
   *     const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active'));
   *     return () => sub.remove();
   *   },
   * });
   * ```
   *
   * The source is started lazily, when something first reads the signal: `store.isFocused`,
   * `useIsFocused()`, or a `useStoreEffect` with `onFocus`/`onBlur`. Until the source sets a
   * value, the app counts as focused. In tests, use `store.setFocused(bool)` instead.
   */
  focusSource?: AppSignalSource;

  /**
   * Where the store learns whether the app is **online** (see `store.isOnline`). By default, in
   * the browser, it's `navigator.onLine`, following the `online` and `offline` window events.
   * Where there is no `navigator.onLine` (the server, Node, React Native), the default says the
   * app is always online.
   *
   * Give a source to use something else, like `NetInfo` in React Native, or a ping to your own
   * server. It gets a `setOnline` function to call whenever the value changes (and right away,
   * with the current value, if it knows it), and returns a function that stops listening,
   * called by `store.dispose()`:
   *
   * ```ts
   * import NetInfo from '@react-native-community/netinfo';
   *
   * const store = createStore<State>({
   *   initialState: State.initialState,
   *   onlineSource: (setOnline) => NetInfo.addEventListener((s) => setOnline(s.isConnected === true)),
   * });
   * ```
   *
   * The online signal is also what the `checkInternet` and `unlimitedRetryCheckInternet`
   * action features check by default (the default `hasInternet()` of the actions reads
   * `store.isOnline`), so a custom source makes them work in React Native with no change to the
   * actions. The source is started lazily, when something first reads the signal. Until the
   * source sets a value, the app counts as online. In tests, use `store.setOnline(bool)`, or
   * `store.forceInternetOnOffSimulation`, which takes precedence for the action features.
   */
  onlineSource?: AppSignalSource;
}

/**
 * A source of the focus or online signal of the app (see `focusSource` and `onlineSource` in
 * `createStore`). It gets a function to call with the new value whenever it changes, and may
 * return a function that stops listening, called when the store is disposed.
 */
export type AppSignalSource = (set: (value: boolean) => void) => (() => void) | void;

/**
 * The store holds the state of the application and allows the state to be updated
 * by dispatching actions. The store is also responsible for showing user exceptions
 * to the user, persisting the state to the local device disk, processing wait states
 * to show spinners while async operations are in progress, and more.
 *
 * You can create a store with `const store = createStore()` or `const store = new Store()`.
 */
export function createStore<St>(params: ConstructorParams<St>): Store<St> {
  return new Store<St>(params);
}

// The store implements the TC39 explicit resource management protocol, so that tests can
// write `await using store = createStore(...)`. The methods are declared here, and added to the
// prototype at the end of this file, only if the runtime has the symbols (older ones don't).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface Store<St> {
  /** Same as `dispose()`, without waiting for the async disposals. For `using store = ...`. */
  [Symbol.dispose](): void;

  /** Same as `dispose()`. For `await using store = ...`. */
  [Symbol.asyncDispose](): Promise<void>;
}

/** A function the store calls when something it publishes may have changed. */
export type StoreListener = () => void;

/** Removes a listener. Calling it more than once does nothing. */
export type Unsubscribe = () => void;

/**
 * The listeners of one thing the store publishes (its state, the status of its actions, or its
 * readiness). The hooks subscribe through React's `useSyncExternalStore`, which gives the store
 * a plain callback. The store only tells the listeners that something may have changed. It
 * doesn't know what each component selected: React reads the value again and compares it.
 *
 * Notifying iterates over a copy of the listeners taken when the notification starts:
 * - A listener removed during the notification is not called (if it was not called yet).
 * - A listener added during the notification is only called by the next notification.
 * - A listener may dispatch, which notifies again, in a nested way, with the newest values.
 */
class Listeners {
  private readonly listeners = new Set<StoreListener>();

  constructor(private readonly batch: NotificationBatch) {}

  add(listener: StoreListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Calls the listeners now, or at the end of the current batch (see `NotificationBatch`). */
  notify(): void {
    if (this.listeners.size === 0) return;
    if (this.batch.depth > 0) {
      this.batch.pending.add(this);
      return;
    }
    for (const listener of Array.from(this.listeners)) {
      if (this.listeners.has(listener)) listener();
    }
  }
}

/**
 * Delays the notifications made during a synchronous dispatch until the dispatch finishes, so
 * that they are published once, with the final values. For example, a SYNC action starts and
 * finishes inside the same `dispatch` call: without the batch, the start would make React check
 * the `useIsWaiting` components (and schedule a render for the ones whose action type just
 * started), only to find the action already finished when it renders.
 *
 * The batch only covers the synchronous part of a dispatch. An ASYNC action publishes its start
 * when `dispatch` returns, and its end when it finishes, outside any batch. The batch is never
 * held across an `await`. Nested dispatches (from an observer, or `dispatchWhen`) are published
 * together with the outer one, when it finishes. If anything throws, the batch still ends.
 */
class NotificationBatch {
  depth = 0;
  readonly pending = new Set<Listeners>();

  run<T>(fn: () => T): T {
    this.depth++;
    try {
      return fn();
    } finally {
      this.depth--;
      if (this.depth === 0 && this.pending.size > 0) {
        const pending = Array.from(this.pending);
        this.pending.clear();
        for (const listeners of pending) listeners.notify();
      }
    }
  }

  /**
   * Like `run`, but instead of publishing the notifications when `fn` finishes, returns a
   * function that publishes them, for the caller to call when it's safe. Used by `StoreSlice`,
   * which changes the state while React renders it (where a notification would make React warn
   * about updating other components during a render), and publishes after the commit. Inside
   * another batch, the notifications are left to that batch, and the returned function does
   * nothing.
   */
  suspend(fn: () => void): () => void {
    this.depth++;
    try {
      fn();
    } finally {
      this.depth--;
    }
    if (this.depth > 0 || this.pending.size === 0) return () => {};
    const pending = Array.from(this.pending);
    this.pending.clear();
    return () => {
      for (const listeners of pending) listeners.notify();
    };
  }
}

/**
 * One of the signals of the app the store publishes: whether the app is focused, or online
 * (see `focusSource` and `onlineSource` in `ConstructorParams`). The value comes from a source,
 * started lazily the first time the value is read or subscribed to, so that a store that never
 * needs the signal (a server store, most tests) never listens to anything. The value is `true`
 * until the source says otherwise.
 *
 * Tests set the value by hand with `set(boolean)`, which disconnects the source (otherwise a
 * late start of the source could overwrite the value the test set). `set(null)` connects the
 * source again. After `dispose()`, the source is stopped and never started again.
 */
class AppSignal {
  private _value = true;
  private _isStarted = false;
  private _isManual = false;
  private _isDisposed = false;
  private _stopSource: (() => void) | void = undefined;

  constructor(
    private readonly source: AppSignalSource,
    private readonly listeners: Listeners,
    private readonly onStopError: (error: unknown) => void,
  ) {}

  get value(): boolean {
    this._start();
    return this._value;
  }

  subscribe(listener: StoreListener): Unsubscribe {
    this._start();
    return this.listeners.add(listener);
  }

  set(value: boolean | null): void {
    if (value === null) {
      if (!this._isManual) return;
      this._isManual = false;
      // Starts the source again, from the default value, and notifies once if the value
      // changed, whether the source set it or not (where there is no source, it's `true` again).
      const old = this._value;
      this._value = true;
      this._isSilent = true;
      try {
        this._start();
      } finally {
        this._isSilent = false;
      }
      if (this._value !== old) this.listeners.notify();
      return;
    }
    this._isManual = true;
    this._stop();
    this._update(value);
  }

  // True while the source is started again by `set(null)`, so that `_update` doesn't notify.
  private _isSilent = false;

  dispose(): void {
    this._isDisposed = true;
    this._stop();
  }

  private _start(): void {
    if (this._isStarted || this._isManual || this._isDisposed) return;
    this._isStarted = true;
    this._stopSource = this.source((value) => {
      if (this._isStarted) this._update(value === true);
    });
  }

  private _stop(): void {
    if (!this._isStarted) return;
    this._isStarted = false;
    const stop = this._stopSource;
    this._stopSource = undefined;
    try {
      stop?.();
    } catch (error) {
      this.onStopError(error);
    }
  }

  private _update(value: boolean): void {
    if (value === this._value) return;
    this._value = value;
    if (!this._isSilent) this.listeners.notify();
  }
}

// The default sources only touch the browser globals when they exist, so that the same code
// runs on the server, in Node and in React Native (which has `window` and `navigator`, but no
// `document` and no `navigator.onLine`).

/** The default `focusSource`: the document is visible. See `ConstructorParams.focusSource`. */
const defaultFocusSource: AppSignalSource = (setFocused) => {
  const doc: Document | undefined = (typeof document === 'undefined') ? undefined : document;
  if (doc === undefined || typeof doc.addEventListener !== 'function') return;
  const update = () => setFocused(doc.visibilityState !== 'hidden');
  update();
  doc.addEventListener('visibilitychange', update);
  return () => doc.removeEventListener('visibilitychange', update);
};

/** The default `onlineSource`: `navigator.onLine`. See `ConstructorParams.onlineSource`. */
const defaultOnlineSource: AppSignalSource = (setOnline) => {
  const nav: Navigator | undefined = (typeof navigator === 'undefined') ? undefined : navigator;
  if (nav === undefined || typeof nav.onLine !== 'boolean') return;
  setOnline(nav.onLine);
  const win: Window | undefined = (typeof window === 'undefined') ? undefined : window;
  if (win === undefined || typeof win.addEventListener !== 'function') return;
  const online = () => setOnline(true);
  const offline = () => setOnline(false);
  win.addEventListener('online', online);
  win.addEventListener('offline', offline);
  return () => {
    win.removeEventListener('online', online);
    win.removeEventListener('offline', offline);
  };
};

/**
 * The store holds the state of the application and allows the state to be updated
 * by dispatching actions. The store is also responsible for showing user exceptions
 * to the user, persisting the state to the local device disk, processing wait states
 * to show spinners while async operations are in progress, and more.
 *
 * You can create a store with `const store = createStore()` or `const store = new Store()`.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Store<St> {

  // Note: The lifecycle methods of the actions (like `before`, `reduce` and `after`) are
  // protected, so that only the store calls them, when the action is dispatched. The store
  // calls them as `action['before']()`, which TypeScript allows for protected members.

  // The store publishes three separate things to React, each with its own listeners, so that a
  // change in one of them doesn't make React check the components that use another:
  // - The state: changed by `_registerState`.
  // - The status of the actions (`isWaiting`, `isFailed`, `exceptionFor`): changed when an
  //   action starts, finishes or fails, and by `clearExceptionFor`.
  // - The readiness (`_isReady`): changed once, when the persisted state finishes loading.
  //
  // The hooks give these to React's `useSyncExternalStore`: `_subscribeState` with `_getState`,
  // `_subscribeStatus` with `isWaiting`/`isFailed`/`exceptionFor`, and `_subscribeReady` with
  // `_getIsReady`. The store notifies the listeners AFTER all the values of a change are in
  // place, so that a render sees them together (for example, the new state and the end of the
  // waiting of the action that produced it). React decides when to render.
  private readonly _notificationBatch = new NotificationBatch();
  private readonly _stateListeners = new Listeners(this._notificationBatch);
  private readonly _statusListeners = new Listeners(this._notificationBatch);
  private readonly _readyListeners = new Listeners(this._notificationBatch);

  /**
   * Internal: subscribes to state changes. Used by `useSelect`, `useObject` and `useAllState`.
   * The function is stable for the store, so React doesn't resubscribe on every render.
   * @internal
   */
  public _subscribeState: (listener: StoreListener) => Unsubscribe = (listener) => this._stateListeners.add(listener);

  /**
   * Internal: subscribes to changes in the status of the actions. Used by `useIsWaiting`,
   * `useIsFailed` and `useExceptionFor`.
   * @internal
   */
  public _subscribeStatus: (listener: StoreListener) => Unsubscribe = (listener) => this._statusListeners.add(listener);

  /** Internal: subscribes to the store becoming ready. Used by `useIsStoreReady`. @internal */
  public _subscribeReady: (listener: StoreListener) => Unsubscribe = (listener) => this._readyListeners.add(listener);

  /** Internal: returns the current state. The same as `store.state`, as a stable function. @internal */
  public _getState: () => St = () => this._state;

  /** Internal: returns `_isReady`, as a stable function. @internal */
  public _getIsReady: () => boolean = () => this._isReady;

  // The focus and online signals of the app (see `focusSource` and `onlineSource` in
  // `ConstructorParams`). Each has its own listeners, like the state, the status and the
  // readiness, so that a change in one doesn't make React check the components using the other.
  private readonly _focusListeners = new Listeners(this._notificationBatch);
  private readonly _onlineListeners = new Listeners(this._notificationBatch);
  private readonly _focus: AppSignal;
  private readonly _online: AppSignal;

  /** Internal: subscribes to the focus signal. Used by `useIsFocused` and `useStoreEffect`. @internal */
  public _subscribeFocus: (listener: StoreListener) => Unsubscribe = (listener) => this._focus.subscribe(listener);

  /** Internal: subscribes to the online signal. Used by `useIsOnline` and `useStoreEffect`. @internal */
  public _subscribeOnline: (listener: StoreListener) => Unsubscribe = (listener) => this._online.subscribe(listener);

  /** Internal: returns `isFocused`, as a stable function. @internal */
  public _getIsFocused: () => boolean = () => this._focus.value;

  /** Internal: returns `isOnline`, as a stable function. @internal */
  public _getIsOnline: () => boolean = () => this._online.value;

  /**
   * Whether the app is focused. In the browser, by default, this means the document is visible:
   * the user is on the tab that shows the app, and the window is not minimized. Where the store
   * can't know (the server, Node, React Native without a `focusSource`), it's always `true`.
   * See `focusSource` in `createStore` to change where it comes from.
   *
   * In components, use `useIsFocused()`, or `useStoreEffect` with `onFocus` and `onBlur` to
   * dispatch actions when the app is focused again (for example, to reload the data on screen).
   *
   * The first read starts listening to the source. In tests, set it with `setFocused`.
   */
  get isFocused(): boolean {
    return this._focus.value;
  }

  /**
   * Whether the app is online. In the browser, by default, it's `navigator.onLine`, which only
   * says if there is a local network connection, not if the internet is reachable. Where the
   * store can't know (the server, Node, React Native without an `onlineSource`), it's always
   * `true`. See `onlineSource` in `createStore` to change where it comes from (for example,
   * `NetInfo` in React Native, or a ping to your server).
   *
   * It's what the `checkInternet` and `unlimitedRetryCheckInternet` action features check by
   * default (through the default `hasInternet()` of the actions). In components, use
   * `useIsOnline()`, or `useStoreEffect` with `onOnline` and `onOffline` to dispatch actions
   * when the internet comes back.
   *
   * The first read starts listening to the source. In tests, set it with `setOnline`.
   */
  get isOnline(): boolean {
    return this._online.value;
  }

  /**
   * Sets `isFocused` by hand, for tests. The store then stops listening to its `focusSource`,
   * and only changes when you call this again. Pass `null` to listen to the source again:
   *
   * ```ts
   * store.setFocused(false); // The user went to another tab.
   * store.setFocused(true);  // The user came back: `onFocus` callbacks run.
   * ```
   */
  setFocused(isFocused: boolean | null): void {
    this._focus.set(isFocused);
  }

  /**
   * Sets `isOnline` by hand, for tests. The store then stops listening to its `onlineSource`,
   * and only changes when you call this again. Pass `null` to listen to the source again:
   *
   * ```ts
   * store.setOnline(false); // The internet went down: `checkInternet` actions fail.
   * store.setOnline(true);  // It's back: `onOnline` callbacks run.
   * ```
   *
   * See also `forceInternetOnOffSimulation`, which only affects the action features, and takes
   * precedence over this for them.
   */
  setOnline(isOnline: boolean | null): void {
    this._online.set(isOnline);
  }

  /**
   * Internal: the `initialState` passed to the constructor. It's the state the server rendered,
   * and the state a client store hydrates with, unless `StoreProvider` is given a `serverState`.
   * @internal
   */
  public readonly _initialState: St;

  /**
   * The `Store.log()` is a static function that Kiss uses internally to log information.
   * If you want, you can also use it yourself, like this:
   *
   * ```ts
   * Store.log('Some information: ' + someVariable);
   * ```
   *
   * The log function is set during the creation of the store,
   * using the `logger` constructor parameter. For example:
   *
   * ```ts
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: (obj) => process.stdout.write(obj + '\n'),
   * });
   * ```
   *
   * Or using a logger library:
   *
   * ```ts
   * import { Logger } from 'my-logger-library';
   *
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: (obj) => Logger.log(obj),
   * });
   * ```
   *
   * Note, if you don't define a logger yourself, the default is to print
   * the log messages to the console with `console.log()`.
   *
   * This is how you may completely turn logging off:
   *
   * ```ts
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logger: null,
   * });
   * ```
   *
   * Setting the logger to `null` is better than using an empty function, because Kiss then
   * skips building its log messages (for example, the description of each dispatched action).
   */
  public static log: (obj: any) => void;

  // The logger used when the `logger` constructor parameter is `null`.
  private static _noLogger = (_obj: any) => {};

  /**
   * For Kiss internal use only. Logs the message returned by `buildMessage`, but only calls it
   * when logging is turned on, so that no work is done to build messages that are discarded.
   * @internal
   */
  static _logLazy(buildMessage: () => any): void {
    if (Store._isLogging()) Store.log(buildMessage());
  }

  // Returns false when the logger was set to `null`.
  private static _isLogging(): boolean {
    return Store.log !== Store._noLogger;
  }

  private _state: St;

  // When true, no actions can be dispatched.
  private _shutDown: boolean = false;

  /**
   * Set this to `true` when you want to abort any new actions that are dispatched.
   * Note this will not stop async actions already running, but you can wait for them to finish:
   *
   * ```ts
   * await store.waitAllActions(null, {
   *   timeoutMillis: 5000,
   *   completeImmediately: true
   * }).catch((error) => { });
   * ```
   *
   * Set this back to `false` to restart the store accepting new action dispatches.
   *
   * Shutting down the store also calls `clearInternalActionProps()`, which, for example, stops
   * all polling (see `KissAction.poll`), and stops the actions that retry. The polling and the
   * retries are not restarted when you set this back to `false`.
   */
  public setShutDown(shutDown: boolean) {
    this._shutDown = shutDown;
    if (shutDown) this.clearInternalActionProps();
  }

  // How many `logOut` calls are running. While a logOut is running, no actions can be
  // dispatched, but this is kept apart from `_shutDown`, so that a store shut down by the app,
  // before or during logOut, stays shut down after it.
  private _logOutsRunning = 0;

  // True only while `logOut` dispatches the action that changes the store state to the
  // initial-state. That's the only dispatch allowed while a logOut is running, or while the
  // store is shut down. It's set back to false as soon as that action starts (see
  // `_processDispatch`), so that the actions dispatched while it runs (by the `stateObserver`,
  // the `actionObserver`, or `dispatchWhen`) are not accepted.
  private _isApplyingLogOutState = false;

  private _isShutDown(): boolean {
    if (this._isApplyingLogOutState) return false;
    return this._shutDown || this._disposed || (this._logOutsRunning > 0);
  }

  // How many times `clearInternalActionProps()` was called. An action dispatched before the last
  // call stops retrying. See `KissAction._clearCountAtDispatch`.
  private _clearCount = 0;

  // How many times `logOut()` was called. The result of an action dispatched before the last call
  // is discarded, and so are the actions it dispatches. See `KissAction._logOutCountAtDispatch`.
  private _logOutCount = 0;

  // True if a `logOut()` was called after the action was dispatched.
  private _wasDispatchedBeforeLogOut(action: KissAction<St>): boolean {
    return action._logOutCountAtDispatch !== this._logOutCount;
  }

  // The error of an action dispatched before a `logOut()`, when it finishes.
  private static _logOutDiscardError(): AbortDispatchException {
    return kissAbort('The action was dispatched before logOut, so its result was discarded.');
  }

  // Called when the reducer of the action finishes. If a `logOut()` was called after the action
  // was dispatched, throws, so that the action is aborted, instead of changing the state of the
  // next user.
  private _throwIfDispatchedBeforeLogOut(action: KissAction<St>): void {
    if (this._wasDispatchedBeforeLogOut(action)) throw Store._logOutDiscardError();
  }

  // Returns true (and logs it) if the action is being dispatched, with `this.dispatch` and
  // similar, by an action that was dispatched before a `logOut()`. In this case the store
  // doesn't accept it, since it belongs to the previous user.
  private _isDispatchedByActionBeforeLogOut(action: KissAction<St>): boolean {
    const parentCount = action._parentLogOutCount;
    if (parentCount === null || parentCount === this._logOutCount) return false;
    Store._logLazy(() => `Can't dispatch action ${action} because it was dispatched by an action that was dispatched before logOut.`);
    return true;
  }

  // The functions that end the waits of the actions waiting to retry. See `_waitRetryDelay`.
  private _retryWaitEnders = new Set<() => void>();

  // Ends the waits of all actions waiting to retry, which then abort.
  private _stopAllRetries(): void {
    const enders = [...this._retryWaitEnders];
    this._retryWaitEnders.clear();
    for (const end of enders) end();
  }

  // The error of an action that stopped retrying because `clearInternalActionProps()` was called.
  private static _clearedRetryError(): AbortDispatchException {
    return kissAbort('The internal action props were cleared, so the action stopped retrying.');
  }

  /**
   * For Kiss internal use only.
   * Returns true if `clearInternalActionProps()` was called (for example, by shutting down the
   * store) after the action was dispatched, so that the action must stop retrying.
   * @internal
   */
  _wereInternalActionPropsCleared(action: KissAction<St>): boolean {
    return action._clearCountAtDispatch !== this._clearCount;
  }

  /**
   * For Kiss internal use only.
   * Waits for the delay before the action retries. Throws an `AbortDispatchException` if
   * `clearInternalActionProps()` was called (for example, by shutting down the store) after
   * the action was dispatched, either before or during the wait, so that it stops retrying.
   * Also throws it if the action uses `ignoreOld`, and became old, since the result of the
   * retry would be ignored anyway.
   * @internal
   */
  async _waitRetryDelay(action: KissAction<St>, delay: number): Promise<void> {
    const throwIfMustStop = () => {
      if (this._wereInternalActionPropsCleared(action)) throw Store._clearedRetryError();
      if (action.isAborted) throw this._abortError(action);
    };
    throwIfMustStop();

    // The action stops waiting as soon as it's aborted.
    const signal = action.abortSignal;

    await new Promise<void>(resolve => {
      const end = () => {
        clearTimeout(timer);
        this._retryWaitEnders.delete(end);
        signal.removeEventListener('abort', end);
        resolve();
      };
      const timer = setTimeout(end, capTimeoutMillis(delay));
      this._retryWaitEnders.add(end);
      signal.addEventListener('abort', end);
    });

    throwIfMustStop();
  }

  /**
   * Clears the information the store keeps for the action features, so that actions dispatched
   * from now on behave as if no action had been dispatched before. This is useful during logout,
   * to stop the effects of the actions of the previous user, and to make sure they don't
   * affect the next user. It's also called when the store is shut down (see `setShutDown`).
   *
   * It does the following:
   * - Removes all `fresh` keys, so the next dispatches run even if the data was still fresh.
   *   Otherwise, after logging in again, loading the new user's data could be aborted.
   * - Removes all `throttle` locks, for the same reason.
   * - Removes all `debounce` locks. Actions still waiting for their debounce period finish right
   *   away, without running their reducer.
   * - Stops all polling (see `KissAction.poll`).
   * - Discards the actions waiting in all `sequential` queues. They are aborted without running,
   *   like when a failed action discards its queue (see `discardQueueOnError()`). Actions
   *   dispatched from now on start new queues, and don't wait for the actions still running.
   * - Stops the actions that retry, with `retry` or `unlimitedRetryCheckInternet`, so that they
   *   don't keep retrying for the previous user. An action waiting to retry is aborted right
   *   away, and an action running an attempt is aborted if that attempt fails (if it succeeds,
   *   it changes the state as usual). They are aborted with an `AbortDispatchException`, so they
   *   don't fail, and don't show errors. This also releases their non-reentrant keys. The same
   *   goes for an `OptimisticCommand` with `retry`, which then doesn't roll back its optimistic
   *   value, and doesn't reload.
   * - Releases all `OptimisticSync` and `OptimisticSyncWithPush` keys, so the next dispatches
   *   send their own requests. An action whose request is in flight stops when that request
   *   finishes, without sending follow-up requests, and is aborted with an
   *   `AbortDispatchException`.
   * - Removes the revisions that `OptimisticSyncWithPush` and `ServerPush` keep for each key.
   *   The server revisions you saved in the state are kept, and still used.
   * - Forgets the `ignoreOld` keys. The actions dispatched from now on don't make the ones
   *   dispatched before old.
   * - Clears the failures of all actions (see `clearAllExceptions()`), so that `isFailed` is
   *   `false` and `exceptionFor` is `null` for all action types. The new user doesn't see the
   *   errors of the previous one.
   *
   * Note:
   * - Actions that are already running keep running, and still change the state when they
   *   finish. For example, an action that started loading the data of the previous user before
   *   the logout can still put that data into the state after the logout. To avoid that, use
   *   `logOut()`, which also discards the result of the actions dispatched before it.
   * - It doesn't affect `nonReentrant` actions or `OptimisticCommand`s, since their keys belong to
   *   the actions that are running, and are released when those actions finish.
   *
   * Usage:
   *
   * ```ts
   * class Logout extends KissAction<State> {
   *   reduce() {
   *     this.store.clearInternalActionProps();
   *     return State.initialState();
   *   }
   * }
   * ```
   */
  clearInternalActionProps(): void {
    this._removeAllFreshKeys();
    this._removeAllThrottleLocks();
    this._removeAllDebounceLocks();
    this._stopAllPolling();
    this._discardAllSequentialQueues();
    this._removeAllOptimisticSyncKeys();
    this._clearCount++;
    this._stopAllRetries();
    this.clearAllExceptions();
  }

  /**
   * If you are running tests, you can change `forceInternetOnOffSimulation` to simulate the
   * internet connection as ON or OFF for all actions that use `checkInternet` or
   * `unlimitedRetryCheckInternet`.
   *
   * - Return `true` if there IS internet.
   * - Return `false` if there is NO internet.
   * - Return `null` to use the real internet connection status (default).
   *
   * Example:
   *
   * ```ts
   * store.forceInternetOnOffSimulation = () => false;
   * ```
   *
   * This is specially useful during tests, for testing what happens when you have no internet
   * connection. And since it's tied to the store, it automatically resets when the store is
   * recreated.
   *
   * Note the simulation takes precedence over the action's `hasInternet()` method, even if you
   * override it. To simulate the connection for a single action, override its
   * `internetOnOffSimulation` getter instead.
   */
  public forceInternetOnOffSimulation: () => boolean | null = () => null;

  /**
   * A queue of errors of type UserException, thrown by actions.
   * They are shown to the user using the function `showUserException`.
   * This is public if you need it for advanced stuff, but you should probably not touch it.
   */
  public readonly userExceptionsQueue: UserException[];

  /**
   * If `true`, will use Store.log() to log all state changes.
   * It uses `Store.describeStateChange()` to create the description of those changes.
   *
   * Note this is true (turned on) by default, as it may be useful for development, testing and
   * debugging. Be sure to turn it off in production, as it may slow down your application:
   *
   * ```ts
   * // In production
   * const store = new Store<State>({
   *   initialState: new State(),
   *   logStateChanges: false,
   * });
   * ```
   */
  private readonly _logStateChanges: boolean;

  /**
   * The async actions that are currently being processed.
   * Use `isWaiting` to know if an action is currently being processed.
   */
  private readonly _actionsInProgress: Set<KissAction<St>>;

  /**
   * The non-reentrant actions that are running, which hold their non-reentrant keys.
   * Unlike `_actionsInProgress`, an action only leaves this set after its `after()` method
   * runs, even if its state was already applied.
   */
  private readonly _nonReentrantActionsRunning: Set<KissAction<St>>;

  /**
   * The promises given to `useSuspense`, one per action type and `statusKey` that a suspended
   * component waits for. The list is only filled when `useSuspense` is called while the action
   * is in progress, and emptied as the actions finish, so a store whose components never call
   * `useSuspense` keeps it empty, and only checks its size when an action finishes.
   */
  private readonly _suspenseWaits: SuspenseWait[] = [];

  /**
   * The failures of the actions that failed recently.
   * When an action fails with any error (that was not swallowed, and is not an
   * `AbortDispatchException`), its error is added here, indexed by the action type, together
   * with the action's `statusKey`. Only the type, the key and the error are kept, not the action.
   * A failure is removed when an action of the same type and `statusKey` is dispatched again,
   * by `clearExceptionFor`, or by `clearAllExceptions` (which `clearInternalActionProps` calls).
   *
   * Use `isFailed`, `exceptionFor` and `clearExceptionFor` to know if you should display
   * some error message due to an action failure.
   *
   * Note: Throwing an `UserException` can show a modal dialog to the user, and also show the error
   * as a message in the UI. If you don't want to show the dialog you can use the `noDialog`
   * getter in the error message: `throw new UserException('Invalid input').noDialog`.
   */
  private readonly _failedActions: Map<new (...args: any[]) => KissAction<St>, Failure[]>;

  /**
   * Helps implement the waitCondition method.
   */
  private _waitConditions: Array<{
    check: (state: St) => boolean,
    resolve: (triggerAction: KissAction<St>) => void,
    reject: (error: unknown) => void
  }> = [];

  /**
   * Helps implement the `dispatchWhen` method. One function for each `dispatchWhen` whose
   * condition was met by the current state change, called when `_registerState` finishes.
   * It checks the condition again, and dispatches the action if it's still met.
   */
  private _dispatchWhenQueue: Array<() => void> = [];

  /**
   * Helps implement the `dispatchWhen` method. The functions that cancel the `dispatchWhen`s
   * that are still waiting for their condition. See `_cancelAllDispatchWhen`.
   */
  private _dispatchWhenCancels = new Set<() => void>();

  // Cancels all `dispatchWhen`s that are still waiting for their condition, or queued to be
  // dispatched. Their actions are not dispatched, and their `onTimeout` is not called.
  private _cancelAllDispatchWhen(): void {
    const cancels = [...this._dispatchWhenCancels];
    this._dispatchWhenCancels.clear();
    for (const cancel of cancels) cancel();
    this._dispatchWhenQueue = [];
  }

  // Rejects the `waitCondition`s and `waitActionCondition`s (which also serve `waitAllActions`,
  // `waitActionType` etc.) that are still waiting, with an `AbortDispatchException`, and cancels
  // their timeouts. Called by `dispose()`, after `_cancelAllDispatchWhen()` removed the
  // `dispatchWhen` entries from `_waitConditions`, so that only real waits are left.
  private _abortAllWaits(): void {
    const waits = [...this._waitConditions, ...this._waitActionConditions];
    this._waitConditions = [];
    this._waitActionConditions = [];
    for (const wait of waits) wait.reject(kissAbort('The store was disposed, so the wait was aborted.'));
  }

  /**
   * Helps implement the `waitActionCondition` method.
   */
  private _waitActionConditions: Array<{
    check: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => boolean,
    resolve: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => void,
    reject: (error: unknown) => void
  }> = [];

  // The `debounce` actions waiting for their debounce period, at most one per lock.
  // Calling `cancel` makes the action finish without running its reducer.
  private _debounceLocks: Array<{ lock: any, cancel: () => void }> = [];

  // The `throttle` locks, at most one per lock, with the instant their throttle period ends,
  // and the action that took them. Expired locks are removed when checking or releasing locks.
  private _throttleLocks: Array<{ lock: any, expiresAt: number, action: KissAction<St> }> = [];

  // The `fresh` keys, at most one per key, with the instant their fresh period ends, and the
  // action that made them fresh. Expired keys are removed when checking or releasing keys.
  private _freshKeys: Array<{ key: any, expiresAt: number, action: KissAction<St> }> = [];

  // The `OptimisticSync` and `OptimisticSyncWithPush` keys with a request in flight, at most one
  // per key, with the action that sends the requests for that key.
  private _optimisticSyncKeys: Array<{ key: any, action: KissAction<St> }> = [];

  // The revisions of the `OptimisticSyncWithPush` and `ServerPush` keys, at most one per key.
  private _optimisticSyncRevisions: Array<{ key: any, revision: _OptimisticSyncRevision }> = [];

  // The `sequential` queues, at most one per key, each with its actions in the order they will
  // run. The first action of each queue is the one running. Each waiting action is released by
  // the action that runs before it (with `false`), or by a failed action that discards the queue
  // (with `true`). Empty queues are removed.
  private _sequentialQueues: Array<{
    key: any,
    entries: Array<{ action: KissAction<St>, release: (discarded: boolean) => void }>
  }> = [];

  // The active polling cycles, at most one per polling key. A new cycle is created each time
  // polling starts or restarts for a key, so that the ticks of a stopped or restarted cycle can
  // tell they must not continue. While a tick is running (when `pollWaitsForRun` is true) the
  // cycle has no timer, but polling is still active.
  private _pollingCycles: Array<PollingCycle> = [];

  // The errors thrown by `dispatchSync` when the action is ASYNC. See `_notSyncError`.
  private readonly _notSyncErrors = new WeakSet<StoreException>();

  /**
   * Internal: the events (`Evt`) that `useEvent` or `useLayoutEvent` already handled (spent).
   * They are kept here, and not in the events, so that the events, and the state, stay
   * immutable. A `WeakSet`, so that events nobody references anymore are garbage collected.
   * Use `isEventSpent` instead.
   * @internal
   */
  public readonly _spentEvents = new WeakSet<Evt<any>>();

  // The store props (see `setProp`), in the order they were set, and the `dispose` option of
  // the ones that have one.
  private readonly _props = new Map<unknown, unknown>();
  private readonly _propDisposers = new Map<unknown, PropDispose>();

  // True after `dispose()` was called. A disposed store doesn't accept actions or props.
  private _disposed = false;

  // The environment, the configuration and the dependencies (see `ConstructorParams`). The
  // last two are created by factories, in the constructor.
  private readonly _environment: unknown;
  private readonly _configuration: unknown;
  private readonly _dependencies: unknown;

  private readonly _processPersistence: ProcessPersistence<St> | null;
  private _dispatchCount = 0;

  // A function that shows `UserExceptions` to the user, using some UI like a dialog or a toast.
  // This function is passed to the constructor. If not passed, the `UserException` is ignored.
  private readonly _showUserException: ShowUserException;

  // The `mergeServerState` option of the constructor. See `_mergeSlice`.
  private readonly _mergeServerStateFn: ((state: St, slice: any) => St) | undefined;

  // The slices merged before the store was ready (the persistor still reading). The persisted
  // state replaces the state when it arrives, and these are merged into it again, so that the
  // server data of the route is not lost. Cleared when the store is ready.
  private _pendingServerSlices: object[] = [];

  // True while `_mergeServerState` dispatches, so that the dispatch is allowed before the
  // store is ready (like the persistor's own `UpdateStateAction`).
  private _applyingServerSlice = false;

  private readonly _errorObserver?: ConstructorParams<St>['errorObserver'];
  private readonly _actionObserver?: (action: KissAction<St>, dispatchCount: number, ini: boolean) => void;
  private readonly _stateObserver?: (action: KissAction<St>, prevState: St, newState: St, error: any, dispatchCount: number) => void;

  /**
   * You can use `store.mocks` to mock actions. You should use this for testing purposes, only.
   *
   * To mock actions and their reducers, use `store.mocks.add(actionType, mockFunction)`
   * multiple times, one for each **action type** you want to mock.
   *
   * By adding mocks to the store, the `mockFunction` will be called
   * to return a mocked action that will be used instead of the original actions, when dispatching.
   * You can mock an action to return a specific state, to throw an error,
   * or even to abort the action.
   *
   * Usage:
   *
   * - `store.mocks.add(actionType, (actionType) => mockAction)`:
   *    Adds a mock action to the store. Whenever an action of type `actionType` is
   *    dispatched, `mockAction` will be dispatched instead. If you pass `mockAction` as null,
   *    actions of type `actionType` will be ignored when dispatched.
   *
   * - `remove(actionType)`:
   *    Removes a mock action from the store. Note you should pass the
   *    type of the action that was mocked, and NOT the type of the mock.
   *
   * - `clear()`:
   *    Removes all mock actions from the store.
   *
   *  Examples:
   *
   * ```ts
   * // When an IncrementAction is dispatched, AddAction(1) will be dispatched instead.
   * store.mocks.add(IncrementAction, (action) => new AddAction(1));
   *
   * // When an IncrementAction is dispatched, it will be ignored.
   * store.mocks.add(IncrementAction, null);
   *
   * // Removes the mock for Increment.
   * store.mocks.remove(IncrementAction);
   *
   * // Removes all mocks.
   * store.mocks.clear();
   *
   * // When an AddAction is dispatched, the value will be subtracted instead.
   * store.mocks.add(AddAction, (action) => new AddAction(-action.value));
   * ```
   */
  public mocks: Mocks<St> = new Mocks<St>();

  public readonly record = {
    isRecording: false,
    changes: [] as Array<{
      action: KissAction<St>,
      ini: boolean,
      prevState: St,
      newState: St,
      error: any,
      dispatchCount: number
    }>,
    start: () => {
      this.record.isRecording = true;
      this.record.changes = [];
    },
    stop: () => {
      this.record.isRecording = false;
    },
    result: () => {
      return this.record.changes;
    },
    toString: () => {
      let count = 0;
      return '[\n' + this.record.changes.map(change =>
        `${count++}. ` +
        `${change.action.constructor.name} ${change.ini ? 'ini(' + change.dispatchCount + ')' : 'end'}: ` +
        ((change.ini) ? change.prevState : `${change.prevState} → ${change.newState}`) +
        `${change.error ? `, error: ${change.error}` : ''}`
      ).join('\n') + '\n]';
    }
  };

  // The default logger prints messages to the console.
  // An alternative is: `const logger = (obj: any) => process.stdout.write(obj + '\n');`
  private _defaultLogger(obj: any) {
    console.log(obj);
  };

  // The default Ui just logs all user-exceptions and removes them from the queue.
  private _defaultShowUserException(exception: UserException, _count: number, next: () => void) {
    Store._logLazy(() => `User got an exception: ${exception}`);
    next();
  };

  constructor({
                initialState,
                environment,
                configuration,
                dependencies,
                showUserException,
                persistor,
                mergeServerState,
                errorObserver,
                actionObserver,
                stateObserver,
                logger,
                logStateChanges,
                focusSource,
                onlineSource,
              }: ConstructorParams<St>
  ) {
    this._state = initialState;
    this._focus = new AppSignal(focusSource ?? defaultFocusSource, this._focusListeners,
      (error) => this._reportDisposeError(error, 'Stopping the focus source threw an error'));
    this._online = new AppSignal(onlineSource ?? defaultOnlineSource, this._onlineListeners,
      (error) => this._reportDisposeError(error, 'Stopping the online source threw an error'));
    this._initialState = initialState;
    this._environment = environment;
    this._showUserException = showUserException || this._defaultShowUserException;
    this._mergeServerStateFn = mergeServerState;
    this._processPersistence = (persistor === undefined) ? null : new ProcessPersistence(persistor, initialState);
    this._errorObserver = errorObserver;
    this._actionObserver = actionObserver;
    this._stateObserver = stateObserver;
    this.userExceptionsQueue = [];
    this._actionsInProgress = new Set();
    this._nonReentrantActionsRunning = new Set();
    this._failedActions = new Map<new (...args: any[]) => KissAction<St>, Failure[]>();
    Store.log = (logger === null) ? Store._noLogger : (logger || this._defaultLogger);
    this._logStateChanges = logStateChanges ?? true;

    // The configuration is created first, so that the dependencies factory can read it. Both
    // are created before the persisted state is read, since the `errorObserver` may read them.
    // If a factory throws, the store creation fails.
    this._configuration = configuration?.(this);
    this._dependencies = dependencies?.(this);

    if (this._processPersistence != null) {
      this._processPersistence.onError =
        (error: any, originalError: any, observeOnly: boolean) =>
          this._processPersistorError(error, originalError, observeOnly);
      // Publishes the readiness as soon as it changes (the persisted state was read and applied,
      // or the initial state was saved, or that failed and the store keeps the initial state).
      this._processPersistence.onReady = () => {
        this._pendingServerSlices = [];
        this._readyListeners.notify();
      };
      this._processPersistence.readInitialState(this, initialState).catch(() => {});
    }

    this._ready = this._processPersistence?.ready() ?? Promise.resolve();
  }

  private readonly _ready: Promise<void>;

  /**
   * Returns a promise that resolves when the store has finished everything it needs to do at
   * startup. Currently, this means reading the persisted state (if there is a persistor) and
   * putting it into the store. In the future, other startup work may be added here.
   *
   * While the store is not ready, its state is the `initialState` passed to the constructor.
   * Your UI can show that state normally (for example, showing loading indicators where data
   * is missing). However, you can't change the state before the store is ready, since it
   * would be overwritten when the persisted state is loaded. Dispatching an action before the
   * store is ready is a developer error, and throws a `StoreException`. So, you must wait for
   * the store to be ready before dispatching any actions:
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
   * The promise never rejects. If reading the persisted state fails, the error is reported
   * (see `errorObserver`) and the store keeps the initial state. It always returns the same
   * promise, so it can be called many times, and does not read the persisted state again.
   * A store without a persistor is ready right away.
   *
   * In components, use `useIsStoreReady()` to know if the store is ready, for example to show
   * a loading state, or to disable buttons that dispatch actions.
   */
  ready(): Promise<void> {
    return this._ready;
  }

  /**
   * Internal: true if the store is ready (see `ready`). Used by `useIsStoreReady`.
   * Don't use it in your code; use `useIsStoreReady` or `await store.ready()` instead.
   * @internal
   */
  get _isReady(): boolean {
    return this._processPersistence?.isReady ?? true;
  }

  get state(): St {
    return this._state;
  }

  get dispatchCount() {
    return this._dispatchCount;
  }

  /**
   * Dispatches the action to the Redux store, to potentially change the state.
   *
   * If the action fails with an error that is not swallowed (see `dispatchAndWait`), a SYNC
   * action throws the error from `dispatch`. An ASYNC action can't throw it, since `dispatch`
   * already returned, so it becomes an unhandled promise rejection. To catch errors of async
   * actions, use `dispatchAndWait` instead.
   *
   * An action can only be dispatched once. Dispatching an action that was already dispatched
   * (running or finished) is a developer error, and throws a `StoreException`. Create a new
   * action each time instead.
   *
   * Dispatching an action before the store is ready (see `ready`) also throws a `StoreException`.
   *
   * See also:
   * - `dispatchAll` which dispatches all given actions in parallel.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   */
  dispatch(action: KissAction<St>): void {
    this._throwIfAlreadyDispatched(action);
    this._throwIfNotReady(action);
    if (this._isShutDown()) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }
    if (this._isDispatchedByActionBeforeLogOut(action)) return;

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return; // If mocked as null, the action is ignored.
    if (mockedActionOrAction !== action) this._throwIfAlreadyDispatched(mockedActionOrAction);

    // 2) If the action wants to abort the dispatch, or is non-reentrant and already running, aborts.
    if (this._mustAbortDispatch(mockedActionOrAction)) return;

    // 3) If the action is mocked to return another action, we dispatch the mock.
    this._processDispatch(mockedActionOrAction, false);
  }

  /**
   * Dispatches an action and returns a promise that resolves when the action finishes.
   * While the state change from the action's reducer will have been applied when the promise
   * resolves, other independent processes that the action may have started may still be in
   * progress.
   *
   * Usage: `await store.dispatchAndWait(new MyAction())`.
   *
   * If the action fails, the error is processed as usual (`wrapError`, `after`,
   * `errorObserver`, etc). If the error is swallowed (a `UserException`, or when
   * `wrapError` or the `errorObserver` returns `null`), the promise resolves
   * with the action status. Otherwise, the promise REJECTS with the error, for both sync and
   * async actions. So you can use `try { await dispatchAndWait(...) } catch` or `.catch()`.
   *
   * An action can only be dispatched once. Dispatching an action that was already dispatched
   * (running or finished) is a developer error: `dispatchAndWait` throws a `StoreException`
   * synchronously, instead of returning a rejected promise. A previous `dispatchAndWait` of
   * that same action is not affected.
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   * - `dispatchAll` which dispatches all given actions in parallel.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   */
  dispatchAndWait(action: KissAction<St>): Promise<ActionStatus> {
    this._throwIfAlreadyDispatched(action);
    this._throwIfNotReady(action);
    if (this._isShutDown()) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return Promise.resolve(new ActionStatus({isDispatchAborted: true}));
    }
    if (this._isDispatchedByActionBeforeLogOut(action))
      return Promise.resolve(new ActionStatus({isDispatchAborted: true}));

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return Promise.resolve(new ActionStatus({isDispatchAborted: true}));
    if (mockedActionOrAction !== action) this._throwIfAlreadyDispatched(mockedActionOrAction);

    // 2) If the action wants to abort the dispatch, or is non-reentrant and already running, aborts.
    // If the action is misconfigured, we return a rejected promise (instead of throwing).
    let mustAbort: boolean;
    try {
      mustAbort = this._mustAbortDispatch(mockedActionOrAction);
    } catch (error) {
      return Promise.reject(error);
    }
    if (mustAbort) return Promise.resolve(new ActionStatus({isDispatchAborted: true}));

    // 3) If the action is mocked to return another action, we dispatch the mock.
    const promise = mockedActionOrAction._createPromise();
    try {
      this._processDispatch(mockedActionOrAction, false);
    } catch (error) {
      // A sync action failed with an error that was not swallowed. We return a rejected
      // promise (instead of throwing), so that both `await` and `.catch()` can handle it.
      return Promise.reject(error);
    }
    return promise;
  }

  /**
   * Dispatches all given actions in parallel, applying their reducers, and possibly changing
   * the store state. The actions may be sync or async. It returns a Promise that resolves when
   * ALL actions finish.
   *
   * ```ts
   * let actions = await store.dispatchAndWaitAll([new BuyAction('IBM'), new SellAction('TSLA')]);
   * ```
   *
   * Note this is exactly the same as doing:
   *
   * ```ts
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * store.dispatch(action1);
   * store.dispatch(action2);
   * await store.waitAllActions([action1, action2], { completeImmediately: true });
   * let actions = [action1, action2];
   * ```
   *
   * Note: While the state change from the action's reducers will have been applied when the
   * Promise resolves, other independent processes that the action may have started may still
   * be in progress.
   *
   * If some actions fail with an error that is not swallowed (see `dispatchAndWait`), all
   * actions are still dispatched and allowed to finish. Only then the Promise rejects, with
   * the error of the first failed action in the list.
   *
   * This is also true when the dispatch of an action throws right away (for example, when the
   * action was already dispatched, or the store is not ready): the other actions are still
   * dispatched and allowed to finish, and that error counts as the error of that action.
   * Note `dispatchAndWaitAll` itself never throws, but returns a Promise that rejects.
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   * - `dispatchAll` which dispatches all given actions in parallel.
   */
  async dispatchAndWaitAll(actions: KissAction<St>[]): Promise<KissAction<St>[]> {
    const promises: Promise<ActionStatus> [] = [];
    for (const action of actions) {
      // If the dispatch throws right away (for example, the action was already dispatched,
      // or the store is not ready), we keep its error as a rejected promise, in the action's
      // position, so that the other actions are still dispatched and awaited.
      try {
        promises.push(this.dispatchAndWait(action));
      } catch (error) {
        promises.push(Promise.reject(error));
      }
    }

    // All actions are dispatched and finish, even if some of them fail.
    // Then, if any failed with an error that was not swallowed, we throw the first one.
    const results = await Promise.allSettled(promises);
    for (const result of results) {
      if (result.status === 'rejected') throw result.reason;
    }
    return actions;
  }

  /**
   * Dispatches all given actions in parallel, applying their reducer, and possibly changing
   * the store state. It returns the same list of actions, so that you can instantiate them
   * inline, but still get a list of them.
   *
   * ```ts
   * let actions = store.dispatchAll([new BuyAction('IBM'), new SellAction('TSLA')]);
   * ```
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async. */
  dispatchAll(actions: KissAction<St>[]): KissAction<St>[] {
    for (const action of actions) {
      this.dispatch(action);
    }
    return actions;
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
   *
   * Like `dispatch`, it throws a `StoreException` if the action was already dispatched.
   *
   * The `StoreException` for an ASYNC action is always thrown. It's not given to the action's
   * `wrapError` or to the `errorObserver`, so they can't swallow it or convert it (for example,
   * into a `UserException`), and the action doesn't count as failed for `isFailed` and
   * `exceptionFor`. The action still finishes: its `after()` runs, and its status is
   * `isCompletedFailed`, with that `StoreException` as its error.
   *
   * Note Kiss can only know `before()` or `reduce()` is async after calling it. So, when
   * `dispatchSync` throws because of an async action, the async method has already started,
   * and any side effects it has will still happen. Its result is ignored (it never changes the
   * state), and its errors are only logged. If the action uses `retry`, it's not retried. With
   * `unlimitedRetryCheckInternet`, the reducer doesn't run at all, since `dispatchSync` throws
   * while the internet is being checked.
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   * - `dispatchAll` which dispatches all given actions in parallel.
   */
  dispatchSync(action: KissAction<St>): void {
    this._throwIfAlreadyDispatched(action);
    this._throwIfNotReady(action);
    if (this._isShutDown()) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }
    if (this._isDispatchedByActionBeforeLogOut(action)) return;

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return; // If mocked as null, the action is ignored.
    if (mockedActionOrAction !== action) this._throwIfAlreadyDispatched(mockedActionOrAction);

    // 2) If the action wants to abort the dispatch, or is non-reentrant and already running, aborts.
    if (this._mustAbortDispatch(mockedActionOrAction)) return;

    // 3) If the action is mocked to return another action, we dispatch the mock.
    this._processDispatch(mockedActionOrAction, true);
  }

  // Dispatching an action before the store is ready is a developer error: the persisted state
  // is still being read, and when it's loaded it would overwrite (or race with) the action's
  // changes. The only exception is the store itself, applying the state it read.
  private _throwIfNotReady(action: KissAction<St>): void {
    const pp = this._processPersistence;
    if (pp !== null && !pp.isReady && !pp.isApplyingReadState && !this._applyingServerSlice)
      throw new StoreException(
        `Dispatched ${action} before the store is ready. ` +
        'Wait for store.ready() before dispatching actions.');
  }

  // An action can only be dispatched once. Dispatching an action that was already dispatched
  // is a developer error, not an action failure: it counts as a dispatch, and throws a
  // `StoreException` right away (not a rejected promise). This is checked before anything
  // else, so it throws even if the action would now be aborted, or the store is shut down.
  // If the action is mocked, the mock is checked too. Note a mocked action is never marked
  // as dispatched (its mock is), so dispatching it again doesn't throw.
  private _throwIfAlreadyDispatched(action: KissAction<St>): void {
    if (!action.status.isDispatched) return;
    this._dispatchCount++;
    Store._logLazy(() => `${this._dispatchCount}) ${action}`);
    throw new StoreException('The action was already dispatched. Please, create a new action each time.');
  }

  // Returns true if the dispatch must be aborted: either `abortDispatch()` returns true, or the
  // action is non-reentrant and another action with the same non-reentrant key is already running,
  // or the action is inside the throttle period of another action with the same throttle lock,
  // or the data of another action with the same fresh-key is still fresh. A debounced action only
  // checks these keys when its debounce period ends (see `_mustAbortAfterDebounce`), since
  // otherwise the first dispatch would take the key, and abort the later ones that should replace it.
  // Note: It's up to the developer to make sure `abortDispatch`, `computeNonReentrantKey`,
  // `throttleLockBuilder`, `ignoreThrottle`, `computeFreshKey` and `ignoreFresh` don't throw
  // any errors. If they do, the error is logged and swallowed, and the dispatch is aborted.
  //
  // Before that, it injects the store into the action (so that the action may access the store
  // and the state in `abortDispatch()`), which throws a `StoreException` if the action is
  // misconfigured. This throws even if the dispatch would be aborted, so that the developer
  // error doesn't show up only sometimes.
  private _mustAbortDispatch(action: KissAction<St>): boolean {
    action._injectStore(this);
    // Set before `abortDispatch()` runs, since it may already dispatch other actions.
    action._logOutCountAtDispatch = this._logOutCount;
    try {
      if (action.isAborted) return true;
      if (action['abortDispatch']()) return true;
      if (action._debounceMillis !== null) return false;
      return this._isBlockedByKey(action);
    } catch (error) {
      Store._logLazy(() => `Checking if '${action}' must abort its dispatch has thrown an error: ${error}.`);
      return true;
    }
  }

  // Called when the debounce period of the action ends, right before its reducer runs. Returns
  // true if the action must be aborted, because its non-reentrant key, throttle lock or fresh-key
  // is taken (see `_mustAbortDispatch`). Otherwise, the action takes its key. If computing the key
  // throws, the error is logged and swallowed, and the action is aborted.
  private _mustAbortAfterDebounce(action: KissAction<St>): boolean {
    try {
      if (this._isBlockedByKey(action)) return true;
    } catch (error) {
      Store._logLazy(() => `Checking if '${action}' must abort after its debounce period has thrown an error: ${error}.`);
      return true;
    }
    if (Store._isNonReentrant(action)) this._nonReentrantActionsRunning.add(action);
    return false;
  }

  // Returns true if the action is non-reentrant and its key is running, or if it's throttled, or
  // if its fresh-key is fresh. Otherwise, the throttled or fresh action takes its lock or key.
  // Note the non-reentrant key is only taken when the action starts running.
  private _isBlockedByKey(action: KissAction<St>): boolean {
    // Non-reentrant, throttle and fresh can't be combined (it throws when dispatched), so
    // an action only takes one of these keys.
    if (Store._isNonReentrant(action)) return this._isNonReentrantKeyRunning(action);
    const throttleMillis = action._throttleMillis;
    if (throttleMillis !== null) return this._isThrottled(action, throttleMillis);
    const freshMillis = action._freshMillis;
    return (freshMillis !== null) && this._isFresh(action, freshMillis);
  }

  // `nonReentrant` actions, `OptimisticCommand`s and `unlimitedRetryCheckInternet` actions are
  // non-reentrant, and share the same keys.
  private static _isNonReentrant(action: KissAction<any>): boolean {
    return action.nonReentrant || action instanceof OptimisticCommand || action._isUnlimitedRetryCheckInternet;
  }

  // Returns true if a non-reentrant action with the same non-reentrant key as the given one is
  // in progress. Saves the key in the action, so that later dispatches can compare against it.
  // The key is released when the action finishes, after its `after()` method runs.
  private _isNonReentrantKeyRunning(action: KissAction<St>): boolean {
    const key = action['computeNonReentrantKey']();
    action._nonReentrantKey = key;
    for (const other of this._nonReentrantActionsRunning) {
      if (_isSameNonReentrantKey(other._nonReentrantKey, key))
        return true;
    }
    return false;
  }

  // Returns true if another action with the same throttle lock as the given one took the lock
  // less than its throttle period ago (unless the action wants to `ignoreThrottle`). Otherwise,
  // the given action takes the lock, starting a new throttle period.
  private _isThrottled(action: KissAction<St>, throttleMillis: number): boolean {
    const now = Date.now();
    this._removeExpiredThrottleLocks(now);
    const lock = action['throttleLockBuilder']();
    const index = this._throttleLocks.findIndex(entry => _isSameNonReentrantKey(entry.lock, lock));
    if (index !== -1) {
      if (!action.ignoreThrottle) return true;
      this._throttleLocks.splice(index, 1);
    }
    this._throttleLocks.push({ lock, expiresAt: now + throttleMillis, action });
    return false;
  }

  private _removeExpiredThrottleLocks(now: number): void {
    this._throttleLocks = this._throttleLocks.filter(entry => entry.expiresAt > now);
  }

  // Called when a throttled action finishes. If it failed and `removeThrottleLockOnError` is
  // true, removes the throttle lock it took (but not a newer one, taken by another action).
  private _releaseThrottleLock(action: KissAction<St>): void {
    if (action.removeThrottleLockOnError && (action.status.originalError !== null))
      this._throttleLocks = this._throttleLocks.filter(entry => entry.action !== action);
    this._removeExpiredThrottleLocks(Date.now());
  }

  /**
   * For Kiss internal use only. Use `removeThrottleLock()` in the action instead.
   * Removes the throttle lock with the given value, if any.
   * @internal
   */
  _removeThrottleLock(lock: any): void {
    this._throttleLocks = this._throttleLocks.filter(entry => !_isSameNonReentrantKey(entry.lock, lock));
  }

  /**
   * For Kiss internal use only. Use `removeAllThrottleLocks()` in the action instead.
   * Removes all throttle locks.
   * @internal
   */
  _removeAllThrottleLocks(): void {
    this._throttleLocks = [];
  }

  // Returns true if another action with the same fresh-key made it fresh less than its fresh
  // period ago (unless the action wants to `ignoreFresh`). Otherwise, the given action makes
  // the key fresh, starting a new fresh period.
  private _isFresh(action: KissAction<St>, freshMillis: number): boolean {
    const now = Date.now();
    this._removeExpiredFreshKeys(now);
    const key = action['computeFreshKey']();
    const index = this._freshKeys.findIndex(entry => _isSameNonReentrantKey(entry.key, key));
    if (index !== -1) {
      if (!action.ignoreFresh) return true;
      this._freshKeys.splice(index, 1);
    }
    this._freshKeys.push({ key, expiresAt: now + freshMillis, action });
    return false;
  }

  private _removeExpiredFreshKeys(now: number): void {
    this._freshKeys = this._freshKeys.filter(entry => entry.expiresAt > now);
  }

  // Called when a fresh action finishes. If it failed (or was aborted), removes the fresh-key it
  // made fresh, so that the failure doesn't keep the key fresh. A newer fresh period, started by
  // another action with the same key, is kept. Note an action that ran had no fresh period to
  // restore: either the key was stale, or the action ignored it with `ignoreFresh`.
  private _releaseFreshKey(action: KissAction<St>): void {
    if (action.status.originalError !== null)
      this._freshKeys = this._freshKeys.filter(entry => entry.action !== action);
    this._removeExpiredFreshKeys(Date.now());
  }

  /**
   * For Kiss internal use only. Use `removeFreshKey()` in the action instead.
   * Removes the fresh-key with the given value, if any.
   * @internal
   */
  _removeFreshKey(key: any): void {
    this._freshKeys = this._freshKeys.filter(entry => !_isSameNonReentrantKey(entry.key, key));
  }

  /**
   * For Kiss internal use only. Use `removeAllFreshKeys()` in the action instead.
   * Removes all fresh-keys.
   * @internal
   */
  _removeAllFreshKeys(): void {
    this._freshKeys = [];
  }

  /**
   * For Kiss internal use only.
   * If no other `OptimisticSync` or `OptimisticSyncWithPush` action has the given key, the given
   * action takes it, and this returns true. Otherwise, returns false.
   * @internal
   */
  _takeOptimisticSyncKey(key: any, action: KissAction<St>): boolean {
    if (this._optimisticSyncKeys.some(entry => _isSameNonReentrantKey(entry.key, key))) return false;
    this._optimisticSyncKeys.push({ key, action });
    return true;
  }

  /**
   * For Kiss internal use only.
   * Returns true if the given `OptimisticSync` action has a key. It doesn't, after it released
   * it, or after `clearInternalActionProps()` removed all keys.
   * @internal
   */
  _hasOptimisticSyncKey(action: KissAction<St>): boolean {
    return this._optimisticSyncKeys.some(entry => entry.action === action);
  }

  /**
   * For Kiss internal use only.
   * Releases the key of the given `OptimisticSync` action, if it has one. A key taken by
   * another action is kept.
   * @internal
   */
  _releaseOptimisticSyncKey(action: KissAction<St>): void {
    this._optimisticSyncKeys = this._optimisticSyncKeys.filter(entry => entry.action !== action);
  }

  private _removeAllOptimisticSyncKeys(): void {
    this._optimisticSyncKeys = [];
    this._optimisticSyncRevisions = [];
  }

  /**
   * For Kiss internal use only.
   * Returns the revision that `OptimisticSyncWithPush` and `ServerPush` keep for the given key,
   * or `undefined` if there is none.
   * @internal
   */
  _getOptimisticSyncRevision(key: any): _OptimisticSyncRevision | undefined {
    return this._optimisticSyncRevisions.find(entry => _isSameNonReentrantKey(entry.key, key))?.revision;
  }

  /**
   * For Kiss internal use only.
   * Sets the revision that `OptimisticSyncWithPush` and `ServerPush` keep for the given key.
   * @internal
   */
  _setOptimisticSyncRevision(key: any, revision: _OptimisticSyncRevision): void {
    const entry = this._optimisticSyncRevisions.find(entry => _isSameNonReentrantKey(entry.key, key));
    if (entry) entry.revision = revision;
    else this._optimisticSyncRevisions.push({ key, revision });
  }

  // Puts the sequential action at the end of the queue with its key. This runs synchronously
  // when the action is dispatched, which is what preserves the dispatch order. Returns a Promise
  // that resolves with `false` when it's the action's turn to run, or with `true` if the action
  // is discarded before that.
  private _enterSequentialQueue(action: KissAction<St>): Promise<boolean> {
    const key = action['sequentialKeyParams']();
    let queue = this._sequentialQueues.find(entry => _isSameNonReentrantKey(entry.key, key));
    if (queue === undefined) {
      queue = { key, entries: [] };
      this._sequentialQueues.push(queue);
    }

    let release!: (discarded: boolean) => void;
    const turn = new Promise<boolean>(resolve => release = resolve);

    // If the queue is empty, it's already the action's turn.
    if (queue.entries.length === 0) release(false);
    else action._isWaitingInSequentialQueue = true;

    queue.entries.push({ action, release });
    return turn;
  }

  // When it's the turn of the sequential action, runs it from its `before` method. If the
  // action was discarded instead, it's aborted with an `AbortDispatchException`, without running
  // `before` and `reduce`.
  private _runOnSequentialTurn(action: KissAction<St>, turn: Promise<boolean>): void {
    turn.then(discarded => {
      action._isWaitingInSequentialQueue = false;
      action._wasDiscardedFromSequentialQueue = discarded;
      const beforeResult = (async () => {
        if (discarded) throw kissAbort('Discarded from the sequential queue.');
        return action['before']();
      })();
      this._runAsyncBeforeOnwards(action, beforeResult).then();
    });
  }

  // Called when a sequential action finishes. Removes it from its queue, and lets the next
  // action in the queue run. Or, if the action failed and `discardQueueOnError()` returns true,
  // discards all the actions waiting behind it. Note a discarded action (or one that failed
  // before entering the queue) is not in any queue, so it doesn't release anything.
  private _releaseSequentialQueue(action: KissAction<St>): void {
    const index = this._sequentialQueues.findIndex(queue => queue.entries[0].action === action);
    if (index === -1) return;
    const queue = this._sequentialQueues[index];
    queue.entries.shift();

    let discard = false;
    const error = action.status.originalError;
    if (error !== null) {
      try {
        discard = action['discardQueueOnError'](error);
      } catch (thrownError) {
        Store._logLazy(() => `The discardQueueOnError() method of the action ${action} threw an error: ${thrownError}.`);
      }
    }

    if (discard) {
      for (const entry of queue.entries.splice(0)) entry.release(true);
    } else if (queue.entries.length !== 0)
      queue.entries[0].release(false);

    // If the queue is now empty, remove its key, to prevent memory leaks.
    if (queue.entries.length === 0) this._sequentialQueues.splice(index, 1);
  }

  // Discards the actions waiting in all sequential queues, and removes the queues. The first
  // action of each queue is running, and keeps running. Since it's no longer in any queue, it
  // doesn't release anything when it finishes, and actions dispatched later don't wait for it.
  private _discardAllSequentialQueues(): void {
    const queues = this._sequentialQueues;
    this._sequentialQueues = [];
    for (const queue of queues) {
      for (const entry of queue.entries.slice(1)) entry.release(true);
    }
  }

  // Mocks an action to return another action.
  // If it returns null, the action should be ignored by the caller.
  // If no mock is defined, the original action is returned unchanged.
  private _mockActionOrNot(action: KissAction<St>): KissAction<St> | null {

    const mockActionFunction = this.mocks.get(action.constructor as new (...args: any[]) => KissAction<St>);

    // If no mock is defined, the original action is returned unchanged.
    if (mockActionFunction === undefined) {
      return action;
    }
    // If a mock is defined, we use it.
    else {
      const mockAction = mockActionFunction(action);

      // If the mock returns null, the action is ignored.
      if (mockAction === null) {
        Store._logLazy(() => `Dispatch of ${action} aborted by mock.`);
        return null;
      }
      // Otherwise, the mock is used.
      else {
        Store._logLazy(() => `Dispatch of ${action} mocked by ${mockAction}.`);
        return mockAction;
      }
    }
  }

  // Dispatches the action (or the already mocked action).
  // If `mustBeSync` is true, will throw a `StoreException` if the action is ASYNC.
  private _processDispatch(action: KissAction<St>, mustBeSync: boolean) {

    if (this._isShutDown()) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }

    // If this is the action of `logOut` that applies the initial-state, it's the only one allowed.
    this._isApplyingLogOutState = false;

    this._throwIfAlreadyDispatched(action);

    this._dispatchCount++;
    Store._logLazy(() => `${this._dispatchCount}) ${action}`);

    action._changeStatus({isDispatched: true});
    action._clearCountAtDispatch = this._clearCount;

    // Note the store was already injected into the action by `_mustAbortDispatch`.

    // The action is dispatched twice. This is the 1st: when the action starts (ini true).
    this._observeAction(action, true);

    // If `record.isRecording`, record the INI state. That's for testing only.
    this._record(action, true, this._state, this._state, null);

    // The state and status changes made until `dispatch` returns are published together, when
    // it returns (see `NotificationBatch`). An ASYNC action publishes the rest when it finishes.
    this._notificationBatch.run(() => {
      this._calculateIsWaitingIsFailed(action);

      this._wraps(
        action,
        () => this._runFromStart(action, mustBeSync)
      );
    });
  }

  /** @internal */
  _calculateIsWaitingIsFailed(action: KissAction<St>) {

    // Dispatch is starting, so we remove the failure of this action type and `statusKey`.
    // Otherwise, checking it later would show a stale error.
    this._removeFailure(action.constructor as new (...args: any[]) => KissAction<St>, action.statusKey);

    // Add the action to the list of actions in progress.
    // Note: We do this BEFORE notifying the UI, so that a single render sees both changes.
    // Otherwise, `isWaiting` would still see the action as not in progress.
    this._actionsInProgress.add(action);
    // A debounced action only takes its non-reentrant key when its debounce period ends.
    if (Store._isNonReentrant(action) && (action._debounceMillis === null)) this._nonReentrantActionsRunning.add(action);

    // The action just entered the set of actions in progress, so we check the wait conditions.
    this._checkAllActionConditions(action);

    // Then we publish the status change. React checks only the components that use `isWaiting`,
    // `isFailed` or `exceptionFor`, and renders only those whose value changed. So a component
    // waiting for another action type, or a `useIsWaiting(Base)` that is already true, doesn't
    // render. Note a SYNC action also starts and finishes here, before `dispatch` returns, so
    // React never sees it as in progress.
    this._statusListeners.notify();
  }

  // Wraps SYNC actions.
  // - Runs the before are reduce methods.
  // - Runs the state observer.
  // - Catches and processes errors.
  // - Shows some UI if there are user exceptions.
  // - Makes sure the after method runs, always.
  // - Removes the wait state for the action in progress, always.
  // - Runs the action observer.
  private _wraps(
    action: KissAction<St>,
    functionToRun: () => boolean
  ) {
    let ifWentAsync = false;
    try {
      ifWentAsync = functionToRun();
    } catch (error) {
      this._processWrapsError(error, action);
    } finally {
      if (!ifWentAsync) {
        this._processWrapsFinally(action);
      }
    }
  }

  // Wraps ASYNC actions.
  // - Runs the before are reduce methods.
  // - Runs the state observer.
  // - Catches and processes errors.
  // - Shows some UI if there are user exceptions.
  // - Makes sure the after method runs, always.
  // - Removes the wait state for the action in progress, always.
  // - Runs the action observer.
  private async _wrapsAsync(
    action: KissAction<St>,
    functionToRun: () => Promise<void>
  ) {
    let failure: { error: any } | null = null;
    try {
      await functionToRun();
    } catch (error) {
      try {
        this._processWrapsError(error, action);
      } catch (processedError) {
        // The error was not swallowed.
        failure = {error: processedError};
      }
    } finally {
      this._processWrapsFinally(action, failure);
    }

    // If the action was dispatched with `dispatchAndWait()`, its promise was rejected with the
    // error. Otherwise, nobody is waiting for the action, so the error becomes an unhandled
    // rejection (the same as an error thrown by any async code that is not awaited).
    if (failure !== null && !action._isAwaited()) {
      throw failure.error;
    }
  }

  private _processWrapsError(error: any, action: KissAction<St>) {
    //
    // Throwing `null` or `undefined` (or rejecting with no reason) still means the action
    // failed. We turn it into an `Error`, since a `null` error means "no error" in the action's
    // status and in the `stateObserver`, and returning `null` from `wrapError` swallows it.
    if (error == null) error = Store._nullThrownError(action, error);

    //
    // The errors of an aborted action are ignored (by `ignoreOld`, when a newer action was
    // dispatched, or by `abort()`). This includes the error `fetch` rejects with when the
    // action's `abortSignal` is aborted, and an `AbortDispatchException` thrown by the action.
    // Errors that point to a bug (`StoreException`) are still thrown.
    if (action.isAborted && !isKissAbort(error) && !(error instanceof StoreException)) {
      Store._logLazy(() => `Ignored the error of ${action}, since it was aborted (${this._abortError(action).message}): ${error}`);
      error = this._abortError(action);
    }

    // The errors of an action dispatched before a `logOut()` are ignored, since they belong to
    // the previous user. Errors that point to a bug (`StoreException`) are still thrown.
    if (this._wasDispatchedBeforeLogOut(action) && !isKissAbort(error) && !(error instanceof StoreException)) {
      Store._logLazy(() => `Ignored the error of ${action}, since it was dispatched before logOut: ${error}`);
      error = Store._logOutDiscardError();
    }

    action._changeStatus({originalError: error});

    // Observe the state with an error here. We use the current state; no new state was applied.
    // This is before the action's `after()` and `wrapError()` and the `errorObserver`.
    this._observeState(action, this._state, this._state, error);

    this._record(action, false, this._state, this._state, error);

    // When `dispatchSync` finds the action is ASYNC, that's a developer error, so `dispatchSync`
    // always throws it, like it throws when the action was already dispatched. It's not given to
    // `wrapError` or the `errorObserver`, since these could swallow it or turn it into a
    // `UserException`. And the action doesn't count as failed for `isFailed`/`exceptionFor`.
    if (this._notSyncErrors.has(error)) {
      action._changeStatus({wrappedError: error});
      throw error;
    }

    // An `AbortDispatchException` created by Kiss itself (for example, for an `ignoreOld` action
    // that became old, or a `sequential` action discarded from its queue) aborts the action
    // silently. It's not processed by `wrapError` or the `errorObserver`, since it didn't come
    // from the user's code, and they could turn it into an error. See `_abortSilently`.
    if (isKissAbort(error)) {
      this._abortSilently(action);
      return;
    }

    // Any error may optionally be processed by the `wrapError` method of the action.
    // Usually this is used to wrap the error inside another that better describes the failed
    // action. It's recommended RETURNING the new error, but if `wrapError` throws an error,
    // that will be used too.
    try {
      error = action['wrapError'](error);
    } catch (thrownError) {
      error = thrownError;
    }

    // Returning `undefined` (or nothing) swallows the error, just like returning `null`.
    // The type of `wrapError` doesn't allow it, but it can still happen, for example in
    // JavaScript, or if the `wrapError` override is typed `any`.
    if (error === undefined) error = null;

    // Any error may optionally be processed by the `errorObserver` passed to the Store
    // constructor. It may log the error, change it, or swallow it by returning `null`. It's
    // recommended RETURNING the error, but if it throws an error, that will be used too.
    if (error !== null && this._errorObserver) {
      error = this._observeError(error, action.status.originalError, action);
    }

    // To completely disable the error, `wrapError` or `errorObserver` may return `null`.
    // But if we got an error, we deal with it here.
    if (error !== null) {

      // An `AbortDispatchException` thrown by the action (that `wrapError` and the
      // `errorObserver` didn't change), or returned by them, aborts the action silently.
      if (error instanceof AbortDispatchException) {
        this._abortSilently(action);
        return;
      }

      action._changeStatus({wrappedError: error});

      // Memorizes the failure (type, `statusKey` and error). It's removed when an action of the
      // same type and key is dispatched again.
      this._addFailure(action.constructor as new (...args: any[]) => KissAction<St>, action.statusKey, error);

      // Memorizes errors of type `UserException` (in the error queue).
      // These errors are usually shown to the user in a modal dialog, and are not thrown.
      if (error instanceof UserException) {
        if (error.ifOpenDialog) {
          this._addUserException(error);
          this._openSomeUiToShowUserException();
        }
      }
      // Throws all other errors. This means the `dispatch()` method will throw this error.
      else throw error;
    }
  }

  /**
   * Aborts the action silently, because of an `AbortDispatchException`: the action doesn't
   * count as failed, nothing is thrown, and its status has no `wrappedError`.
   */
  private _abortSilently(action: KissAction<St>): void {
    action._changeStatus({isDispatchAborted: true});
  }

  /**
   * Gives the error to the `errorObserver`, and returns the error it returns, or the error
   * it throws. Returns `null` if the error is meant to be swallowed. The `action` is `null` for
   * the errors of the `Persistor`.
   */
  private _observeError(error: any, originalError: any, action: KissAction<St> | null): any {
    let result: any;
    try {
      result = this._errorObserver!({error, originalError, action, store: this});
    } catch (thrownError) {
      result = thrownError;
    }
    // Returning `undefined` (or nothing) swallows the error, just like returning `null`.
    return (result === undefined) ? null : result;
  }

  private _processWrapsFinally(action: KissAction<St>, failure: { error: any } | null = null) {
    // We run the `after` method of the action.
    const logAfterError = (error: any) =>
      Store._logLazy(() => `The after() method of the action ${action} threw an error: ${error}.
      This error will be ignored, but you should fix this, as after() methods should not throw errors.`);

    try {
      // The `after()` method should be sync, but TypeScript lets it be overridden as `async`.
      // In that case, we catch its rejection, so that it doesn't become an unhandled rejection.
      const result: any = action['after']();
      if (result && typeof result.then === 'function') {
        result.then(undefined, logAfterError);
      }
    } catch (error) {
      logAfterError(error);
    } finally {
      action._changeStatus({hasFinishedMethodAfter: true});
    }

    if (action._throttleMillis !== null) this._releaseThrottleLock(action);
    if (action._freshMillis !== null) this._releaseFreshKey(action);
    if (action.sequential) this._releaseSequentialQueue(action);

    // Releases the non-reentrant key. This is only done here, after `after()`, and not when the
    // state is applied (which removes the action from `_actionsInProgress` before `after()`).
    this._nonReentrantActionsRunning.delete(action);

    // Remove the wait state for the action in progress.
    // Note: If the state was applied, this was already removed and the UI updated.
    // If the action failed, `_processWrapsError` already recorded the failure (so `isFailed` and
    // `exceptionFor` see it), and this same notification publishes it together with the end of
    // the waiting.
    const removed = this._actionsInProgress.delete(action);
    if (removed) {
      this._resolveSuspenseWaits();
      this._statusListeners.notify();

      // Check the wait-conditions after state change. We pass it the trigger-action.
      this._checkAllActionConditions(action);
    }

    // The action is dispatched twice. This is the 2nd: when the action ends (ini false).
    this._observeAction(action, false);

    // This allows us to `let status = await dispatchAndWait(new MyAction())`.
    // If the action failed with an error that was not swallowed, the promise is rejected.
    action._resolvePromise(failure);
  }

  // Calls the `actionObserver`, if any. If it throws, the error is ignored, so that it doesn't
  // stop the action from running, or from finishing (which would leave `dispatchAndWait` pending).
  private _observeAction(action: KissAction<St>, ini: boolean) {
    try {
      this._actionObserver?.(action, this._dispatchCount, ini);
    } catch (error) {
      Store._logLazy(() => `The actionObserver threw an error: ${error}.
      This error will be ignored, but you should fix this, as the actionObserver should not throw errors.`);
    }
  }

  // Calls the `stateObserver`, if any. If it throws, the error is ignored. Otherwise, it would
  // leave the store inconsistent: the state is already applied, but the action would fail, and
  // the state would not be persisted, nor checked by the wait-conditions and `dispatchWhen`.
  private _observeState(action: KissAction<St>, prevState: St, newState: St, error: any) {
    try {
      this._stateObserver?.(action, prevState, newState, error, this._dispatchCount);
    } catch (observerError) {
      Store._logLazy(() => `The stateObserver threw an error: ${observerError}.
      This error will be ignored, but you should fix this, as the stateObserver should not throw errors.`);
    }
  }

  // This method checks and resolves conditions related to actions in progress.
  // It iterates over the `_waitActionConditions` array and checks each condition.
  // If a condition is met, it resolves the condition and later removes it.
  // The `triggerAction` is the action that was just added or removed in the list
  // of `_actionsInProgress` that triggered the check.
  private _checkAllActionConditions(triggerAction: KissAction<St>) {

    const toRemove: any[] = [];

    // Iterate over the conditions, resolve the ones that check, and add the ones to be removed to the separate array.
    for (const condition of this._waitActionConditions) {
      let checked: boolean;
      try {
        checked = condition.check(this._actionsInProgress, triggerAction);
      } catch (error) {
        // A throwing condition only fails its own wait. It doesn't affect the trigger action.
        condition.reject(error);
        toRemove.push(condition);
        continue;
      }
      if (checked) {
        condition.resolve(this.actionsInProgress(), triggerAction);
        toRemove.push(condition);
      }
    }

    // Remove the checked conditions from the original array.
    if (toRemove.length !== 0)
      this._waitActionConditions = this._waitActionConditions.filter(condition => !toRemove.includes(condition));
  }

  // When `dispatchSync` finds that `before` or `reduce` returned a Promise, the async work has
  // already started and can't be stopped. Its result is ignored (the state is never changed by it),
  // and its error is logged, so that it doesn't become an unhandled rejection.
  // The retry loops check `_isDiscardedByDispatchSync`, so that they stop retrying.
  private _discardAsyncResultOfDispatchSync(action: KissAction<St>, promise: Promise<unknown>, method: string): void {
    action._isDiscardedByDispatchSync = true;
    promise.catch((error: any) => {
      Store._logLazy(() => `The async '${method}' of ${action.constructor.name}, dispatched with dispatchSync, failed: ${error}`);
    });
  }

  // Returns the error `dispatchSync` throws when the action is ASYNC. It's thrown inside the
  // action's run, so that the action still finishes (`after()` runs, and so on), but it's
  // marked, so that `_processWrapsError` always throws it.
  private _notSyncError(message: string): StoreException {
    const error = new StoreException(message);
    this._notSyncErrors.add(error);
    return error;
  }

  private _runFromStart(action: KissAction<St>, mustBeSync: boolean): boolean {

    // A debounced action always waits for its debounce period, so it can't be SYNC.
    if (mustBeSync && action._debounceMillis !== null)
      throw this._notSyncError(`You called dispatchSync(${action.constructor.name}), but the action uses debounce, which makes it ASYNC.`);

    // A sequential action always waits for its turn in the queue, so it can't be SYNC.
    if (action.sequential) {
      if (mustBeSync)
        throw this._notSyncError(`You called dispatchSync(${action.constructor.name}), but the action is sequential, which makes it ASYNC.`);
      this._runOnSequentialTurn(action, this._enterSequentialQueue(action));
      return true; // Went ASYNC.
    }

    // Numbers the action before `before()` runs, since an ASYNC `before` may make an older
    // action reach its reducer after a newer one. A dispatch that doesn't run the reducer
    // doesn't make the other actions old.
    if (action.ignoreOld && !this._pollSkipsReduce(action)) this._abortOlderIgnoreOld(action);

    // BEFORE

    // 1) Runs the `before` method.
    // It may be sync or async, but it doesn't return anything.
    const beforeResult: void | Promise<void> = action['before']();

    // 2) If it's async, wait for the `before` method to finish.
    if (beforeResult instanceof Promise) {
      if (mustBeSync) {
        this._discardAsyncResultOfDispatchSync(action, beforeResult, 'before');
        throw this._notSyncError(`You called dispatchSync(${action.constructor.name}), but the action's 'before' method returned a Promise.`);
      }
      this._runAsyncBeforeOnwards(action, beforeResult).then();
      return true; // Get out of here. Went ASYNC.
    }

    action._changeStatus({hasFinishedMethodBefore: true});

    // REDUCE

    const wrapReduce = this._getWrapReduce(action);

    // 3)
    // - Runs the SYNC `reduce` method; OR
    // - Runs the initial sync part of the ASYNC `reduce` method.
    const reduceResult: ReduxReducer<St> =
      wrapReduce(action['reduce'].bind(action))();

    // 4) If the reducer returned null, or if it returned the unaltered state, we simply do nothing.
    if (reduceResult == null || reduceResult === this.state) {
      action._changeStatus({hasFinishedMethodReduce: true});
      this._throwIfDispatchedBeforeLogOut(action);
      this._registerUnchangedState(action);
      return false; // Kept SYNC.
    }
      //
    // 5) If the reducer is ASYNC, we still process the rest of the reducer to generate the new state.
    else if (reduceResult instanceof Promise) {
      if (mustBeSync) {
        this._discardAsyncResultOfDispatchSync(action, reduceResult, 'reduce');
        throw this._notSyncError(`You called dispatchSync(${action.constructor.name}), but the action's 'reduce' method returned a Promise.`);
      }
      this._runAsyncReduceOnwards(action, reduceResult);
      return true; // Get out of here. Went ASYNC.
    }
      //
    // 6) If the reducer is SYNC, we already have the new state, and we simply must apply it.
    else {
      action._changeStatus({hasFinishedMethodReduce: true});
      this._throwIfDispatchedBeforeLogOut(action);

      if (action['abortReduce'](reduceResult)) {
        action._changeStatus({hasFinishedMethodReduce: true});
        this._registerUnchangedState(action);
        return false; // Kept SYNC.
      }

      this._registerState(action, reduceResult);
      return false; // Kept SYNC.
    }
  }

  /**
   * Returns the action's own `wrapReduce`, or, when polling, debounce, retry or
   * unlimitedRetryCheckInternet is on, a wrapper that calls the action's own `wrapReduce`.
   * With `ignoreOld`, the result is then checked by `_ignoreOldResult`.
   * Never replaces `action.wrapReduce`.
   *
   * Note: An `OptimisticCommand` handles its own retry, by retrying only `sendCommandToServer`,
   * so that the optimistic state is not applied and rolled back on each attempt.
   * Debounce can't be combined with retry, nor used in an `OptimisticCommand`.
   * Polling can't be combined with debounce or retry, nor used in an `OptimisticCommand`.
   * unlimitedRetryCheckInternet can't be combined with any of these.
   */
  private _getWrapReduce(action: KissAction<St>): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {
    const wrapReduce = this._getFeaturesWrapReduce(action);
    return (reduce) => {
      const wrapped = wrapReduce(reduce);
      return () => {
        // An action aborted before its reducer runs (during an ASYNC `before`, for example)
        // doesn't run it.
        if (action.isAborted) throw this._abortError(action);
        return this._discardIfAborted(action, wrapped());
      };
    };
  }

  // The `AbortDispatchException` to throw to finish an aborted action silently. Its message
  // is the one of the `AbortError` that is the reason of the action's `abortSignal` (see
  // `KissAction._abort()`).
  private _abortError(action: KissAction<St>): AbortDispatchException {
    const reason = action.abortSignal.reason;
    return kissAbort((typeof reason?.message === 'string') ? reason.message : 'The action was aborted.');
  }

  // The `wrapReduce` of `_getWrapReduce`, without the `ignoreOld` check.
  private _getFeaturesWrapReduce(action: KissAction<St>): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {
    const userWrapReduce = action['wrapReduce'].bind(action);
    if (action.poll !== undefined) return this._pollingWrapReduce(action, userWrapReduce);
    const debounceMillis = action._debounceMillis;
    if (debounceMillis !== null) return this._debounceWrapReduce(action, userWrapReduce, debounceMillis);
    return ((action.ifRetryIsOn && !(action instanceof OptimisticCommand)) || action._isUnlimitedRetryCheckInternet)
      ? this._retryWrapReduce(action, userWrapReduce)
      : userWrapReduce;
  }

  // The error for an action that retries its reducer, but whose reducer is SYNC.
  private static _syncRetryError(action: KissAction<any>): StoreException {
    const feature = action._isUnlimitedRetryCheckInternet ? 'unlimitedRetryCheckInternet' : 'retry';
    return new StoreException(`Action '${action}' uses ${feature}, but its reducer is SYNC. Retry needs an ASYNC reducer, that returns a Promise<(St) => St>, because a SYNC reducer does not fail in a way that retrying can fix.`);
  }

  private static _nullThrownError(action: KissAction<any>, thrown: null | undefined): Error {
    return new Error(`Action '${action}' failed with \`${thrown}\` (it threw \`${thrown}\`, or a Promise was rejected with no reason). Throw an Error instead.`);
  }

  // Aborts the `ignoreOld` actions in progress with the same key as the given action, which is
  // starting to run. Actions dispatched before `clearInternalActionProps()` are not aborted:
  // the actions dispatched after it behave as if no action had been dispatched before.
  private _abortOlderIgnoreOld(action: KissAction<St>): void {
    const key = action['computeIgnoreOldKey']();
    for (const other of this._actionsInProgress) {
      if (other === action || !other.ignoreOld || this._wereInternalActionPropsCleared(other)) continue;
      if (_isSameNonReentrantKey(other['computeIgnoreOldKey'](), key))
        other._abort('A newer action was dispatched (ignoreOld).');
    }
  }

  // True if the action uses polling, and its `poll` value means it won't run the reducer:
  // `Poll.stop`, or `Poll.start` while polling is already active.
  private _pollSkipsReduce(action: KissAction<St>): boolean {
    if (action.poll === Poll.stop) return true;
    if (action.poll !== Poll.start) return false;
    const key = action['computePollingKey']();
    return this._pollingCycles.some(cycle => _isSameNonReentrantKey(cycle.key, key));
  }

  /**
   * Checks the result of the reducer, so that if the action was aborted, it doesn't change the
   * state. The check is done right when the state is applied: now, for the state returned by
   * a SYNC reducer, or, for the function `(state) => newState` returned by an ASYNC reducer,
   * when the store calls it.
   */
  private _discardIfAborted(action: KissAction<St>, result: ReduxReducer<St>): ReduxReducer<St> {
    const throwIfAborted = () => {
      if (action.isAborted) throw this._abortError(action);
    };
    const checked = (fn: (state: St) => (St | null)) => (state: St) => {
      throwIfAborted();
      return fn(state);
    };

    if (result instanceof Promise)
      return result.then(fn => {
        if (typeof fn === 'function') return checked(fn);
        throwIfAborted();
        return fn;
      });

    throwIfAborted();
    return result;
  }

  /**
   * Waits for the debounce period, and then calls the action's own `wrapReduce`. If another
   * action with the same lock is dispatched meanwhile, returns `null` right away instead, so
   * that the action finishes without running its reducer. When the debounce period ends, the
   * action is aborted if its non-reentrant key, throttle lock or fresh-key is taken.
   *
   * The result is always ASYNC. A SYNC reducer's new state is returned as `() => newState`.
   */
  private _debounceWrapReduce(
    action: KissAction<St>,
    userWrapReduce: (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St>,
    debounceMillis: number,
  ): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {

    const store = this;

    function _wrapReduceDebounce(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {

      async function _wrapReduceDebounceAsync(): AsyncReducer<St> {
        const isLast = await store._waitDebounce(action['debounceLockBuilder'](), debounceMillis);
        if (!isLast) return null;
        if (store._mustAbortAfterDebounce(action))
          throw kissAbort('The non-reentrant key, throttle lock or fresh-key was taken when the debounce period ended.');

        const newState = userWrapReduce(reduce)();
        if (newState instanceof Promise) return newState;
        if (newState == null || newState === store.state) return null;
        return () => newState;
      }

      return () => _wrapReduceDebounceAsync();
    }

    return _wrapReduceDebounce;
  }

  /**
   * Resolves with `true` after the debounce period, if no other action with the same lock was
   * dispatched meanwhile. Otherwise, resolves with `false` as soon as the other action is
   * dispatched (or the locks are removed).
   */
  private _waitDebounce(lock: any, debounceMillis: number): Promise<boolean> {
    const index = this._debounceLocks.findIndex(entry => _isSameNonReentrantKey(entry.lock, lock));
    if (index !== -1) this._debounceLocks.splice(index, 1)[0].cancel();

    return new Promise<boolean>(resolve => {
      const timer = setTimeout(() => {
        this._debounceLocks = this._debounceLocks.filter(other => other !== entry);
        resolve(true);
      }, capTimeoutMillis(debounceMillis));

      const entry = {
        lock,
        cancel: () => {
          clearTimeout(timer);
          resolve(false);
        },
      };

      this._debounceLocks.push(entry);
    });
  }

  /**
   * For Kiss internal use only. Use `removeAllDebounceLocks()` in the action instead.
   * Removes all debounce locks. The actions waiting for their debounce period finish right
   * away, without running their reducer.
   * @internal
   */
  _removeAllDebounceLocks(): void {
    const entries = this._debounceLocks;
    this._debounceLocks = [];
    for (const entry of entries) entry.cancel();
  }

  /**
   * Starts, stops or restarts the polling of the action's polling key, according to its `poll`
   * value, and runs the action's own `wrapReduce` when the `poll` value says the reducer runs.
   * Otherwise, returns `null` synchronously, so that the action finishes without changing the
   * state.
   */
  private _pollingWrapReduce(
    action: KissAction<St>,
    userWrapReduce: (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St>,
  ): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {

    const store = this;

    function _wrapReducePolling(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {

      function _reducePolling(): ReduxReducer<St> {
        // If all polling was stopped (by `clearInternalActionProps()`, `setShutDown(true)` or
        // `logOut()`) after the action was dispatched, for example while it was in an async
        // `before()`, it must not start polling again. It's aborted, like retry is.
        if ((action.poll === Poll.start || action.poll === Poll.runNowAndRestart)
          && store._wereInternalActionPropsCleared(action))
          throw kissAbort('The internal action props were cleared, so the action did not start polling.');

        const key = action['computePollingKey']();
        const cycle = store._pollingCycles.find(entry => _isSameNonReentrantKey(entry.key, key));

        switch (action.poll) {
          case Poll.start:
            // If polling is already active, don't do anything.
            if (cycle !== undefined) return null;
            return store._runNowAndStartPollingCycle(action, key, userWrapReduce(reduce));

          case Poll.stop:
            if (cycle !== undefined) store._stopPollingCycle(cycle);
            return null;

          case Poll.runNowAndRestart:
            if (cycle !== undefined) store._stopPollingCycle(cycle);
            return store._runNowAndStartPollingCycle(action, key, userWrapReduce(reduce));

          default: // Poll.once
            return userWrapReduce(reduce)();
        }
      }

      return _reducePolling;
    }

    return _wrapReducePolling;
  }

  /**
   * Starts a new polling cycle for the given `key`, and runs the `reduce` once, immediately.
   *
   * When `pollWaitsForRun` is true, the first tick is only scheduled after that immediate run
   * finishes (even if it fails). When it's false, the first tick is scheduled right away.
   */
  private _runNowAndStartPollingCycle(
    action: KissAction<St>,
    key: any,
    reduce: () => ReduxReducer<St>,
  ): ReduxReducer<St> {
    const cycle: PollingCycle = { key, timer: null, cancelWait: null };
    this._pollingCycles.push(cycle);

    if (action.pollWaitsForRun === false) {
      this._scheduleNextPollingTick(action, cycle);
      return reduce();
    }

    let result: ReduxReducer<St>;
    try {
      result = reduce();
    } catch (error) {
      this._scheduleNextPollingTick(action, cycle);
      throw error;
    }

    if (result instanceof Promise)
      return result.finally(() => this._scheduleNextPollingTick(action, cycle));

    this._scheduleNextPollingTick(action, cycle);
    return result;
  }

  /**
   * Schedules a one-shot timer that dispatches the action returned by `createPollingAction()`,
   * and then schedules the next tick. If `pollWaitsForRun` is true, the next tick is only
   * scheduled when the dispatched action finishes. Otherwise, it's scheduled as soon as the
   * action is dispatched.
   *
   * If the `cycle` is no longer active (because polling was stopped or restarted in the
   * meantime), the tick is abandoned.
   */
  private _scheduleNextPollingTick(
    action: KissAction<St>,
    cycle: PollingCycle,
  ): void {
    if (!this._pollingCycles.includes(cycle)) return;

    const runTick = () => {
      if (!this._pollingCycles.includes(cycle)) return;

      const waitsForRun = action.pollWaitsForRun !== false;

      const tick = (async () => {
        const tickAction = action['createPollingAction']();
        if (waitsForRun) await this.dispatchAndWait(tickAction);
        else this.dispatch(tickAction);
      })();

      if (!waitsForRun) this._scheduleNextPollingTick(action, cycle);

      // Errors don't stop the polling. An error that was not swallowed is still thrown, as an
      // unhandled rejection, like the error of any dispatch nobody waits for.
      tick.finally(() => {
        if (waitsForRun) this._scheduleNextPollingTick(action, cycle);
      });
    };

    cycle.timer = setTimeout(() => {
      if (!this._pollingCycles.includes(cycle)) return;

      // While the tick runs (or waits for the app to be focused or online) there is no timer,
      // but the cycle is still active.
      cycle.timer = null;

      if (this._pollingCanTick(action)) runTick();
      else this._waitToTick(action, cycle, runTick);
    }, capTimeoutMillis(action._pollIntervalMillis!));
  }

  // True if the app is focused and online, as far as the action's `pollOnlyWhenFocused` and
  // `pollOnlyWhenOnline` require. Only reads the signals the action requires, so that an action
  // that requires none doesn't make the store listen to the sources.
  private _pollingCanTick(action: KissAction<St>): boolean {
    if (action.pollOnlyWhenFocused !== false && !this.isFocused) return false;
    if (action.pollOnlyWhenOnline !== false && !this.isOnline) return false;
    return true;
  }

  // A tick came due while the app is not focused or not online (see `_pollingCanTick`). Waits
  // for the signals the action requires, and then runs the tick right away. Stopping the cycle
  // meanwhile (`Poll.stop`, `Poll.runNowAndRestart`, `clearInternalActionProps()`) drops the tick.
  private _waitToTick(action: KissAction<St>, cycle: PollingCycle, runTick: () => void): void {
    const unsubscribes: Unsubscribe[] = [];
    const cancelWait = () => {
      cycle.cancelWait = null;
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
    cycle.cancelWait = cancelWait;

    const onChange = () => {
      if (!this._pollingCanTick(action)) return;
      cancelWait();
      runTick();
    };
    if (action.pollOnlyWhenFocused !== false) unsubscribes.push(this._focus.subscribe(onChange));
    if (action.pollOnlyWhenOnline !== false) unsubscribes.push(this._online.subscribe(onChange));
  }

  // Cancels the timer of the polling cycle, and removes the cycle, so that its ticks stop.
  private _stopPollingCycle(cycle: PollingCycle): void {
    if (cycle.timer !== null) clearTimeout(cycle.timer);
    cycle.timer = null;
    cycle.cancelWait?.();
    this._pollingCycles = this._pollingCycles.filter(entry => entry !== cycle);
  }

  /**
   * For Kiss internal use only. Use `stopAllPolling()` in the action instead.
   * Stops all polling cycles. Runs that are in progress still finish, but no new ticks start.
   * @internal
   */
  _stopAllPolling(): void {
    const cycles = this._pollingCycles;
    this._pollingCycles = [];
    for (const cycle of cycles) {
      if (cycle.timer !== null) clearTimeout(cycle.timer);
      cycle.timer = null;
      cycle.cancelWait?.();
    }
  }

  private _retryWrapReduce(
    action: KissAction<St>,
    userWrapReduce: (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St>,
  ): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {

    const store = this;
    const retry = action._retry;

    // With unlimitedRetryCheckInternet, the internet is checked before each attempt. If there is
    // no internet, the reducer doesn't run, and it's retried later. Note this retries unlimited
    // times, and the waits between attempts are capped by `maxDelayNoInternet`.
    const checkInternet = action._isUnlimitedRetryCheckInternet;

    const _syncRetryError = () => Store._syncRetryError(action);

    const _discardedError = () => kissAbort(
      'dispatchSync threw because the action is ASYNC, so the action stopped retrying.');

    // Counts the failed attempt, and waits before the next one. Throws the error instead, if
    // there are no retries left, or an `AbortDispatchException` if the internal action props
    // were cleared (for example, because the store was shut down).
    async function _waitToRetry(error: any, maxDelay: number): Promise<void> {
      // When `dispatchSync` threw because the action is ASYNC, its result is ignored, so there's
      // no point retrying. Note the error is `null` when there is no internet.
      if (action._isDiscardedByDispatchSync) throw error ?? _discardedError();
      // When `clearInternalActionProps()` was called (for example, on logout), stops retrying.
      // This is checked before checking the retries left, so that a last attempt that fails
      // is aborted too, instead of failing.
      if (store._wereInternalActionPropsCleared(action)) throw Store._clearedRetryError();
      retry.attempts++;
      if (!retry.unlimitedRetries && (retry.maxRetries >= 0) && (retry.attempts > retry.maxRetries)) throw error;
      // The action can give up on some errors (`shouldRetry`). Not when there is no internet.
      if ((error !== null) && !action._shouldRetry(error, retry.attempts)) throw error;

      await store._waitRetryDelay(action, action._nextRetryDelay(maxDelay));
    }

    function _wrapReduceRetry(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {

      async function _wrapReduceRetryAsync(): AsyncReducer<St> {

        while (true) {

          if (checkInternet) {
            let hasInternet: boolean;
            try {
              hasInternet = await action._hasInternet();
            } catch (error) {
              // If checking the internet fails, this counts as a failed attempt with internet.
              Store._logLazy(() => `Checking the internet for ${action} has thrown an error: ${error}.`);
              await _waitToRetry(error, retry.maxDelay);
              continue;
            }

            const attempt = (retry.attempts === 0) ? 'Trying' : 'Retrying';
            const attemptNumber = (retry.attempts === 0) ? '' : ` (attempt ${retry.attempts})`;

            if (!hasInternet) {
              Store._logLazy(() => `${attempt} ${action}; aborted because of no internet${attemptNumber}.`);
              await _waitToRetry(null, action._maxDelayNoInternet);
              continue;
            }

            Store._logLazy(() => `${attempt} ${action}${attemptNumber}.`);
          }

          // With unlimitedRetryCheckInternet, `dispatchSync` throws before the reducer runs for
          // the first time (when the internet is checked). Since its result would be ignored,
          // the reducer doesn't run.
          if (action._isDiscardedByDispatchSync) throw _discardedError();

          // A SYNC reducer can't be retried. If the reducer throws synchronously, or returns
          // without a Promise (even null, or the unchanged state), fail right away with a
          // StoreException, without retrying. Note we check the reducer itself, and not the
          // result of `wrapReduce`, since a custom `wrapReduce` may discard the result of an
          // ASYNC reducer by returning null synchronously.
          let isSyncReducer = false;
          const reduceAndCheck = () => {
            let result: ReduxReducer<St>;
            try {
              result = reduce();
            } catch (error) {
              isSyncReducer = true;
              throw error;
            }
            if (!(result instanceof Promise)) isSyncReducer = true;
            return result;
          };

          let newState: any;
          try {
            newState = userWrapReduce(reduceAndCheck)();
          } catch (error) {
            throw isSyncReducer ? _syncRetryError() : error;
          }

          if (isSyncReducer) throw _syncRetryError();

          try {
            newState = await newState;
          }
            //
          catch (error) {
            if (isSyncReducer) throw _syncRetryError();

            // An aborted action is not retried.
            if (error instanceof AbortDispatchException) throw error;

            await _waitToRetry(error, retry.maxDelay);
            continue;
          }

          // The custom `wrapReduce` may have called a SYNC reducer only after some `await`.
          if (isSyncReducer) throw _syncRetryError();

          return newState;
        }
      }

      return () => _wrapReduceRetryAsync();
    }

    return _wrapReduceRetry;
  }

  private _record(
    action: KissAction<St>,
    ini: boolean,
    prevState: St,
    newState: St,
    error: any
  ) {
    if (this.record.isRecording) {
      this.record.changes.push({
        action,
        ini,
        prevState: prevState,
        newState: newState,
        error: error,
        dispatchCount: this._dispatchCount
      });
    }
  }

  private async _runAsyncBeforeOnwards(action: KissAction<St>, beforeResult: Promise<void>) {

    this._wrapsAsync(action, async () => {

      // 2.1) Method `before` is ASYNC, so we wait for it to finish.
      await beforeResult;

      action._changeStatus({hasFinishedMethodBefore: true});

      // REDUCE

      const wrapReduce = this._getWrapReduce(action);

      // 2.2)
      // - Runs the SYNC `reduce` method; OR
      // - Runs the initial sync part of the ASYNC `reduce` method.
      let reduceResult: ReduxReducer<St> | AsyncReducerResult<St> =
        wrapReduce(action['reduce'].bind(action))();

      // 2.3) If the reducer returned null, or if it returned the unaltered state, we simply do nothing.
      if (reduceResult == null || reduceResult === this.state) {
        action._changeStatus({hasFinishedMethodReduce: true});
        this._throwIfDispatchedBeforeLogOut(action);
        this._registerUnchangedState(action);
        return; // Get out of here.
      }
        //
      // 2.4) If the reducer is ASYNC, we still process the rest of the reducer to generate the new state.
      else if (reduceResult instanceof Promise) {
        reduceResult = await reduceResult as AsyncReducerResult<St>;
        action._changeStatus({hasFinishedMethodReduce: true});
        this._throwIfDispatchedBeforeLogOut(action);

        if (reduceResult == null || reduceResult === this.state) {
          this._registerUnchangedState(action);
        }
        //
        else {
          if ((action.ifRetryIsOn || action._isUnlimitedRetryCheckInternet) && !this._isFunction(reduceResult))
            throw Store._syncRetryError(action);

          const newAsyncState = reduceResult(this.state);
          if (newAsyncState != null && newAsyncState !== this.state) {

            if (action['abortReduce'](newAsyncState)) {
              this._registerUnchangedState(action);
            } else
              this._registerState(action, newAsyncState);
          } else
            this._registerUnchangedState(action);
        }

        return; // Get out of here.
      }
        //
      // 2.5) If the reducer is SYNC, we already have the new state, and we simply must apply it.
      else {
        action._changeStatus({hasFinishedMethodReduce: true});
        this._throwIfDispatchedBeforeLogOut(action);

        if (action['abortReduce'](reduceResult)) {
          action._changeStatus({hasFinishedMethodReduce: true});
          this._registerUnchangedState(action);
        } else
          this._registerState(action, reduceResult);

        return; // Get out of here.
      }
    }).then();
  }

  private _runAsyncReduceOnwards(action: KissAction<St>, reduceResult: AsyncReducer<St>) {

    this._wrapsAsync(action, async () => {

      // 5.1) Method `reduce` is ASYNC, so we wait for it to finish.
      const functionalReduceResult: AsyncReducerResult<St> = await reduceResult;
      action._changeStatus({hasFinishedMethodReduce: true});
      this._throwIfDispatchedBeforeLogOut(action);

      // 5.2) If the reducer returned null, we simply do nothing.
      if (functionalReduceResult == null) {
        this._registerUnchangedState(action);
        return; // Get out of here.
      }
        //
        // 5.3) If the reducer returned a function `(state: St) => (St | null)`,
      // we still need to run this function to generate the new state.
      else {
        if ((action.ifRetryIsOn || action._isUnlimitedRetryCheckInternet) && !this._isFunction(functionalReduceResult))
          throw Store._syncRetryError(action);

        const finalReduceState = functionalReduceResult(this.state);

        if (finalReduceState != null && finalReduceState !== this.state) {

          if (action['abortReduce'](finalReduceState)) {
            this._registerUnchangedState(action);
          } else
            this._registerState(action, finalReduceState);
        } else
          this._registerUnchangedState(action);

        return; // Get out of here.
      }
    }).then();
  }

  private _isFunction(obj: any): boolean {
    return typeof obj === 'function';
  }

  /**
   * Called when the action finished with no error, but did not change the state: the reducer
   * returned null or the unchanged state, or `abortReduce()` returned true. The state-observer
   * is still called, with the same `prevState` and `newState`. And if the action is a
   * `PersistAction`, the state is persisted right away.
   */
  private _registerUnchangedState(action: KissAction<St>) {
    this._observeState(action, this._state, this._state, null);
    this._record(action, false, this._state, this._state, null);

    if (action instanceof PersistAction && this._processPersistence != null)
      this._processPersistence.process(action, this._state);
  }

  private _registerState(action: KissAction<St>, newState: St) {

    if (this._logStateChanges && Store._isLogging()) {
      try {
        const stateChangeDescription = Store.describeStateChange(this.state, newState);
        if (stateChangeDescription !== '') Store.log(stateChangeDescription);
      } catch {
        // Swallow error and do nothing, as this is just a debug print.
      }
    }

    const prevState = this._state;

    if (newState != null && newState !== this._state) {
      this._state = newState;

      // Remove the wait state for the action in progress. This is done BEFORE publishing the
      // new state, so that a single render sees both the new state and the end of the waiting.
      // Note: `after()` still runs later, in `_processWrapsFinally`, and a non-reentrant key is
      // only released there.
      const removed = this._actionsInProgress.delete(action);
      if (removed) this._resolveSuspenseWaits();

      // Publish the new state, and then the status change. React checks the components that
      // use them, and renders the ones whose selected values changed. Nothing is rendered
      // synchronously here: React schedules the render, and reads the values again then.
      this._stateListeners.notify();
      if (removed) this._statusListeners.notify();

      // Observe the state with null error, because the reducer completed normally.
      this._observeState(action, prevState, newState, null);

      this._record(action, false, prevState, newState, null);

      // ---

      // Check the wait-conditions after state change. We pass it the trigger-action.
      if (removed) this._checkAllActionConditions(action);

      // Check the wait-conditions after state change.
      this._waitConditions = this._waitConditions.filter(condition => {
        let checked: boolean;
        try {
          checked = condition.check(this.state);
        } catch (error) {
          // A throwing condition only fails its own wait. It doesn't affect the trigger action.
          condition.reject(error);
          return false; // remove the condition from the array.
        }
        if (checked) {
          // Resolve, returning the action that triggered the condition.
          condition.resolve(action);
          return false; // remove the condition from the array.
        }
        return true; // keep the condition in the array.
      });
    }

    if (this._processPersistence != null)
      this._processPersistence.process(
        action,
        newState
      );

    // Dispatch the `dispatchWhen` actions whose condition was met. This is done only now, so that
    // all wait-conditions are checked against the state that met them, and the persistor gets
    // that state before the state changed by these actions. Each condition is checked again
    // right before its action is dispatched, since an earlier action may have made it false.
    if (this._dispatchWhenQueue.length > 0) {
      const dispatchIfStillMetFunctions = this._dispatchWhenQueue;
      this._dispatchWhenQueue = [];
      for (const dispatchIfStillMet of dispatchIfStillMetFunctions) dispatchIfStillMet();
    }
  }

  /**
   * For this to work, we have to pass a function `showUserException` in the constructor
   * of the Store, that will open some UI to show the error to the user.
   *
   * 1) If the UI is still open, don't do anything.
   * 2) If no UI is open, check to see if any errors are in the queue.
   *    If so, remove the first error from the queue and show it in the UI.
   * 3) In this case, we mark the UI as open, and count the number of errors still in the queue.
   * 4) When the UI calls `next()`, we mark the UI as closed, and call the method again, to
   *    process the next error in the queue, if any.
   *
   * IMPORTANT: Failing to call `next()` will prevent the UI to ever opening again, because
   * Kiss will think the previous UI is still open. In contrast, calling `next()` as soon
   * as the UI opens may result in opening more than one UI on top pf each other.
   * Also, calling `next()` when there are no more errors in the queue will do nothing.
   *
   * An example using React Native:
   *
   * ```ts
   * const showUserException = (exception: UserException, count: number, next: () => void) => {
   *     Alert.alert(
   *       exception.title || exception.message,
   *       exception.title ? exception.message : '',
   *       [{ text: 'OK', onPress: (_value?: string) => next() }]
   *     );
   *   };
   * ```
   */
  private _openSomeUiToShowUserException() {

    // 1) If the UI is still open, don't do anything.
    if (this._isUserExceptionUiOpen) return;

    // 2.1) If no UI is open,
    else {
      // 2.2) Check to see if any errors are in the queue. If so, remove the first error from the queue.
      const currentError = this.userExceptionsQueue.shift();
      if (currentError !== undefined) {

        // 3.1) In this case, we mark the UI as open,
        this._isUserExceptionUiOpen = true;

        // 3.2) and count the number of errors still in the queue.
        const queued = this.userExceptionsQueue.length;

        // 2.3) And show it in the UI.
        try {
          this._showUserException?.(currentError, queued,

            // 4.1) When the UI calls `next()`.
            () => {

              // 4.2) We mark the UI as closed.
              this._isUserExceptionUiOpen = false;

              // 4.3) And call the method again, to process the next error in the queue, if any.
              this._openSomeUiToShowUserException();
            });
        } catch (error) {
          // A throwing `showUserException` must not block future dialogs, nor replace the
          // action's error. We log it, mark the UI as closed, and continue with the queue.
          Store._logLazy(() => `The showUserException function threw an error: ${error}.
      This error will be ignored, but you should fix this, as showUserException should not throw errors.`);
          this._isUserExceptionUiOpen = false;
          this._openSomeUiToShowUserException();
        }
      }
    }
  };

  private _isUserExceptionUiOpen: boolean = false;

  // Processes the errors of the Persistor. The `error` was already processed by the persistor's
  // `wrapError`, and `originalError` is the error before it. The error is given to the
  // `errorObserver`, with a `null` action. Then:
  // - If `observeOnly` is true, nothing else is done, since the error is thrown by `logOut`.
  // - If it's a `UserException`, it's shown to the user.
  // - If it's `null`, it's swallowed.
  // - Otherwise, it's thrown as an unhandled promise rejection, since there is no `dispatch`
  //   call to throw it to.
  private _processPersistorError(error: any, originalError: any, observeOnly: boolean) {
    if (this._errorObserver) error = this._observeError(error, originalError, null);
    if (observeOnly || (error === null)) return;

    if (error instanceof UserException) {
      if (error.ifOpenDialog) {
        this._addUserException(error);
        this._openSomeUiToShowUserException();
      }
    }
    //
    else void Promise.reject(error);
  }

  private _addUserException(error: UserException) {
    this.userExceptionsQueue.push(error);
  }

  /**
   * Aborts all the actions of the given `type` (or of a subclass) that are in progress. Each
   * one finishes silently: its `abortSignal` is aborted, its result is ignored (it doesn't
   * change the state), and so are its errors (no error dialog, it doesn't count as failed, and
   * it isn't retried). Its status has `isDispatchAborted: true`, and `dispatchAndWait`
   * resolves. Inside the action, `isAborted` is `true`.
   *
   * For example, to cancel the request a component started, when the component unmounts:
   *
   * ```ts
   * useStoreEffect({
   *   onMount: (store) => store.dispatch(new LoadUser(userId)),
   *   onUnmount: (store) => store.abort(LoadUser),
   * });
   * ```
   *
   * Or from a "Cancel" button: `onClick={() => store.abort(UploadFile)}`.
   *
   * - A request that uses the action's `abortSignal` is cancelled right away. Otherwise, the
   *   action is still in progress (`isWaiting` is `true`) until the request finishes, and
   *   only then its result is ignored.
   * - An action aborted during its `before` method doesn't run its reducer. One aborted while
   *   waiting to retry stops retrying.
   * - It does nothing if no action of the type is in progress.
   *
   * Pass `{ statusKey }` to abort only the actions with that `statusKey` (see
   * `KissAction.statusKey`): `store.abort(LoadUser, { statusKey: userId })`.
   *
   * To abort a single action instance, use its `abort()` method.
   */
  abort<T extends KissAction<St>>(type: abstract new (...args: any[]) => T, options?: StatusOptions): void {
    const statusKey = options?.statusKey;
    for (const action of this._actionsInProgress) {
      if (action instanceof type && (statusKey === undefined || _isSameNonReentrantKey(action.statusKey, statusKey)))
        action._abort(`The action was aborted by store.abort(${type.name}).`);
    }
  }

  /**
   * You can use `isWaiting` and pass it an action `type`:
   * - It returns true if an action of the given type (or of a subclass) is currently being processed.
   * - It returns false if no action of the given type is currently being processed.
   * - This is only useful for ASYNC actions. A SYNC action finishes before `dispatch` returns, so
   *   outside of it, `isWaiting` is always `false` for it, and components never see it as `true`.
   * - Inside an action, `isWaiting` of the action's own type is always `true` (even when the action
   *   is SYNC), since the action itself is being processed.
   *
   * Note an action is ASYNC if it returns a promise from its `before` OR its `reduce` methods.
   *
   * ```ts
   * store.dispatch(new MyAction());
   * if (store.isWaiting(MyAction)) { ... } // Show a spinner
   * ```
   *
   * Pass `{ statusKey }` to consider only the actions with that `statusKey` (see
   * `KissAction.statusKey`): `store.isWaiting(LoadUser, { statusKey: userId })`.
   */
  isWaiting<T extends KissAction<St>>(type: abstract new (...args: any[]) => T, options?: StatusOptions): boolean {
    const statusKey = options?.statusKey;
    for (const action of this._actionsInProgress) {
      if (action instanceof type && (statusKey === undefined || _isSameNonReentrantKey(action.statusKey, statusKey))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if the given action `type` failed, with any error, not only with a
   * `UserException`. Use `exceptionFor` to get the error, if it was a `UserException`.
   * An error swallowed by `wrapError` or the `errorObserver` (they returned `null`), and
   * an `AbortDispatchException`, don't count as failures.
   * Note: This method uses the EXACT action type. Subtypes are not considered.
   *
   * Pass `{ statusKey }` to consider only the failures with that `statusKey` (see
   * `KissAction.statusKey`): `store.isFailed(LoadUser, { statusKey: userId })`.
   */
  isFailed<T extends KissAction<any>>(type: { new(...args: any[]): T }, options?: StatusOptions): boolean {
    return this._findFailure(type, options) !== null;
  }

  /**
   * Returns the `UserException` of the `type` that failed. Returns `null` if it didn't fail,
   * or if it failed with an error that is not a `UserException` (in that case, `isFailed` is
   * still true).
   * Note: This method uses the EXACT type in `type`. Subtypes are not considered.
   *
   * Pass `{ statusKey }` to get the exception of the failure with that `statusKey` (see
   * `KissAction.statusKey`): `store.exceptionFor(LoadUser, { statusKey: userId })`. Without it,
   * if actions with different keys failed, you get the `UserException` of the most recent
   * failure.
   */
  exceptionFor<T extends KissAction<St>>(type: {
    new(...args: any[]): T
  }, options?: StatusOptions): (UserException | null) {
    const failures = this._failedActions.get(type);
    if (failures === undefined) return null;
    const statusKey = options?.statusKey;

    // The most recent failure is the last one. Without a key, we return the most recent
    // UserException, skipping the failures with other kinds of errors.
    for (let i = failures.length - 1; i >= 0; i--) {
      const failure = failures[i];
      if (statusKey !== undefined && !_isSameNonReentrantKey(failure.statusKey, statusKey)) continue;
      if (failure.error instanceof UserException) return failure.error;
      if (statusKey !== undefined) return null;
    }
    return null;
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
   * store.clearExceptionFor(MyAction);
   * ```
   *
   * Pass `{ statusKey }` to clear only the failure with that `statusKey` (see
   * `KissAction.statusKey`): `store.clearExceptionFor(LoadUser, { statusKey: userId })`.
   * Without it, all the failures of the type are cleared, whatever their keys.
   */
  clearExceptionFor<T extends KissAction<St>>(type: { new(...args: any[]): T }, options?: StatusOptions): void {
    const statusKey = options?.statusKey;
    const removed = (statusKey === undefined)
      ? this._failedActions.delete(type)
      : this._removeFailure(type, statusKey);
    if (removed) this._statusListeners.notify();
  }

  /**
   * Clears the failures of all action types, so that `isFailed` is `false` and `exceptionFor`
   * is `null` for all of them. The components that use them are updated.
   *
   * You rarely need to call this yourself, since `clearInternalActionProps()` already calls it,
   * and so do `logOut()` and the shutdown of the store (`setShutDown(true)` and `dispose()`).
   * The failures kept for actions with a `statusKey` (one per key that failed) are also
   * released here. See `KissAction.statusKey`.
   */
  clearAllExceptions(): void {
    if (this._failedActions.size === 0) return;
    this._failedActions.clear();
    this._statusListeners.notify();
  }

  /**
   * Internal: the value `useSuspense` reads as its snapshot, for the given action `type` and
   * `statusKey` (`undefined` matches any key):
   *
   * - A promise, while an action of the type (or of a subclass) with that key is in progress,
   *   as `isWaiting` sees it. The same promise object is returned until the action finishes, as
   *   React's Suspense needs, and it resolves then (see `_resolveSuspenseWaits`). The promise
   *   is created the first time it's asked for, so a store whose components never call
   *   `useSuspense` creates none.
   * - Otherwise, when `throwErrors` is true, the failure record of the type with that key, as
   *   `isFailed` sees it (the exact type; without a key, the most recent failure). It's the
   *   same object until the failure is replaced or cleared.
   * - Otherwise `null`.
   *
   * @internal
   */
  _suspenseValue(
    type: abstract new (...args: any[]) => KissAction<any>,
    statusKey: unknown,
    throwErrors: boolean = true,
  ): Promise<void> | Failure | null {
    if (this.isWaiting(type, { statusKey })) {
      let wait = this._suspenseWaits.find(w => w.type === type && _isSameNonReentrantKey(w.statusKey, statusKey));
      if (wait === undefined) {
        let resolve!: () => void;
        const promise = new Promise<void>(r => resolve = r);
        wait = { type, statusKey, promise, resolve };
        this._suspenseWaits.push(wait);
      }
      return wait.promise;
    }
    if (!throwErrors) return null;
    return this._findFailure(type as new (...args: any[]) => KissAction<any>, { statusKey });
  }

  /**
   * Resolves and removes the `useSuspense` promises whose action is not in progress anymore.
   * Called when an action leaves `_actionsInProgress`. Costs nothing while the list is empty.
   */
  private _resolveSuspenseWaits(): void {
    if (this._suspenseWaits.length === 0) return;
    for (let i = this._suspenseWaits.length - 1; i >= 0; i--) {
      const wait = this._suspenseWaits[i];
      if (!this.isWaiting(wait.type, { statusKey: wait.statusKey })) {
        this._suspenseWaits.splice(i, 1);
        wait.resolve();
      }
    }
  }

  /**
   * Returns the failure of the given `type` that matches `options.statusKey`, or the most
   * recent failure of the type when there is no key. Returns `null` if there is none.
   */
  private _findFailure(type: new (...args: any[]) => KissAction<any>, options?: StatusOptions): Failure | null {
    const failures = this._failedActions.get(type);
    if (failures === undefined) return null;
    const statusKey = options?.statusKey;
    if (statusKey === undefined) return failures[failures.length - 1] ?? null;
    return failures.find(failure => _isSameNonReentrantKey(failure.statusKey, statusKey)) ?? null;
  }

  /** Records a failure, replacing the previous failure of the same type and `statusKey`, if any. */
  private _addFailure(type: new (...args: any[]) => KissAction<St>, statusKey: unknown, error: unknown): void {
    this._removeFailure(type, statusKey);
    const failures = this._failedActions.get(type);
    if (failures === undefined) this._failedActions.set(type, [{ statusKey, error }]);
    else failures.push({ statusKey, error });
  }

  /** Removes the failure of the given type and `statusKey`. Returns true if there was one. */
  private _removeFailure(type: new (...args: any[]) => KissAction<St>, statusKey: unknown): boolean {
    const failures = this._failedActions.get(type);
    if (failures === undefined) return false;
    const index = failures.findIndex(failure => _isSameNonReentrantKey(failure.statusKey, statusKey));
    if (index === -1) return false;
    failures.splice(index, 1);
    if (failures.length === 0) this._failedActions.delete(type);
    return true;
  }

  /**
   * Returns true if the event was already handled (spent) by a component of this store, with
   * `useEvent` or `useLayoutEvent`. Also true for `Evt.spent()` and `EvtState.spent()`, and
   * for restored (persisted) events, which are spent in every store.
   *
   * Useful in component tests, to check that a component handled the event:
   *
   * ```ts
   * await store.dispatchAndWait(new ScrollFeedToTop());
   * expect(store.isEventSpent(store.state.scrollToTopEvt)).toBe(true);
   * ```
   *
   * Note an `EvtState` is never spent by components, so for it this only returns true for
   * `EvtState.spent()` and restored events.
   */
  isEventSpent(evt: Evt<any> | EvtState<any>): boolean {
    return evt._spentAtCreation || (evt instanceof Evt && this._spentEvents.has(evt));
  }

  // ----------------------------------------------------------------------------------------------
  // Environment, dependencies and configuration.
  // ----------------------------------------------------------------------------------------------

  /**
   * The environment the app is running in (production, staging, testing, etc), as given to the
   * store constructor, or `undefined`. It never changes while the app runs. Typed `unknown`:
   * declare a typed getter in your base action, like
   * `get env() { return this.store.environment as Environment; }`. In components, use
   * `useEnvironment()`.
   *
   * See also: `configuration` and `dependencies`. And `setProp`, for the values that may
   * change while the app runs.
   */
  get environment(): unknown {
    return this._environment;
  }

  /**
   * The configuration of the app (feature flags and other configuration values), created by
   * the `configuration` factory given to the store constructor, or `undefined`. It's meant to
   * be immutable. Typed `unknown`: declare a typed getter in your base action, like
   * `get config() { return this.store.configuration as Config; }`. In components, use
   * `useConfiguration()`.
   *
   * `store.dispose()` disposes it, if it has a `[Symbol.asyncDispose]()`, `[Symbol.dispose]()`
   * or `dispose()` method. `logOut` keeps it.
   *
   * See also: `environment` and `dependencies`.
   */
  get configuration(): unknown {
    return this._configuration;
  }

  /**
   * The dependencies of the app (services, repositories, API clients, etc), created by the
   * `dependencies` factory given to the store constructor, or `undefined`. They belong to the
   * store: each test creates its own store with its own dependencies. Typed `unknown`: declare
   * a typed getter in your base action, like
   * `get deps() { return this.store.dependencies as Dependencies; }`. Components should
   * usually not need them.
   *
   * `store.dispose()` disposes them, if they have a `[Symbol.asyncDispose]()`,
   * `[Symbol.dispose]()` or `dispose()` method. `logOut` keeps them, since they belong to the
   * app, and not to the user.
   *
   * See also: `environment` and `configuration`. And `mocks`, which mocks actions, while the
   * dependencies mock services.
   */
  get dependencies(): unknown {
    return this._dependencies;
  }

  /**
   * Internal: Disposes the dependencies or the configuration, when they have a
   * `[Symbol.asyncDispose]()`, `[Symbol.dispose]()` or `dispose()` method. Returns a promise
   * if the disposal is async, or `null`. Neither throws nor rejects: the errors are reported
   * with `_reportDisposeError`.
   */
  private _disposeInjected(value: unknown, description: string): Promise<void> | null {
    if (value === null || typeof value !== 'object') return null;
    const v = value as any;

    const what = `Disposing ${description} threw an error`;
    let result: unknown;
    try {
      const bySymbol = Store._disposeBySymbol(v);
      if (bySymbol !== null) result = bySymbol.result;
      else if (typeof v.dispose === 'function') result = v.dispose();
      else return null;
    } catch (error) {
      this._reportDisposeError(error, what);
      return null;
    }

    if (!Store._isPromiseLike(result)) return null;

    return Promise.resolve(result).then(
      () => undefined,
      (error) => this._reportDisposeError(error, what),
    );
  }

  // ----------------------------------------------------------------------------------------------
  // Store props.
  // ----------------------------------------------------------------------------------------------

  /**
   * Sets a prop in the store. The props hold the long-lived things of the app that are not
   * state, and must not go in the state: intervals and timeouts, WebSockets, `EventSource`s,
   * `AbortController`s, listeners (like Firebase's `onSnapshot`, which returns an unsubscribe
   * function), RxJS subscriptions. The props belong to the store, so that each test, or each
   * request in server-side rendering, has its own, and so that they can all be closed at
   * once, with `store.dispose()` (when the app finishes, or at the end of each test), or
   * with `disposeProps()` and `logOut({ disposeProps: true })`.
   *
   * The `key` can be any value. Keys are compared by identity, like the keys of a `Map`, so
   * equal strings are the same key, but two different objects are not. Read the prop with
   * `prop(key)`, and remove it with `disposeProp(key)`, which also disposes its value.
   *
   * Setting a prop with a key that already exists replaces its value, and disposes the previous
   * value (if it's a different one), so that dispatching a "start" action twice doesn't leak the
   * first timer or listener. Setting the same value again only updates its `dispose` option.
   *
   * This is also available in actions, as `this.setProp()`:
   *
   * ```ts
   * class StartClock extends Action {
   *   reduce() {
   *     const interval = setInterval(() => this.dispatch(new Tick()), 1000);
   *     this.setProp('clock', interval, { dispose: clearInterval });
   *     return null;
   *   }
   * }
   *
   * class StopClock extends Action {
   *   reduce() {
   *     this.disposeProp('clock');
   *     return null;
   *   }
   * }
   * ```
   *
   * How a prop is disposed, in order:
   *
   * 1. The `dispose` option given to `setProp`, if any, which gets the value.
   * 2. The value's `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` method (TC39 explicit
   *    resource management, supported by TypeScript's `using`).
   * 3. An `AbortController` is aborted.
   * 4. A `WebSocket`, `EventSource`, `BroadcastChannel` or `MessagePort` is closed, and a
   *    `Worker` is terminated.
   * 5. An object with an `unsubscribe()` method (like an RxJS subscription) is unsubscribed.
   * 6. Otherwise, the value can't be disposed, and it's only removed from the props.
   *
   * Note:
   * - Timers need the `dispose` option, since in browsers `setTimeout` and `setInterval` return
   *   numbers, which can't be told apart from other numbers. Use `{ dispose: clearInterval }` or
   *   `{ dispose: clearTimeout }`.
   * - Functions are not called automatically, since an unsubscribe function looks the same as a
   *   callback kept in a prop. Use `{ dispose: (unsubscribe) => unsubscribe() }`.
   * - Promises can't be cancelled, so they're only removed. Keep an `AbortController` in a prop
   *   to cancel the work.
   * - A `dispose` that throws, or returns a promise that rejects, doesn't stop the other props
   *   from being disposed. The error is given to the `errorObserver` (with a `null` action),
   *   and if there is none, or if it returns an error, the error is logged.
   * - After `store.dispose()`, a prop that is set (for example, by an async action that was
   *   still running) is disposed right away, and not kept.
   *
   * See also: `prop`, `props`, `disposeProp`, `disposeProps` and `dispose`.
   */
  setProp<V>(key: unknown, value: V, options?: SetPropOptions<V>): void {
    const dispose = options?.dispose as PropDispose | undefined;

    // A disposed store doesn't keep props, so that they don't leak.
    if (this._disposed) {
      Store._logLazy(() => `The prop ${Store._describeKey(key)} was set after the store was disposed, ` +
        `so its value was disposed right away, and not kept.`);
      void this._disposeValue(key, value, dispose);
      return;
    }

    const hadKey = this._props.has(key);
    const previous = this._props.get(key);
    const previousDispose = this._propDisposers.get(key);

    this._props.set(key, value);
    if (dispose !== undefined) this._propDisposers.set(key, dispose);
    else this._propDisposers.delete(key);

    // Replacing a value disposes the previous one, so that it doesn't leak. This is done after
    // the new value is in place, in case the disposal reads the props.
    if (hadKey && !Object.is(previous, value)) void this._disposeValue(key, previous, previousDispose);
  }

  /**
   * Returns the prop with the given key, or `undefined` if there is none. See `setProp`.
   *
   * Give it the type of the value: `const interval = store.prop<number>('clock')`.
   *
   * This is also available in actions, as `this.prop()`.
   */
  prop<V = unknown>(key: unknown): V | undefined {
    return this._props.get(key) as V | undefined;
  }

  /**
   * All the props of the store (see `setProp`), with their keys and values, in the order they
   * were set. It's a read-only view: use `setProp`, `disposeProp` and `disposeProps` to change
   * them. Useful in tests.
   *
   * This is also available in actions, as `this.props`.
   */
  get props(): ReadonlyMap<unknown, unknown> {
    return this._props;
  }

  /**
   * Disposes the prop with the given key, and removes it from the props. See `setProp` for
   * how the value is disposed. Does nothing if there is no prop with that key.
   *
   * It doesn't wait for an async disposal (one that returns a promise) to finish. If that
   * disposal fails, the error is given to the `errorObserver` (with a `null` action), or logged.
   * Use `store.dispose()` to wait for all the async disposals.
   *
   * This is also available in actions, as `this.disposeProp()`.
   *
   * ```ts
   * class StopClock extends Action {
   *   reduce() {
   *     this.disposeProp('clock');
   *     return null;
   *   }
   * }
   * ```
   */
  disposeProp(key: unknown): void {
    if (!this._props.has(key)) return;
    const value = this._props.get(key);
    const dispose = this._propDisposers.get(key);
    this._props.delete(key);
    this._propDisposers.delete(key);
    void this._disposeValue(key, value, dispose);
  }

  /**
   * Disposes the props, and removes them from the props. See `setProp` for how the values are
   * disposed. The values that can't be disposed are only removed.
   *
   * - Without a `predicate`, all the props are disposed and removed.
   * - With a `predicate`, it's called with the key and the value of each prop, and only the
   *   props for which it returns `true` are disposed and removed. The others are kept, and not
   *   disposed.
   *
   * The props are disposed in the order they were set. A disposal that throws doesn't stop the
   * others. It doesn't wait for the async disposals (the ones that return a promise) to finish.
   * Use `store.dispose()` to wait for them.
   *
   * A `predicate` that throws for a prop is treated like a disposal that throws: the error is
   * given to the `errorObserver` (or logged), the prop is kept, and the other props are still
   * disposed. This method never throws.
   *
   * This is also available in actions, as `this.disposeProps()`.
   *
   * ```ts
   * // Disposes all props.
   * store.disposeProps();
   *
   * // Disposes only the props whose key starts with 'user'.
   * store.disposeProps((key, value) => String(key).startsWith('user'));
   * ```
   *
   * See also: `disposeProp`, to dispose a single prop by its key, and `logOut`, which can
   * dispose the props with its `disposeProps` option.
   */
  disposeProps(predicate?: PropPredicate): void {
    void this._disposeProps(predicate);
  }

  /**
   * Internal: Disposes the selected props (all of them, without a predicate), and returns a
   * promise that resolves when their async disposals finish. It never rejects: the errors are
   * reported with `_reportDisposeError`.
   */
  private _disposeProps(predicate?: PropPredicate): Promise<void> {
    const promises: Promise<void>[] = [];

    // A snapshot, since a disposal may set or dispose other props.
    for (const [key, value] of [...this._props.entries()]) {

      // Skips a prop that was disposed, or replaced, by an earlier disposal.
      if (!this._props.has(key) || !Object.is(this._props.get(key), value)) continue;

      // A predicate that throws is reported, and the prop is kept, as if it returned false.
      if (predicate !== undefined) {
        let selected: boolean;
        try {
          selected = predicate(key, value);
        } catch (error) {
          this._reportDisposeError(error,
            `The disposeProps predicate threw an error for the prop ${Store._describeKey(key)}, which was kept`);
          continue;
        }
        if (!selected) continue;
      }

      const dispose = this._propDisposers.get(key);
      this._props.delete(key);
      this._propDisposers.delete(key);

      const promise = this._disposeValue(key, value, dispose);
      if (promise !== null) promises.push(promise);
    }

    return (promises.length === 0) ? Promise.resolve() : Promise.all(promises).then(() => undefined);
  }

  /**
   * Internal: Disposes the value of a prop, as described in `setProp`. Returns a promise if the
   * disposal is async, or `null`. Neither throws nor rejects: the errors are reported with
   * `_reportDisposeError`.
   */
  private _disposeValue(key: unknown, value: unknown, dispose: PropDispose | undefined): Promise<void> | null {
    const what = `Disposing the prop ${Store._describeKey(key)} threw an error`;
    let result: unknown;
    try {
      if (dispose !== undefined) result = dispose(value);
      else result = Store._disposeByType(value);
    } catch (error) {
      this._reportDisposeError(error, what);
      return null;
    }

    if (!Store._isPromiseLike(result)) return null;

    return Promise.resolve(result).then(
      () => undefined,
      (error) => this._reportDisposeError(error, what),
    );
  }

  /**
   * Internal: Disposes the value with the TC39 explicit resource management protocol, if it
   * has a `[Symbol.asyncDispose]()` or `[Symbol.dispose]()` method, and returns the result of
   * the disposal (a promise, if it's async), wrapped. Returns `null` if it has neither method.
   * The wrapper is needed because a disposal may legitimately return `undefined`.
   */
  private static _disposeBySymbol(v: any): { result: unknown } | null {
    if (typeof Symbol.asyncDispose === 'symbol' && typeof v[Symbol.asyncDispose] === 'function')
      return { result: v[Symbol.asyncDispose]() };
    if (typeof Symbol.dispose === 'symbol' && typeof v[Symbol.dispose] === 'function')
      return { result: v[Symbol.dispose]() };
    return null;
  }

  /**
   * Internal: Disposes the value by its type (steps 2 to 5 of `setProp`), and returns the
   * result of the disposal (a promise, if it's async). Returns `undefined` if the value can't
   * be disposed.
   */
  private static _disposeByType(value: unknown): unknown {
    if (value === null || typeof value !== 'object') return undefined;
    const v = value as any;

    // TC39 explicit resource management.
    const bySymbol = Store._disposeBySymbol(v);
    if (bySymbol !== null) return bySymbol.result;

    // Browser and Node types. Each global may not exist in the runtime.
    if (Store._isInstanceOfGlobal(v, 'AbortController')) return v.abort();
    if (Store._isInstanceOfGlobal(v, 'WebSocket')
      || Store._isInstanceOfGlobal(v, 'EventSource')
      || Store._isInstanceOfGlobal(v, 'BroadcastChannel')
      || Store._isInstanceOfGlobal(v, 'MessagePort')) return v.close();
    if (Store._isInstanceOfGlobal(v, 'Worker')) return v.terminate();

    // RxJS subscriptions, and others.
    if (typeof v.unsubscribe === 'function') return v.unsubscribe();

    return undefined;
  }

  // True if the global class with the given name exists in the runtime, and the value is an
  // instance of it.
  private static _isInstanceOfGlobal(value: object, name: string): boolean {
    const type = (globalThis as any)[name];
    return typeof type === 'function' && value instanceof type;
  }

  private static _isPromiseLike(value: unknown): value is PromiseLike<unknown> {
    return value !== null && (typeof value === 'object' || typeof value === 'function')
      && typeof (value as any).then === 'function';
  }

  // Reports an error of the disposal of the props (a prop, or the disposeProps predicate), of
  // the dependencies, or of the configuration: to the `errorObserver` (with a `null` action), if
  // there is one. If it returns an error (or there is no observer), the error is logged. Never
  // throws: the error may not be convertible to a string (a Symbol, or an object whose
  // `toString` throws), so it's described with `_describeValue`. The `what` is the start of the
  // log message, like `Disposing the prop 'clock' threw an error`.
  private _reportDisposeError(error: unknown, what: string): void {
    if (this._errorObserver) {
      error = this._observeError(error, error, null);
      if (error === null) return;
    }
    Store._logLazy(() => `${what}: ${Store._describeValue(error)}. ` +
      `The error was ignored, and the other disposals were still done.`);
  }

  // Describes a prop key for log messages. Never throws.
  private static _describeKey(key: unknown): string {
    return (typeof key === 'string') ? `'${key}'` : Store._describeValue(key);
  }

  // ----------------------------------------------------------------------------------------------
  // Server-side rendering: merging the server-loaded state of a route.
  // ----------------------------------------------------------------------------------------------

  /**
   * Merges a slice of state, loaded on the server for a route, into the store state,
   * synchronously, by dispatching a `MergeServerStateAction`. In a server-rendered app with
   * several routes, each route's server code loads its own data (a server component in the
   * Next.js app router, `getServerSideProps` in the pages router, a loader in Remix), and the
   * `StoreSlice` component gives it to the store with this method, on the server and on the
   * client, so that the HTML shows it, hydration matches, and client-side navigation shows the
   * new route's data in its first render. See "Server-side rendering" in the README.
   *
   * How the slice is merged: the `mergeServerState` option of the constructor, or, without it,
   * a shallow merge for plain-object states (`{ ...state, ...slice }`). When nothing changes,
   * the state is kept (same reference), and nothing is published.
   *
   * The server data wins: a field in the slice replaces the field in the state, even if the
   * client changed it. To keep client fields, use the `mergeServerState` option.
   *
   * Before the store is ready (a persistor still reading the persisted state), the slice is
   * merged right away, and merged again into the persisted state when it arrives, so that the
   * route's server data is not lost. The persistor may persist the merged state.
   */
  mergeServerState(slice: object): void {
    this._mergeServerState(slice);
  }

  /**
   * Internal: like `mergeServerState`, but doesn't publish the state change. Returns a function
   * that publishes it. For `StoreSlice`, which merges while React renders it (the children
   * must read the merged state in the same render), and publishes after the commit, since
   * publishing during a render would make React warn about updating other components.
   * @internal
   */
  _mergeServerStateSilently(slice: object): () => void {
    return this._notificationBatch.suspend(() => this._mergeServerState(slice));
  }

  private _mergeServerState(slice: object): void {
    const pp = this._processPersistence;
    if (pp !== null && !pp.isReady) this._pendingServerSlices.push(slice);
    this._applyingServerSlice = true;
    try {
      this.dispatchSync(new MergeServerStateAction<St>(slice));
    } finally {
      this._applyingServerSlice = false;
    }
  }

  /**
   * Internal: merges a slice into a state, with the `mergeServerState` option of the
   * constructor, or with the default shallow merge. Used by `MergeServerStateAction` (for the
   * store state) and by `StoreSlice` (for the server state of its subtree).
   * @internal
   */
  _mergeSlice(state: St, slice: object): St {
    if (this._mergeServerStateFn !== undefined) return this._mergeServerStateFn(state, slice);
    if (!isPlainObject(state) || !isPlainObject(slice))
      throw new StoreException(
        `Cannot merge the server state slice ${describeValue(slice)} into the state: the default merge is a ` +
        `shallow merge of plain objects, and the state (or the slice) is not a plain object. Give ` +
        `createStore the \`mergeServerState\` option, with how to merge a slice into your state.`);
    const current = state as Record<string, unknown>;
    for (const key of Object.keys(slice)) {
      if (!Object.is(current[key], slice[key])) return { ...current, ...slice } as St;
    }
    return state;
  }

  /**
   * Internal: merges the slices merged before the store was ready into the persisted state,
   * which replaces the store state. Called by `ProcessPersistence`.
   * @internal
   */
  _applyPendingServerSlices(persistedState: St): St {
    let state = persistedState;
    for (const slice of this._pendingServerSlices) state = this._mergeSlice(state, slice);
    return state;
  }

  // ----------------------------------------------------------------------------------------------
  // Disposing the store.
  // ----------------------------------------------------------------------------------------------

  /**
   * True after `dispose()` was called. A disposed store doesn't accept new actions, and
   * doesn't keep new props.
   */
  get isDisposed(): boolean {
    return this._disposed;
  }

  /**
   * Ends the store, for tests and app shutdown:
   *
   * ```ts
   * afterEach(() => store.dispose());
   * ```
   *
   * It does the following, in order:
   *
   * 1. Shuts down the store (`setShutDown(true)`), so that the actions dispatched from now on
   *    are aborted. This also calls `clearInternalActionProps()`, which stops the polling, the
   *    retries, the debounce timers, the sequential queues, and the other action features.
   * 2. Cancels the `dispatchWhen`s that are still waiting, so their actions are not dispatched,
   *    and their `onTimeout` is not called. The `waitCondition`s, `waitActionCondition`s,
   *    `waitAllActions`s and the other waits still pending are rejected with an
   *    `AbortDispatchException`, and their timeouts are cancelled, so that no timer is left
   *    behind. Inside an action, this aborts the action. Elsewhere, catch the rejection, or
   *    don't dispose the store while you still wait for it.
   * 3. Pauses the persistor, and cancels its pending save (a state change waiting for the
   *    throttle). A save that is already running still finishes. If you want the current state
   *    saved first, call `await store.persistAndPause()` before.
   * 4. Stops listening to the focus and online sources (see `focusSource` and `onlineSource`
   *    in the constructor), if they were started. `isFocused` and `isOnline` keep their last
   *    values.
   * 5. Disposes all the props (see `setProp`), and removes them.
   * 6. Disposes the `dependencies`, and then the `configuration` (see the constructor), when
   *    they have a `[Symbol.asyncDispose]()`, `[Symbol.dispose]()` or `dispose()` method. They
   *    can still be read from the store after that.
   *
   * The returned promise resolves when the async disposals finish. It never rejects: a
   * disposal that fails is given to the `errorObserver`, or logged, and the other disposals
   * are still done.
   *
   * The store can't be used again: `setShutDown(false)` doesn't turn it back on, and a prop
   * set after it is disposed right away. Calling `dispose()` again does nothing. Note the
   * actions that are already running still finish, and may still change the state.
   *
   * The store also implements `[Symbol.dispose]` and `[Symbol.asyncDispose]`, so that tests
   * can use TypeScript's explicit resource management: `await using store = createStore(...)`.
   */
  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this.setShutDown(true);
    this._cancelAllDispatchWhen();
    this._abortAllWaits();
    this._processPersistence?.dispose();
    this._focus.dispose();
    this._online.dispose();
    await this._disposeProps();
    await this._disposeInjected(this._dependencies, 'the dependencies');
    await this._disposeInjected(this._configuration, 'the configuration');
  }

  /**
   * Function `Store.describeStateChange()` returns a string describing only the differences between
   * two given objects.
   *
   * By default, when `logStateChanges` is set to `true` in the Store constructor, function
   * `describeStateChange` is used together with `Store.log()` to print all state changes to
   * the console. Note you should turn this off in production.
   *
   * The values can be of any type, including primitives (for a state that is a number or a
   * string), and objects with `Date`, `Map` and `Set` fields:
   *
   * ```ts
   * Store.describeStateChange(0, 1); // 'State: 0 → 1; '
   * Store.describeStateChange({ user: { name: 'Ann' } }, { user: { name: 'Bob' } }); // 'State user.name: Ann → Bob; '
   * Store.describeStateChange({ prices: new Map([['IBM', 1]]) }, { prices: new Map([['IBM', 2]]) }); // 'State prices[IBM]: 1 → 2; '
   * ```
   */
  static describeStateChange(obj1: any, obj2: any, path: string = ''): string {
    if (obj1 === obj2) return '';

    const describeChange = () =>
      `State${path === '' ? '' : ' ' + path}: ${Store._describeValue(obj1)} → ${Store._describeValue(obj2)}; `;

    // Primitives, null, or an object that replaced a primitive (or the other way around).
    if (!Store._isObject(obj1) || !Store._isObject(obj2))
      return Object.is(obj1, obj2) ? '' : describeChange();

    // Dates and sets have no keys, so they are compared by their contents.
    if (obj1 instanceof Date || obj2 instanceof Date) {
      const isSameDate = (obj1 instanceof Date) && (obj2 instanceof Date) && Object.is(obj1.getTime(), obj2.getTime());
      return isSameDate ? '' : describeChange();
    }
    if (obj1 instanceof Set || obj2 instanceof Set) {
      const isSameSet = (obj1 instanceof Set) && (obj2 instanceof Set) && (obj1.size === obj2.size)
        && [...obj1].every(value => obj2.has(value));
      return isSameSet ? '' : describeChange();
    }

    // Maps are compared by their entries, like objects are compared by their keys.
    if (obj1 instanceof Map || obj2 instanceof Map) {
      if (!(obj1 instanceof Map) || !(obj2 instanceof Map)) return describeChange();
      let differences = '';
      for (const key of new Set([...obj1.keys(), ...obj2.keys()]))
        differences += Store.describeStateChange(obj1.get(key), obj2.get(key), `${path}[${Store._describeValue(key)}]`);
      return differences;
    }

    let differences = '';
    // Combine keys from both objects
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const newPath = path === '' ? key : `${path}.${key}`;
      differences += Store.describeStateChange(obj1[key], obj2[key], newPath);
    }
    return differences;
  }

  private static _isObject(value: any): boolean {
    return typeof value === 'object' && value !== null;
  }

  // Describes a value for `describeStateChange`. Note this method should not fail.
  private static _describeValue(value: any): string {
    try {
      if (value instanceof Date) return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
      if (value instanceof Set) return `Set{${[...value].map(v => Store._describeValue(v)).join(', ')}}`;
      if (value instanceof Map)
        return `Map{${[...value].map(([k, v]) => `${Store._describeValue(k)}: ${Store._describeValue(v)}`).join(', ')}}`;
      return String(value);
    } catch {
      // For example, an object with no prototype has no `toString`.
      return Object.prototype.toString.call(value);
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
   * The default `actionsThrottle` is 6000 milliseconds (6 seconds). An `actionsThrottle` of
   * zero (or negative) doesn't wait for the actions at all. Note: If you call logOut from inside
   * an action, and wait for it, that action is still running, so logOut waits the full
   * `actionsThrottle` for it to finish.
   *
   * The actions dispatched before logOut belong to the previous user, so they can't change the
   * state of the next user. When one of them finishes, during or after logOut, it's aborted
   * (`status.isDispatchAborted`): its reducer's result is discarded, and its errors are ignored
   * (they don't go to `wrapError` or the `errorObserver`, and are not shown to the user). Errors
   * that point to a bug (`StoreException`) are still thrown. Also, the store doesn't accept the
   * actions they dispatch after logOut, with `this.dispatch`, `this.dispatchAndWait`,
   * `this.dispatchWhen`, and the others. This includes the `UpdateStateAction`s of the
   * optimistic actions (like `OptimisticCommand`), so they don't apply the server response,
   * roll back, or reload, after logOut. Note this means an action that calls logOut can't
   * change the state or dispatch actions after it. If you need that, call logOut from outside
   * of actions, and then dispatch the actions you need. Also note it can't undo what the
   * actions do outside the store, like calling the server, or saving to local storage.
   *
   * While logOut is running, the store doesn't accept new actions, and the persistor doesn't
   * persist anything but the initial-state. This includes the actions dispatched by the
   * `stateObserver` and the `actionObserver` when logOut changes the state to the
   * initial-state. Also, logOut cancels the `dispatchWhen`s that are still waiting, so their
   * actions are not dispatched, and their `onTimeout` is not called. If the app pauses the persistor (`pausePersistor`)
   * or shuts down the store (`setShutDown`), before or during logOut, they stay that way after
   * it. Note logOut deletes the persisted state, and persists the initial-state, even if the
   * persistor is paused.
   *
   * If the store has no persistor, logOut does the same, except deleting and persisting.
   *
   * The store state is always changed to the initial-state, even if deleting the persisted
   * state fails, and logOut then still tries to persist the initial-state. If deleting or
   * persisting fails, the error is given to the `errorObserver` (with a `null` action), so it
   * can be logged, and when logOut finishes, it rejects with the error. If both fail, it rejects
   * with the delete error. In this case, the old user's data may still be in the persistence,
   * so you should check if logOut rejected, and if so, tell the user it was not possible to log
   * out correctly. For example:
   *
   * ```ts
   * try {
   *   await store.logOut({ initialState: AppState.initialState() });
   *   goToLoginScreen();
   * } catch (error) {
   *   goToLogOutFailedScreen(error);
   * }
   * ```
   *
   * Note the save errors are processed by `Persistor.wrapError` first, and if it returns `null`,
   * the save doesn't count as failed. The errors the persistor reports with `Persistor.addError`
   * are given to the `errorObserver` as usual, and don't make logOut reject.
   *
   * Throws a `StoreException` if called while the persisted state is still being read at
   * startup (before `store.ready()` resolves). In this case, nothing is changed.
   */
  async logOut({
                  initialState,
                  throttle = 3000,
                  actionsThrottle = 6000,
                  disposeProps = false,
                }: {
    /** @deprecated Ignored. The store is always `this`. */
    store?: Store<St>,
    initialState: St,
    throttle?: number,
    actionsThrottle?: number,
    /**
     * Whether to dispose the store props (see `setProp`). By default, they are kept, since
     * some of them belong to the app, and not to the user (a connectivity listener, for
     * example). Pass `true` to dispose all of them, like `disposeProps()`, or a predicate to
     * dispose only the ones it selects, like `disposeProps(predicate)`. They are disposed
     * right away, when logOut starts, so that the previous user's timers and listeners stop,
     * and logOut waits for the async disposals. A disposal, or a predicate, that throws
     * doesn't stop the logOut: the error is given to the `errorObserver` (or logged).
     */
    disposeProps?: boolean | PropPredicate,
  }): Promise<void> {
    return this._logOut(this._processPersistence, initialState, throttle, actionsThrottle, disposeProps);
  }

  /**
   * For Kiss internal use only. Does the `logOut`, using the given persistence (if any).
   * @internal
   */
  async _logOut(
    persistence: ProcessPersistence<St> | null,
    initialState: St,
    throttle: number,
    actionsThrottle: number,
    disposeProps: boolean | PropPredicate = false,
  ): Promise<void> {

    // Throws if the persisted state is still being read. In this case, nothing is changed.
    // Otherwise, the persistor doesn't start a new persistence process until logOut finishes.
    persistence?._startLogOut();

    // The store doesn't start any new actions until logOut finishes.
    this._logOutsRunning++;
    this.clearInternalActionProps();

    // The props of the previous user are disposed right away, so that their timers and
    // listeners stop. The async disposals are awaited below.
    const propsDisposal: Promise<void> | null =
      (disposeProps === true) ? this._disposeProps()
        : (typeof disposeProps === 'function') ? this._disposeProps(disposeProps)
          : null;

    // The actions dispatched before this point belong to the previous user. When they finish,
    // their result is discarded, and the actions they dispatch are not accepted.
    this._logOutCount++;

    // The `dispatchWhen`s called before this point also belong to the previous user.
    this._cancelAllDispatchWhen();

    // The error logOut throws when it finishes, if deleting or persisting failed.
    let failure: { error: any } | null;

    try {
      // Waits for the async disposals of the props. Note it never rejects.
      if (propsDisposal !== null) await propsDisposal;

      // If the state is currently being persisted, we can't delete it right now.
      await persistence?._waitWhilePersisting();

      // Wait for the throttle period to finish.
      await new Promise<void>(resolve => setTimeout(resolve, capTimeoutMillis(throttle)));

      // Wait for all actions currently running to finish,
      // but wait at most `actionsThrottle` milliseconds. Note that for `waitAllActions`, a
      // zero or negative timeout means "no timeout", so in this case we don't wait at all.
      if (actionsThrottle > 0) {
        await this.waitAllActions(null, {
          timeoutMillis: actionsThrottle,
          completeImmediately: true
        })
          .catch(() => {
          });
      }

      // Delete the old persisted state. If it fails, the error is given to the `errorObserver`,
      // and logOut goes on, so that the store state is still reset. It's thrown at the end.
      const deleteFailure = await persistence?._deleteLogOutState() ?? null;

      // Synchronously change the store state to the initial-state. This is done even if the
      // app shut down the store. Since a logOut is running, this doesn't start a persistence process.
      this._isApplyingLogOutState = true;
      try {
        this.dispatchSync(new UpdateStateAction(() => initialState));
      } finally {
        this._isApplyingLogOutState = false;
      }

      // Persist the new initial-state. Even if deleting failed, since this may overwrite the old
      // persisted state. If it fails, the error is given to the `errorObserver`.
      const persistFailure = await persistence?._persistLogOutState(initialState) ?? null;

      // If both failed, the delete error is thrown, since the old persisted state may be there.
      failure = deleteFailure ?? persistFailure;
    }
      //
    finally {
      // The store accepts new actions again, unless the app shut it down.
      this._logOutsRunning--;

      // Persistence resumes, unless the app paused the persistor.
      persistence?._endLogOut();
    }

    if (failure !== null) throw failure.error;
  }

  /**
   * Pause the Persistor temporarily.
   *
   * When pausePersistor is called, the Persistor will not start a new persistence process, until method
   * resumePersistor is called. This will not affect the current persistence process, if one is currently
   * running.
   *
   * Note: A persistence process starts when the Persistor.persistDifference method is called,
   * and finishes when the promise returned by that method completes.
   */
  pausePersistor(): void {
    this._processPersistence?.pause();
  }

  /**
   * Persists the current state (if it's not yet persisted), then pauses the Persistor temporarily.
   *
   * When persistAndPausePersistor is called while the persisted state is still being read,
   * while a `logOut` is running, or while a persistence process is running, it waits for them
   * to finish. Note logOut persists its initial-state, and the state of the previous user is
   * never persisted while logOut is running. Then, if the current
   * state is not yet persisted, it immediately starts a new persistence process (ignoring
   * Persistor.throttle). The returned promise completes when the current state is persisted.
   *
   * If the save fails, the returned promise still resolves. It never rejects. This is on
   * purpose, not a bug: this method is usually called when the app is shutting down or going to
   * the background, and then the app can't recover from a failed save anyway. The error is not
   * lost: it's given to the `errorObserver` (with a `null` action) before the promise
   * resolves, so it can be logged.
   *
   * Then, the Persistor will not start another persistence process, until method
   * resumePersistor is called.
   *
   * Note: A persistence process starts when the Persistor.persistDifference method is called,
   * and finishes when the promise returned by that method completes.
   */
  persistAndPausePersistor(): Promise<void> {
    return this._processPersistence?.persistAndPause() ?? Promise.resolve();
  }

  /**
   * Resumes persistence by the Persistor,
   * after calling pausePersistor or persistAndPausePersistor.
   */
  resumePersistor(): void {
    this._processPersistence?.resume();
  }

  /**
   * Asks the Persistor to save the initialState in the local persistence.
   * If the save fails, this rejects, and nothing is considered persisted
   * (`getLastPersistedStateFromPersistor` returns `null`).
   *
   * If a save is running, it waits for it to finish first, so that it can't overwrite the
   * initialState later. State changes made meanwhile are saved after it finishes.
   */
  async saveInitialStateInPersistence(initialState: St): Promise<void> {
    return this._processPersistence?.saveInitialState(initialState);
  }

  /**
   * Asks the Persistor to read the state from the local persistence.
   * Important: If you use this, you MUST put this state into the store.
   * Kiss will assume that's the case, and will not work properly otherwise.
   *
   * If a save is running, it waits for it to finish first, so that it reads the saved state.
   * State changes made meanwhile are saved after the state is read.
   */
  async readStateFromPersistence(): Promise<St | null> {
    return this._processPersistence?.readState() || null;
  }

  /**
   * Asks the Persistor to delete the saved state from the local persistence.
   *
   * If a save is running, it waits for it to finish first, so that it can't put the deleted
   * state back. State changes made meanwhile are saved after the state is deleted.
   */
  async deleteStateFromPersistence(): Promise<void> {
    return this._processPersistence?.deleteState();
  }

  /**
   * Gets, from the Persistor, the last state that was saved to the local persistence.
   */
  getLastPersistedStateFromPersistor(): St | null {
    return this._processPersistence?.lastPersistedState ?? null;
  }

  /**
   * Returns a promise which will resolve when the given state `condition` is true.
   * If the condition is already true when the method is called, the promise resolves immediately.
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the promise rejects with a `TimeoutException`,
   * and the condition stops being checked. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1, or `Infinity`):
   *
   * ```ts
   * await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 }); // 1 second.
   * await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 0 }); // No timeout.
   * ```
   *
   * To handle the timeout, you can catch the `TimeoutException`:
   *
   * ```ts
   * try { await store.waitCondition(condition, { timeoutMillis: 5000 }); }
   * catch (error) { if (error instanceof TimeoutException) { ... } else throw error; }
   * ```
   *
   * Or, you can pass an `onTimeout` callback. If the timeout expires, `onTimeout` is called,
   * and the promise resolves with `null` instead of rejecting. If `onTimeout` throws, the
   * promise rejects with that error:
   *
   * ```ts
   * await store.waitCondition(condition, { timeoutMillis: 5000, onTimeout: () => { ... } });
   * ```
   *
   * This method is useful in tests, and it returns the action which changed
   * the store state into the condition, in case you need it:
   *
   * ```typescript
   * let action = await store.waitCondition((state) => state.name == "Bill", { timeoutMillis: 1000 });
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
   * // Dispatch actions and wait for the state change:
   * expect(store.state.user.isLoggedIn).toBe(false);
   * dispatch(new LogInUser("Mary"));
   * await store.waitCondition((state) => state.user.isLoggedIn, { timeoutMillis: 1000 });
   * expect(store.state.user.name).toBe("Mary");
   * ```
   *
   * If the condition throws, the returned promise rejects with that error, and the wait ends.
   * The action whose state change ran the condition is not affected: it still completes
   * normally, and `dispatch` doesn't throw.
   *
   * See also:
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitAllActions` - Waits until the given actions are NOT in progress, or no actions are in progress.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   */
  async waitCondition(
    condition: (state: St) => boolean,
    {
      timeoutMillis,
      onTimeout,
    }: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): Promise<KissAction<St> | null> {

    // If the condition is already met, return immediately.
    // Return `null` because there was no trigger action that changed the state into the condition.
    if (condition(this._state)) return null;
    // Otherwise, create a Promise that resolves when the condition is met.
    else {
      return new Promise((resolve, reject) => {
        let cancelTimer = () => {};

        const entry = {
          check: condition,
          resolve: (triggerAction: KissAction<St>) => {
            // The condition was met, so the timeout is no longer needed.
            cancelTimer();
            resolve(triggerAction);
          },
          reject: (error: unknown) => {
            cancelTimer();
            reject(error);
          },
        };
        this._waitConditions.push(entry);

        if (timeoutMillis > 0) {
          cancelTimer = _setLongTimeout(() => {
            // Stop checking the condition, since nobody is waiting for it anymore.
            this._waitConditions = this._waitConditions.filter(c => c !== entry);
            _settleTimeout(timeoutMillis, onTimeout, () => resolve(null), reject);
          }, timeoutMillis);
        }
      });
    }
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
   * let action = await store.waitActionCondition((actionsInProgress, triggerAction) => { ... });
   * ```
   *
   * Note: Each time the condition is checked, it gets a new copy of the actions in progress.
   * Changing that set doesn't affect the store, and the set doesn't change when other actions
   * are later dispatched or finish.
   *
   * You get back the set of the actions being dispatched that met the condition, as well as
   * the action that triggered the condition by being added or removed from the set.
   * The returned set is a copy, taken when the condition was met (or when it timed out),
   * so it doesn't change when other actions are later dispatched or finish. Changing it
   * doesn't affect the store.
   *
   * Note: The condition is only checked when some action is dispatched or finishes dispatching.
   * It's not checked every time action statuses change.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * If the condition throws, the promise rejects with that error, and the wait ends.
   * The action that triggered the check is not affected.
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
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
      // Error message in case the condition was already true when the method was called,
      // and `completeImmediately` is false.
      completedErrorMessage = "Awaited action condition was already true",
      //
      // The maximum time to wait for the condition to be met. The default is 3 seconds.
      // To disable the timeout, make it 0 or -1.
      timeoutMillis = null,
      //
      // Called if the timeout expires. When given, the promise resolves (with no trigger
      // action) instead of rejecting with a `TimeoutException`.
      onTimeout,
    }: {
      completeImmediately?: boolean,
      completedErrorMessage?: string,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {})
    : Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    // The condition gets a new copy each time, so changing it doesn't affect the store.
    return this._waitActionCondition(
      (actions, triggerAction) => condition(new PrintableSet(actions), triggerAction),
      {completeImmediately, completedErrorMessage, timeoutMillis, onTimeout});
  }

  // Same as `waitActionCondition`, but the condition gets the store's own set of actions in
  // progress, instead of a copy. Only for conditions written in Kiss, which don't change the set.
  private async _waitActionCondition(
    condition: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => boolean,
    {
      completeImmediately = false,
      completedErrorMessage = "Awaited action condition was already true",
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      completedErrorMessage?: string,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {})
    : Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    // If the condition is already true when `waitActionCondition` is called,
    if (condition(this._actionsInProgress, null)) {
      // Complete and return the actions in progress and the trigger action.
      if (completeImmediately)
        return Promise.resolve({actions: this.actionsInProgress(), triggerAction: null});
      // else throw an error.
      else
        throw new StoreException(completedErrorMessage + ", and the promise completed immediately.");
    }
    //
    else {
      return new Promise((resolve, reject) => {
        let cancelTimer = () => {};

        const entry = {
          check: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => condition(actions, triggerAction),
          resolve: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => {
            // The condition was met, so the timeout is no longer needed.
            cancelTimer();
            resolve({actions, triggerAction: triggerAction});
          },
          reject: (error: unknown) => {
            cancelTimer();
            reject(error);
          },
        };
        this._waitActionConditions.push(entry);

        timeoutMillis ??= TimeoutException.defaultTimeoutMillis;
        if (timeoutMillis > 0) {
          cancelTimer = _setLongTimeout(() => {
            // Stop checking the condition, since nobody is waiting for it anymore.
            this._waitActionConditions = this._waitActionConditions.filter(c => c !== entry);
            _settleTimeout(timeoutMillis!, onTimeout,
              () => resolve({actions: this.actionsInProgress(), triggerAction: null}), reject);
          }, timeoutMillis);
        }
      });
    }
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatch actions in PARALLEL and wait until no actions are in progress.
   * expect(state.stocks).toEqual(['TSLA']);
   * dispatch(new BuyAction('IBM'));
   * dispatch(new SellAction('TSLA'));
   * await store.waitAllActions([]);
   * expect(state.stocks).toEqual(['IBM']);
   *
   * // Dispatch two actions in PARALLEL and wait for them to finish:
   * expect(state.stocks).toEqual(['TSLA']);
   * let action1 = new BuyAction('IBM');
   * let action2 = new SellAction('TSLA');
   * dispatch(action1);
   * dispatch(action2);
   * await store.waitAllActions([action1, action2]);
   * expect(state.stocks).toEqual(['IBM']);
   *
   * // This could also have been achieved by dispatching two actions in PARALLEL
   * // by using with `dispatchAndWaitAll` to wait for them:
   * expect(state.stocks).toEqual(['TSLA']);
   * await dispatchAndWaitAll([
   *   new BuyAction('IBM'),
   *   new SellAction('TSLA')
   * ]);
   * expect(state.stocks).toEqual(['IBM']);
   *
   * // This could also have been achieved by dispatching two actions in SERIES
   * // by using `dispatchAndWait` to wait for them:
   * expect(state.stocks).toEqual(['TSLA']);
   * await dispatchAndWait(new BuyAction('IBM'));
   * await dispatchAndWait(new SellAction('TSLA'));
   * expect(state.stocks).toEqual(['IBM']);
   * ```
   *
   * See also:
   * `waitCondition` - Waits until the state is in a given condition.
   * `waitActionCondition` - Waits until the actions in progress meet a given condition.
   * `waitActionType` - Waits until an action of a given type is NOT in progress.
   * `waitAllActionTypes` - Waits until all actions of the given type are NOT in progress.
   * `waitAnyActionTypeFinishes` - Waits until ANY action of the given types finish dispatching.
   *
   * You should only use this method in tests.
   */
  async waitAllActions(
    actions: KissAction<St>[] | null,
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {})
    : Promise<{ actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null }> {

    if (!actions || (actions.length === 0)) {
      return this._waitActionCondition(
        (actions) => actions.size === 0,
        {
          completeImmediately: completeImmediately,
          completedErrorMessage: "No actions were in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        },
      )
    } else {
      return this._waitActionCondition((actionsInProgress) => {
          for (const action of actions) {
            if (actionsInProgress.has(action)) {
              return false;
            }
          }
          return true;
        }, {
          completeImmediately: completeImmediately,
          completedErrorMessage: "None of the given actions were in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        },
      );
    }
  }

  /**
   * Returns a promise that completes when an action of the given type in NOT in progress
   * (it's not being dispatched):
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is false (the default), this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true, the promise completes immediately, returns `null`,
   *   and throws no error.
   *
   * - If an action of the given type is in progress, the promise completes when the action
   *   finishes, and returns the action. You can use the returned action to check its `status`:
   *
   *   ```ts
   *   let action = await store.waitActionType(MyAction);
   *   expect(action?.status.originalError).toBeInstanceOf(UserException);
   *   ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches an action and waits until no action of its type is in progress.
   * dispatch(new ChangeNameAction('Bill'));
   * let action = await store.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action?.status.isCompletedOk).toBe(true);
   * expect(store.state.name).toBe('Bill');
   * ```
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
    actionType: {
      new(...args: any[]): KissAction<St>
    },
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<KissAction<St> | null> {
    const {triggerAction} = await this._waitActionCondition(
      (actionsInProgress) => {
        return !(Array.from(actionsInProgress).some((action) => action.constructor === actionType));
      },
      {
        completeImmediately: completeImmediately,
        completedErrorMessage: "No action of the given type was in progress",
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      }
    );

    return triggerAction;
  }

  /**
   * Returns a promise that completes when ALL actions of the given type are NOT in progress
   * (none of them is being dispatched):
   *
   * - If NO action of the given types is currently in progress when the method is called,
   *   and `completeImmediately` is false (the default), this method will throw an error.
   *
   * - If NO action of the given type is currently in progress when the method is called,
   *   and `completeImmediately` is true, the promise completes immediately and throws no error.
   *
   * - If any action of the given types is in progress, the promise completes only when
   *   no action of the given types is in progress anymore.
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Dispatches two actions in PARALLEL and wait for their TYPES:
   * expect(store.state.portfolio).toEqual(['TSLA']);
   * dispatch(new BuyAction('IBM'));
   * dispatch(new SellAction('TSLA'));
   * await store.waitAllActionTypes([BuyAction, SellAction]);
   * expect(store.state.portfolio).toEqual(['IBM']);
   * ```
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
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    {
      completeImmediately = false,
      timeoutMillis = null,
      onTimeout,
    }: {
      completeImmediately?: boolean,
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}): Promise<void> {

    if (actionTypes.length === 0) {
      await this._waitActionCondition(
        (actions) => actions.size === 0,
        {
          completeImmediately: completeImmediately,
          completedErrorMessage: "No actions are in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        }
      );
    } else {
      await this._waitActionCondition(
        (actionsInProgress) => {
          for (const actionType of actionTypes) {
            if (Array.from(actionsInProgress).some(action => action.constructor === actionType)) return false;
          }
          return true;
        },
        {
          completeImmediately: completeImmediately,
          completedErrorMessage: "No action of the given types was in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        }
      );
    }
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
   * dispatch(new StartAction());
   * let action = await store.waitAnyActionTypeFinishes([MyFinalAction]);
   * expect(action.status.originalError).toBeInstanceOf(UserException);
   * ```
   *
   * Timeout: If the condition is not met in `timeoutMillis` milliseconds, the promise rejects
   * with a `TimeoutException`, and the condition stops being checked. The default is 3 seconds,
   * which is shorter than the default test timeout of Jest and Vitest (5 seconds). You can change
   * it globally with `TimeoutException.defaultTimeoutMillis`.
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1, or `Infinity`).
   * To handle the timeout without an error, pass an `onTimeout` callback. If the timeout
   * expires, `onTimeout` is called, and the promise resolves with no trigger action (`null`),
   * instead of rejecting. If `onTimeout` throws, the promise rejects with that error.
   *
   * Examples:
   *
   * ```ts
   * // Wait until some action of the given types is dispatched.
   * dispatch(new ProcessStocksAction());
   * let action = await store.waitAnyActionTypeFinishes([BuyAction, SellAction]);
   * expect(store.state.portfolio.includes('IBM')).toBe(true);
   * ```
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
    options?: { timeoutMillis?: number | null, onTimeout?: undefined }
  ): Promise<KissAction<St>>;
  waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    options: { timeoutMillis?: number | null, onTimeout?: () => void }
  ): Promise<KissAction<St> | null>;
  async waitAnyActionTypeFinishes(
    actionTypes: { new(...args: any[]): KissAction<St> }[],
    {
      timeoutMillis = null,
      onTimeout,
    }: {
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}
  ): Promise<KissAction<St> | null> {

    const {triggerAction} = await this._waitActionCondition(
      //
      (actionsInProgress, triggerAction) => {

        // If the triggerAction is one of the actionTypes,
        if ((triggerAction !== null) && actionTypes.includes(triggerAction.constructor as any)) {
          // If the actions in progress do not contain the triggerAction, then the triggerAction has finished.
          // Otherwise, the triggerAction has just been dispatched, which is not what we want.
          const isFinished = !Array.from(actionsInProgress).includes(triggerAction);
          return isFinished;
        }
        return false;
      },
      {
        completedErrorMessage: "Assertion error",
        timeoutMillis: timeoutMillis,
        onTimeout: onTimeout,
      }
    );

    // Only null when it timed out and `onTimeout` was given.
    // Otherwise, the condition is only met when an action finishes.
    return triggerAction;
  }

  /**
   * Returns a copy of the set of the actions in progress.
   *
   * Each call returns a new copy. It doesn't change when actions are later dispatched or
   * finish, and changing it doesn't affect the store.
   *
   * For debug purposes, the `toString` method of the returned set will
   * call `KissAction.toString()` for all actions.
   */
  actionsInProgress(): Set<KissAction<St>> {
    return new PrintableSet(this._actionsInProgress);
  }

  /**
   * Waits until the store state meets a certain condition, and then dispatches an action.
   * If the condition is already true, the action is dispatched right away, before `dispatchWhen`
   * returns. Otherwise, it is dispatched synchronously, right after the state change that meets
   * the condition, so no other action can change the state in between.
   * If the same state change meets the condition of several `dispatchWhen`, their actions are
   * dispatched one after the other, and each condition is checked again right before its
   * action is dispatched. If an earlier action made it false, it keeps waiting.
   *
   * ```ts
   * store.dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
   * ```
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
   * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
   * timeout is logged with `Store.log()`. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1, or `Infinity`), but note that while it waits, the condition runs on every state change.
   * A `logOut()` cancels the `dispatchWhen`s that are still waiting: their action is not
   * dispatched, and their `onTimeout` is not called.
   *
   * ```ts
   * store.dispatchWhen(
   *   new BuyStock('IBM'),
   *   (state) => state.stocks.getPrice('IBM') >= 100,
   *   { timeoutMillis: 60 * 1000, onTimeout: () => console.log('IBM never reached 100.') },
   * );
   * ```
   *
   * See also:
   * - `this.dispatchWhen` inside actions.
   * - `useDispatchWhen` (or `useStore().dispatchWhen`) in components.
   */
  dispatchWhen(
    action: KissAction<St>,
    condition: (state: St) => boolean,
    {
      timeoutMillis,
      onTimeout,
    }: {
      timeoutMillis: number,
      onTimeout?: () => void
    }
  ): void {
    // Only happens if the condition or `onTimeout` throws. Log it, since nobody awaits `dispatchWhen`.
    const logFailure = (error: unknown) =>
      Store.log(`dispatchWhen failed, and did not dispatch ${action}: ${error}`);

    // Unlike `waitCondition`, this doesn't use a Promise, so that the action is dispatched
    // synchronously: right away if the condition is already met, or right after the state
    // change that meets it. Otherwise, other dispatches could change the state in between.
    let isMet: boolean;
    try {
      isMet = condition(this._state);
    } catch (error) {
      logFailure(error);
      return;
    }

    if (isMet) {
      this._dispatchWhenAction(action);
      return;
    }

    let cancelTimer = () => {};

    // Called by `logOut`. Stops checking the condition, and stops the timer.
    const cancel = () => {
      cancelTimer();
      this._waitConditions = this._waitConditions.filter(c => c !== entry);
      Store._logLazy(() => `The dispatchWhen of ${action} was cancelled by logOut, or by disposing the store.`);
    };

    const fail = (error: unknown) => {
      cancelTimer();
      this._dispatchWhenCancels.delete(cancel);
      logFailure(error);
    };

    // Called by `_registerState` after checking all conditions. Other `dispatchWhen` met by the
    // same state change may have been dispatched before, and changed the state. So the condition
    // is checked again: if it's no longer met, it keeps waiting, with the same timeout.
    const dispatchIfStillMet = () => {
      // Cancelled by `logOut` (possibly dispatched by an earlier action).
      if (!this._dispatchWhenCancels.has(cancel)) return;

      let isStillMet: boolean;
      try {
        isStillMet = condition(this._state);
      } catch (error) {
        fail(error);
        return;
      }

      if (isStillMet) {
        cancelTimer();
        this._dispatchWhenCancels.delete(cancel);
        this._dispatchWhenAction(action);
      } else this._waitConditions.push(entry);
    };

    const entry = {
      check: condition,
      // The condition was removed from `_waitConditions`, but it's still waiting until
      // `dispatchIfStillMet` is called.
      resolve: () => this._dispatchWhenQueue.push(dispatchIfStillMet),
      reject: fail,
    };
    this._waitConditions.push(entry);
    this._dispatchWhenCancels.add(cancel);

    if (timeoutMillis > 0) {
      cancelTimer = _setLongTimeout(() => {
        // Stop checking the condition, since the action will not be dispatched anymore.
        this._dispatchWhenCancels.delete(cancel);
        this._waitConditions = this._waitConditions.filter(c => c !== entry);
        try {
          if (onTimeout) onTimeout();
          else Store.log(`dispatchWhen timed out, and did not dispatch ${action}.`);
        } catch (error) {
          logFailure(error);
        }
      }, timeoutMillis);
    }
  }

  // Dispatches an action of `dispatchWhen`. A synchronous error is logged, and doesn't affect
  // the action that changed the state.
  private _dispatchWhenAction(action: KissAction<St>) {
    try {
      this.dispatch(action);
    } catch (error) {
      Store.log(`dispatchWhen failed to dispatch ${action}: ${error}`);
    }
  }
}

class Mocks<St> {
  private mocks: Map<new (...args: any[]) => KissAction<St>, (action: any) => KissAction<St> | null> = new Map();

  add<T extends KissAction<St>>(
    actionType: new (...args: any[]) => T,
    mockFunction: ((action: T) => KissAction<St> | null) | null): void {
    // A `null` mock function means the dispatch is aborted.
    this.mocks.set(actionType, mockFunction ?? (() => null));
  }

  remove(actionType: new (...args: any[]) => KissAction<St>): void {
    this.mocks.delete(actionType);
  }

  clear(): void {
    this.mocks.clear();
  }

  get<T extends KissAction<St>>(
    actionType: new (...args: any[]) => T): ((action: T) => KissAction<St> | null) | undefined {
    return this.mocks.get(actionType);
  }
}

export type ShowUserException = (exception: UserException, count: number, next: () => void) => void;

/**
 * A plain `Set` whose `toString` lists its elements (for actions, calling `KissAction.toString()`),
 * instead of printing `[object Set]`. Used for the copies of the actions in progress.
 */
class PrintableSet<T> extends Set<T> {
  toString() {
    return Array.from(this).toString();
  }
}

/**
 * Like `setTimeout`, but also works for delays larger than `setTimeout` accepts (about 24.8
 * days), by chaining timers. A delay of `Infinity` never fires. Returns a function that cancels
 * the timeout.
 */
function _setLongTimeout(callback: () => void, millis: number): () => void {
  if (millis === Infinity) return () => {};

  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (remaining: number) => {
    const delay = Math.min(remaining, MAX_TIMEOUT_MILLIS);
    timer = setTimeout(() => {
      if (remaining > delay) schedule(remaining - delay);
      else callback();
    }, delay);
  };

  schedule(millis);
  return () => clearTimeout(timer);
}

/**
 * Called when a wait times out. If `onTimeout` was given, calls it and resolves the wait.
 * Otherwise, rejects the wait with a `TimeoutException`. If `onTimeout` throws, rejects
 * the wait with that error.
 */
function _settleTimeout(
  timeoutMillis: number,
  onTimeout: (() => void) | undefined,
  resolve: () => void,
  reject: (error: any) => void,
) {
  if (onTimeout === undefined) {
    reject(new TimeoutException(`Timeout exceeded: ${timeoutMillis} milliseconds.`));
  } else {
    try {
      onTimeout();
      resolve();
    } catch (error) {
      reject(error);
    }
  }
}

// Adds the explicit resource management methods to the store (see the `Store` interface
// above), if the runtime has the symbols. Older runtimes don't, and `using` can't be used with
// them anyway.
if (typeof Symbol.dispose === 'symbol') {
  Store.prototype[Symbol.dispose] = function (this: Store<any>): void {
    void this.dispose();
  };
}
if (typeof Symbol.asyncDispose === 'symbol') {
  Store.prototype[Symbol.asyncDispose] = function (this: Store<any>): Promise<void> {
    return this.dispose();
  };
}
