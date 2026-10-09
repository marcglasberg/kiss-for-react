/* eslint-disable kiss-for-react/dispatch-sync-async-action */
/* eslint-disable kiss-for-react/dispatch-same-action-twice */
/* eslint-disable kiss-for-react/dispatch-before-store-ready */
/* eslint-disable kiss-for-react/dispatch-and-wait-unlimited-retries */
/* eslint-disable kiss-for-react/wait-fail-never-matches */
/* eslint-disable kiss-for-react/wait-condition-without-timeout */

// Demonstrates the "Dispatching and waiting" rules of the Kiss ESLint plugin
// (eslint-plugin-kiss-for-react). Each warning is marked with a comment right above the line it
// underlines: the rule name, then what the problem is (in parentheses, when needed), then its
// quick fixes, if any. Each variant of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.

import {
  createStore,
  KissAction,
  Persistor,
  Store,
  useDispatch,
  useDispatchAndWait,
  useDispatchAndWaitAll,
  useDispatchSync,
  useDispatchWhen,
  useIsFailed,
  useIsWaiting,
  useStore,
} from 'kiss-for-react';
import { Action, fetchName, Increment, LoadUser, SaveUser, State, store } from './state';

declare const persistor: Persistor<State>;

/** A sync action. */
class SetName extends Action {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return this.state.copy({ name: this.name });
  }
}

/** A sync action, with an async `before`. */
class SaveCounter extends Action {
  async before() {
    await fetchName();
  }

  reduce() {
    return this.state.copy({ counter: 0 });
  }
}

/**
 * A base action that sets `checkInternet`, so the default `before` of its subclasses is async.
 * Note: `checkInternet` set directly in an action with a sync `reduce` is reported by
 * `dispatch-sync-async-action` too, but `async-feature-in-sync-action` also reports it (see
 * `actions.ts`), so it's not shown here.
 */
abstract class OnlineAction extends Action {
  checkInternet = { dialog: false };
}

class ClearItems extends OnlineAction {
  reduce() {
    return this.state.copy({ items: [] });
  }
}

// =================================================================================================
// dispatch-sync-async-action
// =================================================================================================

function dispatchSyncDemo(action: KissAction<State>) {
  store.dispatchSync(new Increment()); // OK: a sync action.
  store.dispatchSync(new SetName('Mary')); // OK: a sync action.

  // kiss-for-react/dispatch-sync-async-action
  // (`reduce` returns a promise)
  // Fix (suggestion): Will replace `dispatchSync` with `dispatch`.
  // Fix (suggestion): Will replace `dispatchSync` with `dispatchAndWait`.
  store.dispatchSync(new LoadUser());

  // kiss-for-react/dispatch-sync-async-action
  // (`before` returns a promise)
  // Fix (suggestion): Will replace `dispatchSync` with `dispatch`.
  // Fix (suggestion): Will replace `dispatchSync` with `dispatchAndWait`.
  store.dispatchSync(new SaveCounter());

  // kiss-for-react/dispatch-sync-async-action
  // (It sets `checkInternet`, inherited from `OnlineAction`, so its default `before` returns
  // a promise)
  // Fix (suggestion): Will replace `dispatchSync` with `dispatch`.
  // Fix (suggestion): Will replace `dispatchSync` with `dispatchAndWait`.
  store.dispatchSync(new ClearItems());

  const saveUser = new SaveUser();
  // kiss-for-react/dispatch-sync-async-action
  // (The action is in a variable)
  // Fix (suggestion): Will replace `dispatchSync` with `dispatch`.
  // Fix (suggestion): Will replace `dispatchSync` with `dispatchAndWait`.
  store.dispatchSync(saveUser);

  store.dispatchSync(action); // OK: not known if it's sync or async.
  store.dispatch(new LoadUser()); // OK: `dispatch` accepts async actions.
}

class DispatchSyncInAction extends Action {
  reduce() {
    // kiss-for-react/dispatch-sync-async-action
    // (In an action)
    // Fix (suggestion): Will replace `dispatchSync` with `dispatch`.
    // Fix (suggestion): Will replace `dispatchSync` with `dispatchAndWait`.
    this.dispatchSync(new LoadUser());
    return null;
  }
}

function DispatchSyncInComponent() {
  const dispatchSync = useDispatchSync();
  // kiss-for-react/dispatch-sync-async-action
  // (With the function returned by `useDispatchSync`. It has no quick fixes)
  const onLoad = () => dispatchSync(new LoadUser());
  const onReset = () => dispatchSync(new SetName('')); // OK: a sync action.
  return { onLoad, onReset };
}

// =================================================================================================
// dispatch-same-action-twice
// =================================================================================================

async function dispatchSameActionDemo(name: string, isNew: boolean) {
  const loadUser = new LoadUser();
  store.dispatch(loadUser);
  // kiss-for-react/dispatch-same-action-twice
  // (Kiss throws a `StoreException`, since each dispatch needs a new action)
  // Fix (suggestion): Will replace `loadUser` with `new LoadUser()`.
  store.dispatch(loadUser);

  const saveUser = new SaveUser();
  store.dispatch(saveUser);
  // kiss-for-react/dispatch-same-action-twice
  // (Any dispatch method counts, like `dispatchAndWait`)
  // Fix (suggestion): Will replace `saveUser` with `new SaveUser()`.
  await store.dispatchAndWait(saveUser);

  const increment = new Increment();
  store.dispatchSync(increment);
  // kiss-for-react/dispatch-same-action-twice
  // (The actions in the array of `dispatchAll` count too)
  // Fix (suggestion): Will replace `increment` with `new Increment()`.
  store.dispatchAll([increment, new LoadUser()]);

  const setName = new SetName(name);
  store.dispatch(setName);
  if (isNew) {
    const name = 'Guest';
    // kiss-for-react/dispatch-same-action-twice
    // (No quick fix, since `new SetName(name)` would use another `name` here)
    store.dispatch(setName);
    store.dispatch(new SetName(name)); // OK: a new action.
  }

  store.dispatch(new LoadUser()); // OK: a new action.
  store.dispatch(new LoadUser()); // OK: a new action.
}

function dispatchSameActionOkDemo(isNew: boolean) {
  const loadUser = new LoadUser();
  if (isNew) store.dispatch(loadUser); // OK: only one of the branches runs.
  else store.dispatch(loadUser); // OK

  const saveUser = new SaveUser();
  try {
    store.dispatch(saveUser); // OK: the `catch` only runs if the `try` fails.
  } catch (error) {
    store.dispatch(saveUser); // OK
  }

  const increment = new Increment();
  if (isNew) {
    store.dispatch(increment); // OK: it returns right after.
    return;
  }
  store.dispatch(increment); // OK
}

class DispatchSameActionInAction extends Action {
  reduce() {
    const increment = new Increment();
    this.dispatch(increment);
    // kiss-for-react/dispatch-same-action-twice
    // (In an action)
    // Fix (suggestion): Will replace `increment` with `new Increment()`.
    this.dispatch(increment);
    return null;
  }
}

function DispatchSameActionInComponent() {
  const store = useStore();
  const onLoad = () => {
    const loadUser = new LoadUser();
    store.dispatch(loadUser);
    // kiss-for-react/dispatch-same-action-twice
    // (With the store returned by `useStore`)
    // Fix (suggestion): Will replace `loadUser` with `new LoadUser()`.
    store.dispatch(loadUser);
  };
  const dispatch = useDispatch();
  const onSave = () => {
    const saveUser = new SaveUser();
    dispatch(saveUser);
    // kiss-for-react/dispatch-same-action-twice
    // (With the function returned by `useDispatch`)
    // Fix (suggestion): Will replace `saveUser` with `new SaveUser()`.
    dispatch(saveUser);
  };
  return { onLoad, onSave };
}

// =================================================================================================
// dispatch-before-store-ready
// =================================================================================================

// A store with a persistor, created at the top level of the module.
const persistedStore = createStore<State>({ initialState: State.initialState, persistor });

// kiss-for-react/dispatch-before-store-ready
// (The store is still reading the persisted state, so Kiss throws a `StoreException`)
// Fix (suggestion): Will add `await persistedStore.ready();` before the dispatch.
persistedStore.dispatch(new LoadUser());

await persistedStore.ready();
persistedStore.dispatch(new LoadUser()); // OK: after waiting for the store.

async function startApp() {
  const store = createStore<State>({ initialState: State.initialState, persistor });

  // kiss-for-react/dispatch-before-store-ready
  // (In an async function)
  // Fix (suggestion): Will add `await store.ready();` before the dispatch.
  store.dispatch(new LoadUser());

  // kiss-for-react/dispatch-before-store-ready
  // (Any dispatch method counts, like `dispatchAll`)
  // Fix (suggestion): Will add `await store.ready();` before the dispatch.
  store.dispatchAll([new SaveUser(), new Increment()]);

  await store.ready();
  store.dispatch(new LoadUser()); // OK: after waiting for the store.
}

function startAppWithoutAsync() {
  const store = new Store<State>({ initialState: State.initialState, persistor });

  // kiss-for-react/dispatch-before-store-ready
  // (No quick fix, since the function is not async, so it can't `await`)
  store.dispatch(new LoadUser());

  // OK: inside a callback, which is not checked.
  store.ready().then(() => store.dispatch(new LoadUser()));
}

async function startAppWithPromiseAll() {
  const store = createStore<State>({ initialState: State.initialState, persistor });
  await Promise.all([store.ready(), fetchName()]);
  store.dispatch(new LoadUser()); // OK: `Promise.all` waits for the store too.
}

function startAppWithoutPersistor() {
  const store = createStore<State>({ initialState: State.initialState });
  store.dispatch(new LoadUser()); // OK: no persistor, so the store is ready right away.
}

// =================================================================================================
// dispatch-and-wait-unlimited-retries
// =================================================================================================

/** Retries forever, with `maxRetries: -1`. */
class LoadNameForever extends Action {
  retry = { maxRetries: -1 };
  nonReentrant = true;

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

/** Retries forever, with `unlimitedRetries: true`. */
class SaveNameForever extends Action {
  retry = { unlimitedRetries: true };
  nonReentrant = true;

  async reduce() {
    await fetchName();
    return null;
  }
}

/** A base action that retries forever. */
abstract class RetryForeverAction extends Action {
  retry = { maxRetries: -1 };
  nonReentrant = true;
}

class LoadItems extends RetryForeverAction {
  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ items: [name] });
  }
}

/** Retries at most 10 times. */
class LoadNameTenTimes extends Action {
  retry = { maxRetries: 10 };
  nonReentrant = true;

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

async function unlimitedRetriesDemo() {
  // kiss-for-react/dispatch-and-wait-unlimited-retries
  // (`maxRetries: -1`. The promise never resolves while the action keeps failing)
  await store.dispatchAndWait(new LoadNameForever());

  // kiss-for-react/dispatch-and-wait-unlimited-retries
  // (`unlimitedRetries: true`)
  await store.dispatchAndWait(new SaveNameForever());

  // kiss-for-react/dispatch-and-wait-unlimited-retries
  // (The `retry` is inherited from `RetryForeverAction`)
  await store.dispatchAndWait(new LoadItems());

  const loadName = new LoadNameForever();
  // kiss-for-react/dispatch-and-wait-unlimited-retries
  // (The action is in a variable)
  await store.dispatchAndWait(loadName);

  await store.dispatchAndWaitAll([
    new LoadUser(), // OK: doesn't retry.
    // kiss-for-react/dispatch-and-wait-unlimited-retries
    // (In the array of `dispatchAndWaitAll`)
    new LoadNameForever(),
  ]);

  store.dispatch(new LoadNameForever()); // OK: doesn't wait.
  await store.dispatchAndWait(new LoadNameTenTimes()); // OK: the retries are limited.
}

class WaitsForRetries extends Action {
  async reduce() {
    // kiss-for-react/dispatch-and-wait-unlimited-retries
    // (In an action)
    await this.dispatchAndWait(new LoadNameForever());
    return null;
  }
}

function WaitsForRetriesInComponent() {
  const dispatchAndWait = useDispatchAndWait();
  const dispatchAndWaitAll = useDispatchAndWaitAll();
  const onLoad = async () => {
    // kiss-for-react/dispatch-and-wait-unlimited-retries
    // (With the function returned by `useDispatchAndWait`)
    await dispatchAndWait(new LoadNameForever());

    // kiss-for-react/dispatch-and-wait-unlimited-retries
    // (With the function returned by `useDispatchAndWaitAll`)
    await dispatchAndWaitAll([new LoadItems()]);
  };
  return { onLoad };
}

// =================================================================================================
// wait-fail-never-matches
// =================================================================================================

/** A sync action, with a subclass. */
class SetCounter extends Action {
  constructor(readonly counter: number) {
    super();
  }

  reduce() {
    return this.state.copy({ counter: this.counter });
  }
}

/** A subclass of `SetCounter`. */
class ResetCounter extends SetCounter {
  constructor() {
    super(0);
  }
}

function waitFailNeverMatchesDemo() {
  // kiss-for-react/wait-fail-never-matches
  // (`SetName` is sync, so this is always `false`. A sync action finishes during its dispatch,
  // before anything can wait for it)
  const isSettingName = store.isWaiting(SetName);

  const isLoading = store.isWaiting(LoadUser); // OK: an async action.
  const isFailed = store.isFailed(SetName); // OK: a sync action can fail.
  const isRunning = store.isWaiting(Action); // OK: an abstract class matches its subclasses.
  const isSettingCounter = store.isWaiting(SetCounter); // OK: it has subclasses.
  // Also OK: sync actions that override `wrapReduce`, or turn on `retry`, since they may be
  // async. And `isWaiting` in tests (see `user.test.ts`).
  return { isSettingName, isLoading, isFailed, isRunning, isSettingCounter, ResetCounter };
}

function WaitFailNeverMatchesInComponent() {
  // kiss-for-react/wait-fail-never-matches
  // (In a component, with `useIsWaiting`)
  const isSettingName = useIsWaiting(SetName);

  const isLoading = useIsWaiting(LoadUser); // OK: an async action.
  const isFailed = useIsFailed(SetName); // OK: a sync action can fail.
  return { isSettingName, isLoading, isFailed };
}

// =================================================================================================
// wait-condition-without-timeout
// =================================================================================================

async function waitConditionDemo() {
  await store.waitCondition(
    (state) => state.counter > 10,
    // kiss-for-react/wait-condition-without-timeout
    // (`0` means no timeout. The condition runs on every state change, and it can't be
    // cancelled, so the wait may never end)
    { timeoutMillis: 0 },
  );

  store.dispatchWhen(
    new LoadUser(),
    (state) => state.name === '',
    // kiss-for-react/wait-condition-without-timeout
    // (A negative number also means no timeout)
    { timeoutMillis: -1 },
  );

  await store.waitCondition((state) => state.counter > 10, { timeoutMillis: 60_000 }); // OK
  store.dispatchWhen(new LoadUser(), (state) => state.name === '', { timeoutMillis: 5000 }); // OK
}

class WaitConditionInAction extends Action {
  async reduce() {
    await this.waitCondition(
      (state) => state.name !== '',
      // kiss-for-react/wait-condition-without-timeout
      // (In an action)
      { timeoutMillis: 0 },
    );
    return null;
  }
}

function WaitConditionInComponent() {
  const dispatchWhen = useDispatchWhen();
  const store = useStore();
  const onBuy = () => {
    dispatchWhen(
      new LoadUser(),
      (state: State) => state.counter > 0,
      // kiss-for-react/wait-condition-without-timeout
      // (With the function returned by `useDispatchWhen`)
      { timeoutMillis: 0 },
    );
    store.dispatchWhen(
      new LoadUser(),
      (state: State) => state.counter > 0,
      // kiss-for-react/wait-condition-without-timeout
      // (With the store returned by `useStore`)
      { timeoutMillis: 0 },
    );
  };
  return { onBuy };
}
