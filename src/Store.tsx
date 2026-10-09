import React, { createContext, useMemo, useState } from 'react';
import { UserException } from './UserException';
import { PersistAction, Persistor } from './Persistor';
import {
  ActionStatus,
  AsyncReducer,
  AsyncReducerResult,
  KissAction,
  ReduxReducer,
  RetryOptions
} from './KissAction';
import { ProcessPersistence } from './ProcessPersistence';
import { StoreException, TimeoutException } from './StoreException';
import { UnmodifiableSetView } from "./UnmodifiableSetView";

interface ConstructorParams<St> {

  /**
   * The initial state of the app.
   */
  initialState: St;

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
   * Global function to wrap errors.
   *
   * This `globalWrapError` will be given all errors thrown in your actions, including those
   * of type `UserException`. If and action already has a `wrapError` method, that method will
   * be called first, and then the `globalWrapError` will be called with the result.
   *
   * A common use case for this is to have a global place to convert some exceptions into
   * `UserException`s. For example, Firebase may throw some `PlatformExceptions` in response to
   * a bad connection to the server. In this case, you may want to show the user a dialog
   * explaining that the connection is bad, which you can do by converting it to a `UserException`.
   * While this could also be done in the action's `wrapError`, you'd have to add it to all
   * actions that use Firebase.
   *
   * IMPORTANT: If instead of RETURNING an error you throw an error inside the `globalWrapError`
   * function, Kiss will catch this error and use it instead the original error. In other
   * words, returning an error or throwing an error works the same way. But it's recommended that
   * you return the error instead of throwing it anyway.
   *
   * Note: Don't use the `globalWrapError` to log errors, as you should prefer doing that
   * in the `errorObserver`.
   */
  globalWrapError?: (error: any) => any;

  /**
   * An `actionObserver` can be set during the `Store` creation.
   * It's called whenever actions are dispatched, and also when they finish.
   * The action and the dispatch-count are available, as well as the `ini` parameter:
   * If `ini` is true, this is right before the action is dispatched.
   * If `ini` is false, this is right after the action finishes.
   *
   * The `actionObserver` is a good place to log which actions are dispatched by your application.
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
   * the `globalWrapError()`.
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
   * An `errorObserver` can be set during the `Store` creation.
   * This will be given all errors that survive the action's `wrapError` and the `globalWrapError`,
   * including those of type `UserException`.
   *
   * You also get the `action` and a reference to the `store`. IMPORTANT: Don't use the store to
   * dispatch any actions, as this may have unpredictable results.
   *
   * The `errorObserver` is the ideal place to log errors, as you have all the information you may
   * need, including the `action` that dispatched the error, which you can use to log the action
   * name, as well as any action properties you may find interesting.
   *
   * After you log the error, you may then return `true` to let the error throw,
   * or `false` to swallow it.
   *
   * For example, if you want to disable all errors in production, but log them;
   * and you want to throw all errors during development and tests, this is how you can do it:
   *
   * ```
   * errorObserver: (error, action) => {
   *
   *    // In development, we throw the error so that we can see it in the emulator/console.
   *    if (inDevelopment() || inTests() || (error instanceof UserException)) return true;
   *
   *    // In production, we log the error, and swallow it.
   *    else {
   *       Logger.error(`Got ${error} in action ${action}.`);
   *       return false;
   *       }
   * }
   * ```
   *
   * The `errorObserver` is also given the errors of the `Persistor` (errors thrown by
   * `persistDifference` after the persistor's `wrapError`, errors thrown while reading the
   * persisted state, and errors added with `Persistor.addError`). For those errors the `action`
   * is `null`. Since there is no `dispatch` call to throw them to, returning `true` will log
   * them with `Store.log()`, and returning `false` will swallow them. Note persistence errors of
   * type `UserException` are always shown to the user, before the `errorObserver` is called.
   *
   * Note: Declared as a method so that observers typed with a non-null `action` still compile.
   */
  errorObserver?(error: any, action: KissAction<St> | null, store: Store<St>): boolean;
}

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

class RefState<St, T> {
  selectorAndValueAndSetValue: [(state: St) => T, T, React.Dispatch<React.SetStateAction<T>>];

  constructor(selectorAndValueAndSetValue: [(state: St) => T, T, React.Dispatch<React.SetStateAction<T>>]) {
    this.selectorAndValueAndSetValue = selectorAndValueAndSetValue;
  }
}

class RefStore<St, T> {
  selectorAndValueAndSetValue: [(store: Store<St>) => T, T, React.Dispatch<React.SetStateAction<T>>];

  constructor(selectorAndValueAndSetValue: [(store: Store<St>) => T, T, React.Dispatch<React.SetStateAction<T>>]) {
    this.selectorAndValueAndSetValue = selectorAndValueAndSetValue;
  }
}

/**
 * The store holds the state of the application and allows the state to be updated
 * by dispatching actions. The store is also responsible for showing user exceptions
 * to the user, persisting the state to the local device disk, processing wait states
 * to show spinners while async operations are in progress, and more.
 *
 * You can create a store with `const store = createStore()` or `const store = new Store()`.
 */
export class Store<St> {

  public _refStateHooks: Set<React.RefObject<RefState<St, any> | undefined>> = new Set();
  public _refStoreHooks: Set<React.RefObject<RefStore<St, any> | undefined>> = new Set();

  // Rebuilds components because of STATE changes.
  //
  // We save in the ref:
  // - The selector
  // - The currently selected value
  // - The setValue function
  //
  // Whenever the state changes, the store will:
  // 1. Retrieve all refs
  // 2. Apply each selector to the current state to calculate the selected value.
  // 3. And compare the selected value with the last selected value.
  // 4. If it changed, it calls setValue.
  private _rebuildFromStateHooks() {
    this._refStateHooks.forEach((hookRef) => {
      if (hookRef.current) {
        const [selector, currentValue, setValue] = hookRef.current.selectorAndValueAndSetValue;
        let newSelectedValue;
        try {
          newSelectedValue = selector(this._state);
        } catch {
          // The selector threw, probably because the component is a "zombie child" that will be
          // unmounted by its parent. Re-render it instead of failing the action: when rendering,
          // the selector runs again with the latest props, and any error goes to React.
          setValue(currentValue);
          return;
        }
        if (newSelectedValue !== currentValue) {
          setValue(newSelectedValue);
          hookRef.current.selectorAndValueAndSetValue[1] = newSelectedValue; // Update the current value in the ref
        }
      }
    });
  }

  /// Rebuilds components because of `isWaiting`, `isFailed`, `exceptionFor` and `clearExceptionFor`.
  //
  // We save in the ref:
  // - The selector
  // - The currently selected value
  // - The setValue function
  //
  // Whenever the store method results changes, the store will:
  // 1. Retrieve all refs
  // 2. Apply each selector to the current store to calculate the selected value.
  // 3. And compare the selected value with the last selected value.
  // 4. If it changed, it calls setValue.
  private _rebuildFromStoreHooks() {
    this._refStoreHooks.forEach((hookRef) => {
      if (hookRef.current) {
        const [selector, currentValue, setValue] = hookRef.current.selectorAndValueAndSetValue;
        let newSelectedValue;
        try {
          newSelectedValue = selector(this);
        } catch {
          // The selector threw, probably because the component is a "zombie child" that will be
          // unmounted by its parent. Re-render it instead of failing the action: when rendering,
          // the selector runs again with the latest props, and any error goes to React.
          setValue(currentValue);
          return;
        }
        if (newSelectedValue !== currentValue) {
          setValue(newSelectedValue);
          hookRef.current.selectorAndValueAndSetValue[1] = newSelectedValue; // Update the current value in the ref
        }
      }
    });
  }

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
   * Note this will not stop async actions already  running,
   * but you can wait for them to finish:
   *
   * ```ts
   * await store.waitAllActions(null, {
   *   timeoutMillis: 5000,
   *   completeImmediately: true
   * }).catch((error) => { });
   * ```
   *
   * Set this back to `false` to restart the store accepting new action dispatches.
   */
  public setShutDown(shutDown: boolean) {
    this._shutDown = shutDown;
  }

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
   * Async actions that we may put into `_asyncActionsInProgress`.
   * This helps to know when to rebuild to make `isWaiting` work.
   */
  private readonly _awaitableActions: Set<abstract new (...args: any[]) => KissAction<St>>;

  /**
   * The actions that have failed recently.
   * When an action fails by throwing an `UserException`, it's added to this map
   * (indexed by its action type), and then removed when it's dispatched.
   *
   * Use `isFailed`, `exceptionFor` and `clearExceptionFor` to know if you should display
   * some error message due to an action failure.
   *
   * Note: Throwing an `UserException` can show a modal dialog to the user, and also show the error
   * as a message in the UI. If you don't want to show the dialog you can use the `noDialog`
   * getter in the error message: `throw new UserException('Invalid input').noDialog`.
   */
  private readonly _failedActions: Map<new (...args: any[]) => KissAction<St>, KissAction<St>>;

  /**
   * Async actions that we may put into `_failedActions`.
   * This helps to know when to rebuild to make `isWaiting` work.
   */
  private readonly _actionsWeCanCheckFailed: Set<new (...args: any[]) => KissAction<St>>;

  /**
   * Helps implement the waitCondition method.
   */
  private _waitConditions: Array<{
    check: (state: St) => boolean,
    resolve: (triggerAction: KissAction<St>) => void,
    reject: (error: unknown) => void
  }> = [];

  /**
   * Helps implement the `waitActionCondition` method.
   */
  private _waitActionConditions: Array<{
    check: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => boolean,
    resolve: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => void,
    reject: (error: unknown) => void
  }> = [];

  private readonly _processPersistence: ProcessPersistence<St> | null;
  private _dispatchCount = 0;

  // A function that shows `UserExceptions` to the user, using some UI like a dialog or a toast.
  // This function is passed to the constructor. If not passed, the `UserException` is ignored.
  private readonly _showUserException: ShowUserException;

  private readonly _globalWrapError?: (error: any, action: KissAction<St>) => any;
  private readonly _actionObserver?: (action: KissAction<St>, dispatchCount: number, ini: boolean) => void;
  private readonly _stateObserver?: (action: KissAction<St>, prevState: St, newState: St, error: any, dispatchCount: number) => void;
  private readonly _errorObserver?: (error: any, action: KissAction<St> | null, store: Store<St>) => boolean;

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
   *    Removes remove a mock action from the store. Note you should pass the
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
                showUserException,
                persistor,
                globalWrapError,
                actionObserver,
                stateObserver,
                errorObserver,
                logger,
                logStateChanges,
              }: ConstructorParams<St>
  ) {
    this._state = initialState;
    this._showUserException = showUserException || this._defaultShowUserException;
    this._processPersistence = (persistor === undefined) ? null : new ProcessPersistence(persistor, initialState);
    this._globalWrapError = globalWrapError;
    this._actionObserver = actionObserver;
    this._stateObserver = stateObserver;
    this._errorObserver = errorObserver;
    this.userExceptionsQueue = [];
    this._actionsInProgress = new Set();
    this._awaitableActions = new Set();
    this._failedActions = new Map<new (...args: any[]) => KissAction<St>, KissAction<St>>();
    this._actionsWeCanCheckFailed = new Set();
    Store.log = (logger === null) ? Store._noLogger : (logger || this._defaultLogger);
    this._logStateChanges = logStateChanges ?? true;

    if (this._processPersistence != null) {
      this._processPersistence.onError = (error: any) => this._processPersistorError(error);
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
    this._throwIfNotReady(action);
    if (this._shutDown) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return; // If mocked as null, the action is ignored.

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
   * If the action fails, the error is processed as usual (`wrapError`, `globalWrapError`,
   * `after`, `errorObserver`, etc). If the error is swallowed (a `UserException` when there is
   * no `errorObserver`, or when the `errorObserver` returns `false`), the promise resolves
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
    this._throwIfNotReady(action);
    if (this._shutDown) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return Promise.resolve(new ActionStatus());
    }

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return Promise.resolve(new ActionStatus());

    // 2) If the action wants to abort the dispatch, or is non-reentrant and already running, aborts.
    if (this._mustAbortDispatch(mockedActionOrAction)) return Promise.resolve(new ActionStatus());

    // An action can only be dispatched once. Dispatching it again is a developer error, so we
    // throw synchronously (instead of returning a rejected promise). We must check this before
    // creating the promise, otherwise it would replace the promise of the first dispatch.
    if (mockedActionOrAction.status.isDispatched) this._throwAlreadyDispatched(mockedActionOrAction);

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
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchSync` which dispatches sync actions, and throws if the action is async.
   * - `dispatchAll` which dispatches all given actions in parallel.
   */
  async dispatchAndWaitAll(actions: KissAction<St>[]): Promise<KissAction<St>[]> {
    const promises: Promise<ActionStatus> [] = [];
    for (const action of actions) {
      promises.push(this.dispatchAndWait(action));
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
   * Note Kiss can only know `before()` or `reduce()` is async after calling it. So, when
   * `dispatchSync` throws because of an async action, the async method has already started,
   * and any side effects it has will still happen. Its result is ignored (it never changes the
   * state), and its errors are only logged.
   *
   * See also:
   * - `dispatch` which dispatches both sync and async actions.
   * - `dispatchAndWait` which dispatches both sync and async actions, and returns a Promise.
   * - `dispatchAndWaitAll` which dispatches all given actions, and returns a Promise.
   * - `dispatchAll` which dispatches all given actions in parallel.
   */
  dispatchSync(action: KissAction<St>): void {
    this._throwIfNotReady(action);
    if (this._shutDown) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }

    const mockedActionOrAction = this._mockActionOrNot(action);

    // 1) If mocked as `null`, the action is ignored.
    if (mockedActionOrAction === null) return; // If mocked as null, the action is ignored.

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
    if (pp !== null && !pp.isReady && !pp.isApplyingReadState)
      throw new StoreException(
        `Dispatched ${action} before the store is ready. ` +
        'Wait for store.ready() before dispatching actions.');
  }

  // Dispatching an action that was already dispatched is a developer error, not an action
  // failure: it counts as a dispatch, and throws a `StoreException` right away.
  private _throwAlreadyDispatched(action: KissAction<St>): never {
    this._dispatchCount++;
    Store._logLazy(() => `${this._dispatchCount}) ${action}`);
    throw new StoreException('The action was already dispatched. Please, create a new action each time.');
  }

  // Returns true if the dispatch must be aborted: either `abortDispatch()` returns true, or the
  // action is `nonReentrant` and an action of the same type is already running.
  // Note: It's up to the developer to make sure `abortDispatch` doesn't throw any errors.
  // If it does, the error is logged and swallowed, and the dispatch is aborted.
  private _mustAbortDispatch(action: KissAction<St>): boolean {
    try {
      if (action.abortDispatch()) return true;
      return action.nonReentrant && this.isWaiting(action.constructor as new (...args: any[]) => KissAction<St>);
    } catch (error) {
      Store._logLazy(() => `Method '${action}.abortDispatch()' has thrown an error: ${error}.`);
      return true;
    }
  }

  // Mocks an action to return another action.
  // If it returns null, the action should be ignored by the caller.
  // If no mock is defined, the original action is returned unchanged.
  private _mockActionOrNot(action: KissAction<St>): KissAction<St> | null {

    const mockActionFunction = this.mocks.get(action.constructor as new () => KissAction<St>);

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

    if (this._shutDown) {
      Store._logLazy(() => `Can't dispatch action ${action} because the store is shut down.`);
      return;
    }

    if (action.status.isDispatched) this._throwAlreadyDispatched(action);

    this._dispatchCount++;
    Store._logLazy(() => `${this._dispatchCount}) ${action}`);

    action._changeStatus({isDispatched: true});

    // We inject the store into the store, so that the action can access it as a property.
    action._injectStore(this);

    // The action is dispatched twice. This is the 1st: when the action starts (ini true).
    this._actionObserver?.(action, this._dispatchCount, true);

    // If `record.isRecording`, record the INI state. That's for testing only.
    this._record(action, true, this._state, this._state, null);

    this._calculateIsWaitingIsFailed(action);

    this._wraps(
      action,
      () => this._runFromStart(action, mustBeSync)
    );
  }

  _calculateIsWaitingIsFailed(action: KissAction<St>) {

    // If the action is failable (that is to say, we have once called `isFailed` for this action),
    const failable = this._actionsWeCanCheckFailed.has(action.constructor as new (...args: any[]) => KissAction<St>);

    let theUIHasAlreadyUpdated = false;

    // Dispatch is starting, so we always remove the action from the list of failed actions,
    // even if nobody checked it yet. Otherwise, checking it later would show a stale error.
    const wasInTheList = this._failedActions.delete(action.constructor as new (...args: any[]) => KissAction<St>);

    // Then we notify the UI. Note we don't notify if the action was never checked.
    if (failable && wasInTheList) {
      theUIHasAlreadyUpdated = true;
      this._rebuildFromStoreHooks();
    }

    // Add the action to the list of actions in progress.
    this._actionsInProgress.add(action);

    // The action just entered the set of actions in progress, so we check the wait conditions.
    this._checkAllActionConditions(action);

    // Note: If the UI hasn't updated yet, AND
    // the action is awaitable (that is to say, we have already called `isWaiting` for this action),
    // Note: We use `instanceof`, like `isWaiting` does, so that waiting for a base class
    // also rebuilds when a subclass action starts.
    if (!theUIHasAlreadyUpdated && this._isAwaitable(action)) {
      // Then we notify the UI. Note we don't notify if the action was never checked.
      this._rebuildFromStoreHooks();
    }
  }

  // Returns true if `isWaiting` was already called for the action's type, or for one of its superclasses.
  private _isAwaitable(action: KissAction<St>): boolean {
    for (const type of this._awaitableActions) {
      if (action instanceof type) return true;
    }
    return false;
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
    action._changeStatus({originalError: error});

    // Observe the state with an error here. We use the current state; no new state was applied.
    // This is before the action's `after()` and `wrapError()` and `globalWrapError`.
    this._stateObserver?.(action, this._state, this._state, error, this._dispatchCount);

    this._record(action, false, this._state, this._state, error);

    // Any error may optionally be processed by the `wrapError` method of the action.
    // Usually this is used to wrap the error inside another that better describes the failed
    // action. It's recommended RETURNING the new error, but if `wrapError` throws an error,
    // that will be used too.
    try {
      error = action.wrapError(error);
    } catch (thrownError) {
      error = thrownError;
    }

    if (error !== null) {

      // The default wrap error does nothing (returns all errors unaltered).

      // Any error may optionally be processed by the `globalWrapError` passed to the Store
      // constructor. This is useful to wrap all errors in a common way. It's recommended
      // RETURNING the new error, but if `globalWrapError` throws an error, that will be used too.
      if (this._globalWrapError != null) {
        try {
          error = this._globalWrapError(error, action);
        } catch (thrownError) {
          error = thrownError;
        }
      }

      // To completely disable the error, `wrapError` or `globalWrapError` may return `null`.
      // But if we got an error, we deal with it here.
      if (error !== null) {

        action._changeStatus({wrappedError: error});

        // Memorizes the action that failed. We'll remove it when it's dispatched again.
        this._failedActions.set(action.constructor as new (...args: any[]) => KissAction<St>, action);

        // Memorizes errors of type `UserException` (in the error queue).
        // These errors are usually shown to the user in a modal dialog, and are not logged.
        if (error instanceof UserException) {
          if (error.ifOpenDialog) {
            this._addUserException(error);
            this._openSomeUiToShowUserException();
          }
        }

        // If an error-observer WAS NOT defined in the Store constructor, swallows errors
        // of type `UserExceptions` (which were already shown to the user in some UI)
        // and rethrows all others. This means the `dispatch()` method will throw this error.
        if (!this._errorObserver) {
          if (!(error instanceof UserException)) {
            throw error;
          }
        }
        // However, if as error-observer WAS defined in the Store constructor,
        else {
          // We call the error-observer.
          // - If it returns `true`, the `dispatch()` method will throw this error.
          // - If it returns `false`, the error is swallowed.
          // Note: When the error-observer is defined, we don't make a distinction between
          // `UserExceptions` and other errors, anymore. We let the error-observer do a
          // distinction if it wants by returning true or false depending on the error type.
          const shouldThrow = this._errorObserver(error, action, this);
          if (shouldThrow) throw error;
        }
      }
    }
  }

  private _processWrapsFinally(action: KissAction<St>, failure: { error: any } | null = null) {
    // We run the `after` method of the action.
    const logAfterError = (error: any) =>
      Store._logLazy(() => `The after() method of the action ${action} threw an error: ${error}.
      This error will be ignored, but you should fix this, as after() methods should not throw errors.`);

    try {
      // The `after()` method should be sync, but TypeScript lets it be overridden as `async`.
      // In that case, we catch its rejection, so that it doesn't become an unhandled rejection.
      const result: any = action.after();
      if (result && typeof result.then === 'function') {
        result.then(undefined, logAfterError);
      }
    } catch (error) {
      logAfterError(error);
    } finally {
      action._changeStatus({hasFinishedMethodAfter: true});
    }

    // Remove the wait state for the action in progress.
    // Note: If the state was applied, this was already removed and the UI updated.
    const removed = this._actionsInProgress.delete(action);
    if (removed) {
      this._rebuildFromStoreHooks();

      // Check the wait-conditions after state change. We pass it the trigger-action.
      this._checkAllActionConditions(action);
    }

    // The action is dispatched twice. This is the 2nd: when the action ends (ini false).
    this._actionObserver?.(action, this._dispatchCount, false);

    // This allows us to `let status = await dispatchAndWait(new MyAction())`.
    // If the action failed with an error that was not swallowed, the promise is rejected.
    action._resolvePromise(failure);
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
        checked = condition.check(this.actionsInProgress(), triggerAction);
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
  private _discardAsyncResultOfDispatchSync(action: KissAction<St>, promise: Promise<unknown>, method: string): void {
    promise.catch((error: any) => {
      Store._logLazy(() => `The async '${method}' of ${action.constructor.name}, dispatched with dispatchSync, failed: ${error}`);
    });
  }

  private _runFromStart(action: KissAction<St>, mustBeSync: boolean): boolean {

    // BEFORE

    // 1) Runs the `before` method.
    // It may be sync or async, but it doesn't return anything.
    const beforeResult: void | Promise<void> = action.before();

    // 2) If it's async, wait for the `before` method to finish.
    if (beforeResult instanceof Promise) {
      if (mustBeSync) {
        this._discardAsyncResultOfDispatchSync(action, beforeResult, 'before');
        throw new StoreException(`You called dispatchSync(${action.constructor.name}), but the action's 'before' method returned a Promise.`);
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
      wrapReduce(action.reduce.bind(action))();

    // 4) If the reducer returned null, or if it returned the unaltered state, we simply do nothing.
    if (reduceResult == null || reduceResult === this.state) {
      action._changeStatus({hasFinishedMethodReduce: true});
      this._registerUnchangedState(action);
      return false; // Kept SYNC.
    }
      //
    // 5) If the reducer is ASYNC, we still process the rest of the reducer to generate the new state.
    else if (reduceResult instanceof Promise) {
      if (mustBeSync) {
        this._discardAsyncResultOfDispatchSync(action, reduceResult, 'reduce');
        throw new StoreException(`You called dispatchSync(${action.constructor.name}), but the action's 'reduce' method returned a Promise.`);
      }
      this._runAsyncReduceOnwards(action, reduceResult);
      return true; // Get out of here. Went ASYNC.
    }
      //
    // 6) If the reducer is SYNC, we already have the new state, and we simply must apply it.
    else {
      action._changeStatus({hasFinishedMethodReduce: true});

      if (action.abortReduce(reduceResult)) {
        action._changeStatus({hasFinishedMethodReduce: true});
        this._registerUnchangedState(action);
        return false; // Kept SYNC.
      }

      this._registerState(action, reduceResult);
      return false; // Kept SYNC.
    }
  }

  /**
   * Returns the action's own `wrapReduce`, or, when retry is on, a retry wrapper that calls the
   * action's own `wrapReduce` on each attempt. Never replaces `action.wrapReduce`.
   */
  private _getWrapReduce(action: KissAction<St>): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {
    const userWrapReduce = action.wrapReduce.bind(action);
    return action.ifRetryIsOn ? this._retryWrapReduce(action, userWrapReduce) : userWrapReduce;
  }

  private _retryWrapReduce(
    action: KissAction<St>,
    userWrapReduce: (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St>,
  ): (reduce: () => ReduxReducer<St>) => () => ReduxReducer<St> {

    const retry = (action.retry as RetryOptions);

    if (!retry.on) {
      function _wrapReduceOff(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {
        return userWrapReduce(reduce);
      }

      return _wrapReduceOff;
    }
    //
    else {
      /// Start with the `initialDelay`, and then increase it by `multiplier` each time this is called.
      /// If the delay exceeds `maxDelay`, it will be set to `maxDelay`.
      function nextDelay(retry: RetryOptions): number {
        const _multiplier = retry.multiplier;
        
        retry.currentDelay = (retry.currentDelay == null) //
          ? retry.initialDelay //
          : retry.currentDelay! * _multiplier;

        if (retry.currentDelay! > retry.maxDelay) retry.currentDelay = retry.maxDelay;

        return retry.currentDelay!;
      }

      function _syncRetryError(): StoreException {
        return new StoreException(`Action '${action}' uses retry, but its reducer is SYNC. Retry needs an ASYNC reducer, that returns a Promise<(St) => St>, because a SYNC reducer does not fail in a way that retrying can fix.`);
      }

      function _wrapReduceRetry(reduce: () => ReduxReducer<St>): () => ReduxReducer<St> {

        async function _wrapReduceRetryAsync(): AsyncReducer<St> {

          // A SYNC reducer can't be retried. If it throws synchronously,
          // fail right away with a StoreException, without retrying.
          let newState: any;
          try {
            newState = userWrapReduce(reduce)();
          } catch (error) {
            throw _syncRetryError();
          }

          try {
            if (newState instanceof Promise)
              newState = await newState;
          }
            //
          catch (error) {
            (action.retry as RetryOptions).attempts++;
            const { maxRetries, unlimitedRetries } = action.retry as RetryOptions;
            if (!unlimitedRetries && (maxRetries >= 0) && (action.attempts > maxRetries)) throw error;

            const currentDelay = nextDelay(action.retry as RetryOptions);
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            return _wrapReduceRetry(reduce)() as any;
          }

          return newState;
        }

        return () => _wrapReduceRetryAsync();
      }

      return _wrapReduceRetry;
    }
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
        wrapReduce(action.reduce.bind(action))();

      // 2.3) If the reducer returned null, or if it returned the unaltered state, we simply do nothing.
      if (reduceResult == null || reduceResult === this.state) {
        action._changeStatus({hasFinishedMethodReduce: true});
        this._registerUnchangedState(action);
        return; // Get out of here.
      }
        //
      // 2.4) If the reducer is ASYNC, we still process the rest of the reducer to generate the new state.
      else if (reduceResult instanceof Promise) {
        reduceResult = await reduceResult as AsyncReducerResult<St>;
        action._changeStatus({hasFinishedMethodReduce: true});

        if (reduceResult == null || reduceResult === this.state) {
          this._registerUnchangedState(action);
        }
        //
        else {
          if (action.ifRetryIsOn && !this._isFunction(reduceResult))
            throw new StoreException(`Action '${action}' uses retry, but its reducer is SYNC. Retry needs an ASYNC reducer, that returns a Promise<(St) => St>, because a SYNC reducer does not fail in a way that retrying can fix.`);

          const newAsyncState = reduceResult(this.state);
          if (newAsyncState != null && newAsyncState !== this.state) {

            if (action.abortReduce(newAsyncState)) {
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

        if (action.abortReduce(reduceResult)) {
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

      // 5.2) If the reducer returned null, we simply do nothing.
      if (functionalReduceResult == null) {
        this._registerUnchangedState(action);
        return; // Get out of here.
      }
        //
        // 5.3) If the reducer returned a function `(state: St) => (St | null)`,
      // we still need to run this function to generate the new state.
      else {
        if (action.ifRetryIsOn && !this._isFunction(functionalReduceResult))
          throw new StoreException(`Action '${action}' uses retry, but its reducer is SYNC. Retry needs an ASYNC reducer, that returns a Promise<(St) => St>, because a SYNC reducer does not fail in a way that retrying can fix.`);

        const finalReduceState = functionalReduceResult(this.state);

        if (finalReduceState != null && finalReduceState !== this.state) {

          if (action.abortReduce(finalReduceState)) {
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
    this._stateObserver?.(action, this._state, this._state, null, this._dispatchCount);
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
      this._rebuildFromStateHooks();

      // Observe the state with null error, because the reducer completed normally.
      this._stateObserver?.(action, prevState, newState, null, this._dispatchCount);

      this._record(action, false, prevState, newState, null);

      // ---

      // Remove the wait state for the action in progress.
      // Note: We do this here, before updating the UI.
      const removed = this._actionsInProgress.delete(action);

      // Check the wait-conditions after state change. We pass it the trigger-action.
      if (removed) {
        this._rebuildFromStoreHooks();
        this._checkAllActionConditions(action);
      }

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

  // Processes the errors of the Persistor. They are never thrown, since there is no `dispatch`
  // call to throw them to (and in Node an unhandled rejection would kill the process).
  // - Errors of type `UserException` are shown to the user.
  // - If there is an `errorObserver`, it's called with a `null` action. If it returns
  //   `true`, the error is logged.
  // - If there's no `errorObserver`, errors that are not `UserException` are logged.
  private _processPersistorError(error: any) {
    if ((error instanceof UserException) && error.ifOpenDialog) {
      this._addUserException(error);
      this._openSomeUiToShowUserException();
    }

    let ifLog = !(error instanceof UserException);
    if (this._errorObserver) {
      try {
        ifLog = this._errorObserver(error, null, this);
      } catch (_error) {
        Store.log(`The errorObserver threw an error: ${_error}.`);
      }
    }

    if (ifLog) Store.log(`Persistor error: ${error}`);
  }

  private _addUserException(error: UserException) {
    this.userExceptionsQueue.push(error);
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
   * store.dispatch(new MyAction());
   * if (store.isWaiting(MyAction)) { ... } // Show a spinner
   * ```
   */
  isWaiting<T extends KissAction<St>>(type: abstract new (...args: any[]) => T): boolean {

    this._awaitableActions.add(type);

    for (const action of this._actionsInProgress) {
      if (action instanceof type) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns true if the given action `type` failed with an `UserException`.
   * Note: This method uses the EXACT action type. Subtypes are not considered.
   */
  isFailed<T extends KissAction<any>>(type: { new(...args: any[]): T }): boolean {
    return this.exceptionFor(type) !== null;
  }

  /**
   * Returns the `UserException` of the `type` that failed.
   * Note: This method uses the EXACT type in `type`. Subtypes are not considered.
   */
  exceptionFor<T extends KissAction<St>>(type: {
    new(...args: any[]): T
  }): (UserException | null) {
    this._actionsWeCanCheckFailed.add(type);
    const action = this._failedActions.get(type);
    const error = action?.status.wrappedError;
    return (error instanceof UserException) ? error : null;
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
   */
  clearExceptionFor<T extends KissAction<St>>(type: { new(...args: any[]): T }): void {
    const result = this._failedActions.delete(type);
    if (result) this._rebuildFromStoreHooks();
  }

  /**
   * Function `Store.describeStateChange()` returns a string describing only the differences between
   * two given objects.
   *
   * By default, when `logStateChanges` is set to `true` in the Store constructor, function
   * `describeStateChange` is used together with `Store.log()` to print all state changes to
   * the console. Note you should turn this off in production.
   */
  static describeStateChange(obj1: any, obj2: any, path: string = ''): string {
    // Ensure both parameters are objects
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) {
      return '';
      // Note: This method should not fail.
      // Throw new StoreException(`Type mismatch or one of the objects is null at path: ${path}`);
    }

    let differences = '';
    // Combine keys from both objects
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
      const val1 = obj1[key];
      const val2 = obj2[key];
      const newPath = path === '' ? key : `${path}.${key}`;

      // If both values are objects, recurse
      if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null) {
        differences += Store.describeStateChange(val1, val2, newPath);
      } else {
        // If values are different, log the difference
        if (val1 !== val2) {
          differences += `State ${newPath}: ${val1} → ${val2}; `;
        }
      }
    }
    return differences;
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
   * Throws a `StoreException` if called while the persisted state is still being read at
   * startup (before `store.ready()` resolves). In this case, nothing is changed.
   */
  async logOut({
                  initialState,
                  throttle = 3000,
                  actionsThrottle = 6000,
                }: {
    /** @deprecated Ignored. The store is always `this`. */
    store?: Store<St>,
    initialState: St,
    throttle?: number,
    actionsThrottle?: number,
  }): Promise<void> {
    return this._processPersistence?.logOut({
      store: this, initialState, throttle, actionsThrottle
    });
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
   * When persistAndPausePersistor is called while the persisted state is still being read, or
   * while a persistence process is running, it waits for them to finish. Then, if the current
   * state is not yet persisted, it immediately starts a new persistence process (ignoring
   * Persistor.throttle). The returned promise completes when the current state is persisted.
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
   */
  async saveInitialStateInPersistence(initialState: St): Promise<void> {
    return this._processPersistence?.saveInitialState(initialState);
  }

  /**
   * Asks the Persistor to read the state from the local persistence.
   * Important: If you use this, you MUST put this state into the store.
   * Kiss will assume that's the case, and will not work properly otherwise.
   */
  async readStateFromPersistence(): Promise<St | null> {
    return this._processPersistence?.readState() || null;
  }

  /**
   * Asks the Persistor to delete the saved state from the local persistence.
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
   * (or -1):
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
        let timer: ReturnType<typeof setTimeout> | undefined;

        const entry = {
          check: condition,
          resolve: (triggerAction: KissAction<St>) => {
            // The condition was met, so the timeout is no longer needed.
            clearTimeout(timer);
            resolve(triggerAction);
          },
          reject: (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this._waitConditions.push(entry);

        if (timeoutMillis > 0) {
          timer = setTimeout(() => {
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
   * Note: Your condition function should NOT try and modify the set of actions it got in
   * the `actionsInProgress` parameter. If you do, Kiss will throw an error.
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

    // If the condition is already true when `waitActionCondition` is called,
    if (condition(this.actionsInProgress(), null)) {
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
        let timer: ReturnType<typeof setTimeout> | undefined;

        const entry = {
          check: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => condition(actions, triggerAction),
          resolve: (actions: Set<KissAction<St>>, triggerAction: KissAction<St> | null) => {
            // The condition was met, so the timeout is no longer needed.
            clearTimeout(timer);
            resolve({actions, triggerAction: triggerAction});
          },
          reject: (error: unknown) => {
            clearTimeout(timer);
            reject(error);
          },
        };
        this._waitActionConditions.push(entry);

        timeoutMillis ??= TimeoutException.defaultTimeoutMillis;
        if (timeoutMillis > 0) {
          timer = setTimeout(() => {
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
      return this.waitActionCondition(
        (actions) => actions.size === 0,
        {
          completeImmediately: completeImmediately,
          completedErrorMessage: "No actions were in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        },
      )
    } else {
      return this.waitActionCondition((actionsInProgress) => {
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
   * // Dispatches an action and waits until no action of its type is in progress.
   * dispatch(new ChangeNameAction('Bill'));
   * let action = await store.waitActionType(ChangeNameAction);
   * expect(action instanceof ChangeNameAction).toBe(true);
   * expect(action.status.isCompletedOk).toBe(true);
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
    const {triggerAction} = await this.waitActionCondition(
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
      await this.waitActionCondition(
        (actions) => actions.size === 0,
        {
          completeImmediately: completeImmediately,
          completedErrorMessage: "No actions are in progress",
          timeoutMillis: timeoutMillis,
          onTimeout: onTimeout,
        }
      );
    } else {
      await this.waitActionCondition(
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
   * To wait with NO timeout, pass `{ timeoutMillis: 0 }` (or -1).
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
      timeoutMillis?: number | null,
      onTimeout?: () => void
    } = {}
  ): Promise<KissAction<St> | null> {

    const {triggerAction} = await this.waitActionCondition(
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
   * Returns an unmodifiable set of the actions on progress.
   * For debug purposes, the `toString` method of the returned set will
   * call `KissAction.toString()` for all actions.
   */
  actionsInProgress(): Set<KissAction<St>> {
    return new UnmodifiableSetView(this._actionsInProgress)
  }

  /**
   * Waits until the store state meets a certain condition, and then dispatches an action.
   * If the condition is already true, the action is dispatched right away.
   *
   * ```ts
   * store.dispatchWhen(new BuyStock('IBM'), (state) => state.stocks.getPrice('IBM') >= 100, { timeoutMillis: 0 });
   * ```
   *
   * Timeout: You must always give a `timeoutMillis`, since there is no default. If the condition
   * is not met in `timeoutMillis` milliseconds, the action is NOT dispatched, and the condition
   * stops being checked. In this case, `onTimeout` is called if you provided it. Otherwise, the
   * timeout is logged with `Store.log()`. To wait with NO timeout, pass `{ timeoutMillis: 0 }`
   * (or -1), but note that while it waits, the condition runs on every state change.
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
    let timedOut = false;

    this.waitCondition(condition, {
      timeoutMillis,
      onTimeout: () => {
        timedOut = true;
        if (onTimeout) onTimeout();
        else Store.log(`dispatchWhen timed out, and did not dispatch ${action}.`);
      },
    })
      .then(() => {
        if (!timedOut) this.dispatch(action);
      })
      // Only happens if the condition or `onTimeout` throws. Log it, since nobody awaits `dispatchWhen`.
      .catch(error => Store.log(`dispatchWhen failed, and did not dispatch ${action}: ${error}`));
  }
}

interface StoreProviderProps<St> {
  store: Store<St>;
  children: React.ReactNode;
}

export interface StoreContextType<St> {
  store: Store<St> | null;
}

export const StoreContext = createContext<StoreContextType<any>>({
  store: null
});

export function StoreProvider<St>({store, children}: StoreProviderProps<St>): React.ReactElement {
  const [_store] = useState<Store<St>>(store);
  const storeMemo = useMemo(() => ({ store: _store }), [_store]);
  return (
    <StoreContext.Provider value={storeMemo}>
      {children}
    </StoreContext.Provider>
  );
}

class Mocks<St> {
  private mocks: Map<new (...args: any[]) => KissAction<St>, (action: any) => KissAction<St> | null> = new Map();

  add<T extends KissAction<St>>(
    actionType: new (...args: any[]) => T,
    mockFunction: ((action: T) => KissAction<St> | null) | null): void {
    // A `null` mock function means the dispatch is aborted.
    this.mocks.set(actionType, mockFunction ?? (() => null));
  }

  remove(actionType: new () => KissAction<St>): void {
    this.mocks.delete(actionType);
  }

  clear(): void {
    this.mocks.clear();
  }

  get(actionType: new () => KissAction<St>): ((action: KissAction<St>) => KissAction<St> | null) | undefined {
    return this.mocks.get(actionType);
  }
}

export type ShowUserException = (exception: UserException, count: number, next: () => void) => void;

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
