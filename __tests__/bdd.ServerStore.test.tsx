import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import { Writable } from 'stream';
import { Deferred } from './fixtures/deferred';
import {
  createStore,
  KissAction,
  OptimisticCommand,
  OptimisticSync,
  PersistorDummy,
  Poll,
  Store,
  StoreException,
  StoreProvider,
  useSelect,
  UserException,
} from '../src';
import { delayMillis } from '../src/utils';

// The `server: true` option of `createStore` (see SSR.md): the store that loads the data of a
// request, in server-side rendering. This file runs in the default Node environment, with no
// DOM, as a server does.

reporter(new FeatureFileReporter());

const feature = new Feature('Server store');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

function clientStore(): Store<State> {
  return createStore<State>({ initialState: new State(0), logger });
}

function serverStore(): Store<State> {
  return createStore<State>({ initialState: new State(0), logger, server: true });
}

// Sync polling action that adds 1 to the count. Polls every 50 millis.
class Count extends KissAction<State> {
  pollInterval = 50;

  constructor(readonly poll = Poll.once) { super(); }

  createPollingAction() { return new Count(); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// A polling action whose `poll` field defaults to `Poll.start`, as in the documented pattern
// where dispatching the action starts the polling.
class PollByDefault extends KissAction<State> {
  pollInterval = 50;

  constructor(readonly poll = Poll.start) { super(); }

  createPollingAction() { return new PollByDefault(Poll.once); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// A polling action that forgets to override `createPollingAction()`.
class ForgotCreatePollingAction extends KissAction<State> {
  pollInterval = 50;

  constructor(readonly poll = Poll.start) { super(); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Async action with retry, whose reducer always fails. Counts the runs and the `shouldRetry`
// calls.
class FailWithRetry extends KissAction<State> {
  retry = { initialDelay: 1, maxRetries: 3 };
  runs = 0;
  shouldRetryCalls = 0;

  shouldRetry(_error: unknown, _attempt: number) {
    this.shouldRetryCalls++;
    return true;
  }

  async reduce(): Promise<null> {
    this.runs++;
    await delayMillis(1);
    throw new UserException('Failed');
  }
}

// Sync action with retry, which is a developer error.
class SyncWithRetry extends KissAction<State> {
  retry = { on: true };

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Async action with unlimited retries, whose reducer always fails. Counts the runs and the
// internet checks.
class FailWithUnlimitedRetry extends KissAction<State> {
  unlimitedRetryCheckInternet = { initialDelay: 1, maxDelayNoInternet: 1 };
  runs = 0;
  internetChecks = 0;

  protected hasInternet(): Promise<boolean> {
    this.internetChecks++;
    return Promise.resolve(true);
  }

  async reduce(): Promise<null> {
    this.runs++;
    await delayMillis(1);
    throw new UserException('Failed');
  }
}

// An optimistic command with retry, whose server call always fails. Counts the calls.
class SaveWithRetry extends OptimisticCommand<State, number> {
  retry = { initialDelay: 1, maxRetries: 2 };
  calls = 0;

  optimisticValue() {
    return 10;
  }

  getValueFromState(state: State) {
    return state.count;
  }

  applyValueToState(_state: State, value: number) {
    return new State(value);
  }

  async sendCommandToServer(_value: number): Promise<any> {
    this.calls++;
    await delayMillis(1);
    throw new UserException('Server failed');
  }
}

// Async action, debounced for 200 millis, that adds 1 to the count.
class AddDebounced extends KissAction<State> {
  debounce = 200;

  async reduce() {
    await delayMillis(1);
    return (state: State) => new State(state.count + 1);
  }
}

// Sync action, debounced for 200 millis.
class AddDebouncedSync extends KissAction<State> {
  debounce = 200;

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Action with `checkInternet`, that adds 1 to the count.
class AddCheckInternet extends KissAction<State> {
  checkInternet = { dialog: false };

  async reduce() {
    await delayMillis(1);
    return (state: State) => new State(state.count + 1);
  }
}

// Slow non-reentrant action.
class AddNonReentrant extends KissAction<State> {
  nonReentrant = true;

  async reduce() {
    await delayMillis(30);
    return (state: State) => new State(state.count + 1);
  }
}

// Slow action with `ignoreOld`. The first dispatch is slower than the second.
class AddIgnoreOld extends KissAction<State> {
  ignoreOld = true;

  constructor(readonly millis: number) { super(); }

  async reduce() {
    await delayMillis(this.millis);
    return (state: State) => new State(state.count + 1);
  }
}

// Throttled action.
class AddThrottled extends KissAction<State> {
  throttle = 1000;

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Action with `fresh`.
class AddFresh extends KissAction<State> {
  fresh = 1000;

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Sequential action that appends its name to the trace, after a delay.
class AddSequential extends KissAction<State> {
  sequential = true;

  constructor(readonly name: string, readonly millis: number, readonly trace: string[]) { super(); }

  async reduce() {
    await delayMillis(this.millis);
    this.trace.push(this.name);
    return (state: State) => new State(state.count + 1);
  }
}

// Optimistic sync of the count. Counts the requests.
class SyncCount extends OptimisticSync<State, number> {
  static requests = 0;

  constructor(readonly value: number) { super(); }

  valueToApply() {
    return this.value;
  }

  applyOptimisticValueToState(_state: State, value: number) {
    return new State(value);
  }

  getValueFromState(state: State) {
    return state.count;
  }

  async sendValueToServer(_value: number): Promise<any> {
    SyncCount.requests++;
    await delayMillis(5);
    return null;
  }
}

function Counter() {
  const count = useSelect((state: State) => state.count);
  return <span>count:{count}</span>;
}

Bdd(feature)
  .scenario('A polling action dispatched with Poll.start runs once in a server store, and starts no polling.')
  .given('A server store, and a client store.')
  .and('A polling action that adds 1 to the count every 50 millis.')
  .when('The action is dispatched with Poll.start in both stores, and 180 millis pass.')
  .then('In the server store, the count is 1: the action ran once, and no tick happened.')
  .and('In the client store, the count is more than 1: the action ran, and then the ticks.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    await server.dispatchAndWait(new Count(Poll.start));
    await client.dispatchAndWait(new Count(Poll.start));
    await delayMillis(180);

    expect(server.state.count).toBe(1);
    expect(client.state.count).toBeGreaterThan(1);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('Poll.runNowAndRestart runs once in a server store, Poll.stop does nothing, and Poll.once is unchanged.')
  .given('A server store, and a polling action that adds 1 to the count every 50 millis.')
  .when('The action is dispatched with Poll.runNowAndRestart, then with Poll.stop, then with Poll.once, and 180 millis pass.')
  .then('The count is 2: the runNowAndRestart ran once, the stop did nothing, and the once ran once.')
  .and('No tick happened.')
  .run(async (_) => {
    const server = serverStore();

    await server.dispatchAndWait(new Count(Poll.runNowAndRestart));
    expect(server.state.count).toBe(1);

    const stop = new Count(Poll.stop);
    await server.dispatchAndWait(stop);
    expect(stop.status.isCompletedOk).toBe(true);
    expect(server.state.count).toBe(1);

    await server.dispatchAndWait(new Count(Poll.once));
    expect(server.state.count).toBe(2);

    await delayMillis(180);
    expect(server.state.count).toBe(2);

    await server.dispose();
  });

Bdd(feature)
  .scenario('In a server store, a second dispatch with Poll.start runs the action again, since nothing is "already active".')
  .given('A server store, and a client store.')
  .and('A polling action that adds 1 to the count.')
  .when('The action is dispatched twice with Poll.start, in both stores.')
  .then('In the server store, the count is 2: both dispatches ran the action.')
  .and('In the client store, the count is 1: the second Poll.start found the polling active, and did nothing.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    await server.dispatchAndWait(new Count(Poll.start));
    await server.dispatchAndWait(new Count(Poll.start));
    expect(server.state.count).toBe(2);

    await client.dispatchAndWait(new Count(Poll.start));
    await client.dispatchAndWait(new Count(Poll.start));
    expect(client.state.count).toBe(1);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('A polling action that does not override createPollingAction() still fails in a server store.')
  .given('A server store, and a polling action that forgets to override createPollingAction().')
  .when('The action is dispatched with Poll.start.')
  .then('The dispatch throws a StoreException that says it must override createPollingAction(), as in a client store.')
  .and('The state does not change.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    await expect(server.dispatchAndWait(new ForgotCreatePollingAction())).rejects.toThrow(StoreException);
    await expect(server.dispatchAndWait(new ForgotCreatePollingAction())).rejects.toThrow("doesn't override createPollingAction()");
    expect(server.state.count).toBe(0);

    await expect(client.dispatchAndWait(new ForgotCreatePollingAction())).rejects.toThrow("doesn't override createPollingAction()");
    expect(client.state.count).toBe(0);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('An action with retry runs its reducer once in a server store, and fails right away.')
  .given('A server store, and a client store.')
  .and('An async action with retry (3 retries), whose reducer always fails with a UserException.')
  .when('The action is dispatched in both stores.')
  .then('In the server store, the reducer ran once, the action failed with the UserException, attempts is 0, and shouldRetry was not called.')
  .and('In the client store, the reducer ran 4 times, and attempts is 4.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    const onServer = new FailWithRetry();
    await server.dispatchAndWait(onServer);
    expect(onServer.runs).toBe(1);
    expect(onServer.attempts).toBe(0);
    expect(onServer.shouldRetryCalls).toBe(0);
    expect(onServer.status.isCompletedFailed).toBe(true);
    expect(onServer.status.originalError).toBeInstanceOf(UserException);

    const onClient = new FailWithRetry();
    await client.dispatchAndWait(onClient);
    expect(onClient.runs).toBe(4);
    expect(onClient.attempts).toBe(4);
    expect(onClient.status.originalError).toBeInstanceOf(UserException);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('An action with unlimitedRetryCheckInternet runs its reducer once in a server store, without checking the internet.')
  .given('A server store, and a client store.')
  .and('An async action with unlimitedRetryCheckInternet, whose reducer always fails, and which counts its internet checks.')
  .when('The action is dispatched in both stores.')
  .then('In the server store, the reducer ran once, the internet was not checked, and the action failed with the reducer error.')
  .and('In the client store, the internet was checked, and the reducer ran more than once, until the store was disposed.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    const onServer = new FailWithUnlimitedRetry();
    await server.dispatchAndWait(onServer);
    expect(onServer.runs).toBe(1);
    expect(onServer.internetChecks).toBe(0);
    expect(onServer.status.isCompletedFailed).toBe(true);
    expect(onServer.status.originalError).toBeInstanceOf(UserException);

    const onClient = new FailWithUnlimitedRetry();
    client.dispatch(onClient);
    await delayMillis(60);
    expect(onClient.internetChecks).toBeGreaterThan(1);
    expect(onClient.runs).toBeGreaterThan(1);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('A SYNC action with retry still fails with a StoreException in a server store.')
  .given('A server store, and a SYNC action with retry.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException saying retry needs an ASYNC reducer, as in a client store.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    await expect(server.dispatchAndWait(new SyncWithRetry())).rejects.toThrow('uses retry, but its reducer is SYNC');
    expect(server.state.count).toBe(0);

    await expect(client.dispatchAndWait(new SyncWithRetry())).rejects.toThrow('uses retry, but its reducer is SYNC');
    expect(client.state.count).toBe(0);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('An OptimisticCommand with retry calls sendCommandToServer once in a server store, and rolls back.')
  .given('A server store, and a client store.')
  .and('An OptimisticCommand with retry (2 retries), whose server call always fails.')
  .when('The command is dispatched in both stores.')
  .then('In the server store, the server was called once, and the state was rolled back.')
  .and('In the client store, the server was called 3 times, and the state was rolled back.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    const onServer = new SaveWithRetry();
    await server.dispatchAndWait(onServer);
    expect(onServer.calls).toBe(1);
    expect(onServer.status.isCompletedFailed).toBe(true);
    expect(server.state.count).toBe(0);

    const onClient = new SaveWithRetry();
    await client.dispatchAndWait(onClient);
    expect(onClient.calls).toBe(3);
    expect(client.state.count).toBe(0);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('A debounced action runs its reducer right away in a server store, and still cannot be dispatched with dispatchSync.')
  .given('A server store, and a client store.')
  .and('An action debounced for 200 millis, that adds 1 to the count.')
  .when('The action is dispatched in both stores, with dispatchAndWait.')
  .then('In the server store, it finishes in much less than 200 millis, and the count is 1.')
  .and('In the client store, it takes at least 200 millis.')
  .and('In the server store, dispatchSync still throws a StoreException, since a debounced action is ASYNC.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    const serverStart = Date.now();
    await server.dispatchAndWait(new AddDebounced());
    expect(Date.now() - serverStart).toBeLessThan(100);
    expect(server.state.count).toBe(1);

    const clientStart = Date.now();
    await client.dispatchAndWait(new AddDebounced());
    expect(Date.now() - clientStart).toBeGreaterThanOrEqual(190);
    expect(client.state.count).toBe(1);

    expect(() => server.dispatchSync(new AddDebouncedSync())).toThrow(StoreException);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('The features without timers behave the same in a server store and in a client store.')
  .given('A server store, and a client store.')
  .when('Actions with checkInternet, nonReentrant, ignoreOld, throttle, fresh, sequential and OptimisticSync are dispatched in both.')
  .then('Each feature gives the same result in both stores.')
  .run(async (_) => {
    for (const store of [serverStore(), clientStore()]) {

      // checkInternet: passes (the store counts as online), and the reducer runs.
      await store.dispatchAndWait(new AddCheckInternet());
      expect(store.state.count).toBe(1);

      // nonReentrant: the second dispatch, while the first runs, is aborted.
      const first = new AddNonReentrant();
      const second = new AddNonReentrant();
      store.dispatch(first);
      store.dispatch(second);
      await store.waitAllActions([first, second], { completeImmediately: true });
      expect(first.status.isCompletedOk).toBe(true);
      expect(second.status.isDispatched).toBe(false);
      expect(store.state.count).toBe(2);

      // ignoreOld: the older dispatch, which finishes last, is aborted.
      const older = new AddIgnoreOld(40);
      const newer = new AddIgnoreOld(5);
      store.dispatch(older);
      store.dispatch(newer);
      await store.waitAllActions([older, newer], { completeImmediately: true });
      expect(newer.status.isCompletedOk).toBe(true);
      expect(older.isAborted).toBe(true);
      expect(store.state.count).toBe(3);

      // throttle: the second dispatch, inside the period, is aborted.
      await store.dispatchAndWait(new AddThrottled());
      const throttled = new AddThrottled();
      await store.dispatchAndWait(throttled);
      expect(throttled.status.isDispatched).toBe(false);
      expect(store.state.count).toBe(4);

      // fresh: the second dispatch, inside the period, is aborted.
      await store.dispatchAndWait(new AddFresh());
      const fresh = new AddFresh();
      await store.dispatchAndWait(fresh);
      expect(fresh.status.isDispatched).toBe(false);
      expect(store.state.count).toBe(5);

      // sequential: the actions run in order, even when the first is slower.
      const trace: string[] = [];
      const a = new AddSequential('A', 30, trace);
      const b = new AddSequential('B', 1, trace);
      store.dispatch(a);
      store.dispatch(b);
      await store.waitAllActions([a, b], { completeImmediately: true });
      expect(trace).toEqual(['A', 'B']);
      expect(store.state.count).toBe(7);

      // OptimisticSync: the state changes right away, and one request is sent.
      SyncCount.requests = 0;
      await store.dispatchAndWait(new SyncCount(42));
      expect(store.state.count).toBe(42);
      expect(SyncCount.requests).toBe(1);

      await store.dispose();
    }
  });

Bdd(feature)
  .scenario('A server store must not have a persistor.')
  .given('The server option, and a persistor.')
  .when('A store is created with both.')
  .then('The creation throws a StoreException that says a server store must not have a persistor.')
  .and('A client store with the same persistor is created normally.')
  .run(async (_) => {
    expect(() => createStore<State | null>({
      initialState: new State(0),
      logger,
      server: true,
      persistor: new PersistorDummy<State>(),
    })).toThrow(StoreException);

    expect(() => createStore<State | null>({
      initialState: new State(0),
      logger,
      server: true,
      persistor: new PersistorDummy<State>(),
    })).toThrow('A server store must not have a persistor');

    const client = createStore<State | null>({
      initialState: new State(0),
      logger,
      persistor: new PersistorDummy<State>(),
    });
    await client.ready();
    expect(client.isServer).toBe(false);
    await client.dispose();
  });

Bdd(feature)
  .scenario('A server store never starts the focus and online sources.')
  .given('A server store, and a client store, both with custom focus and online sources that say the app is not focused and offline.')
  .when('isFocused and isOnline are read in both stores.')
  .then('In the server store, the sources were not started, and both values are true.')
  .and('In the client store, the sources were started, and both values are false.')
  .run(async (_) => {
    let serverSourcesStarted = 0;
    const server = createStore<State>({
      initialState: new State(0),
      logger,
      server: true,
      focusSource: (set) => { serverSourcesStarted++; set(false); },
      onlineSource: (set) => { serverSourcesStarted++; set(false); },
    });

    expect(server.isFocused).toBe(true);
    expect(server.isOnline).toBe(true);
    expect(serverSourcesStarted).toBe(0);

    let clientSourcesStarted = 0;
    const client = createStore<State>({
      initialState: new State(0),
      logger,
      focusSource: (set) => { clientSourcesStarted++; set(false); },
      onlineSource: (set) => { clientSourcesStarted++; set(false); },
    });

    expect(client.isFocused).toBe(false);
    expect(client.isOnline).toBe(false);
    expect(clientSourcesStarted).toBe(2);

    await server.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('store.isServer tells if the store was created with the server option.')
  .given('A store created with server: true, a store created with server: false, and a store created without the option.')
  .when('isServer is read.')
  .then('It is true for the first, and false for the other two.')
  .run(async (_) => {
    const server = createStore<State>({ initialState: new State(0), logger, server: true });
    const notServer = createStore<State>({ initialState: new State(0), logger, server: false });
    const client = createStore<State>({ initialState: new State(0), logger });

    expect(server.isServer).toBe(true);
    expect(notServer.isServer).toBe(false);
    expect(client.isServer).toBe(false);

    await server.dispose();
    await notServer.dispose();
    await client.dispose();
  });

Bdd(feature)
  .scenario('Disposing a server store still disposes the props and rejects the pending waits.')
  .given('A server store with a prop that has a dispose function, and a pending waitCondition.')
  .when('The store is disposed.')
  .then('The prop was disposed, and the waitCondition was rejected.')
  .run(async (_) => {
    const server = serverStore();

    let propDisposed = false;
    server.setProp('thing', {}, { dispose: () => { propDisposed = true; } });

    const wait = server.waitCondition((state) => state.count === 99, { timeoutMillis: 10_000 });
    const rejected = wait.then(() => false, () => true);

    await server.dispose();

    expect(propDisposed).toBe(true);
    expect(await rejected).toBe(true);
    expect(server.isDisposed).toBe(true);
  });

Bdd(feature)
  .scenario('A page rendered on the server with an action that polls by default leaves no timer behind.')
  .given('A server store, and an action class whose poll field defaults to Poll.start, as the client dispatches it.')
  .when('The server code dispatches the action to load the data, renders the page with renderToString, and disposes the store.')
  .then('The HTML shows the loaded count.')
  .and('No timer is pending after the render, even before the store is disposed.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const server = serverStore();

      // Dispatching the action as the client does, with its default `Poll.start`.
      await server.dispatchAndWait(new PollByDefault());
      expect(server.state.count).toBe(1);

      const html = renderToString(
        <StoreProvider store={server} serverState={server.state}>
          <Counter />
        </StoreProvider>,
      );
      expect(html).toContain('count:');
      expect(html).toContain('1');

      // No polling cycle was started: nothing is scheduled.
      expect(jest.getTimerCount()).toBe(0);

      await server.dispose();
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('The same polling action, in a client store, still starts the polling, so nothing changed on the client.')
  .given('A client store (no server option), and the action class whose poll field defaults to Poll.start.')
  .when('The action is dispatched, and the polling interval passes 3 times.')
  .then('The count is at least 3: the action ran, and then the ticks.')
  .run(async (_) => {
    const client = clientStore();

    await client.dispatchAndWait(new PollByDefault());
    await delayMillis(180);
    expect(client.state.count).toBeGreaterThanOrEqual(3);

    await client.dispose();
    await delayMillis(60);
    const after = client.state.count;
    await delayMillis(60);
    expect(client.state.count).toBe(after);
  });

// Action that starts a clock, as the client does, but not in a server store.
class StartClock extends KissAction<State> {
  reduce() {
    if (!this.store.isServer) {
      const interval = setInterval(() => {}, 1000);
      this.setProp('clock', interval, { dispose: clearInterval });
    }
    return null;
  }
}

Bdd(feature)
  .scenario('An action reads this.store.isServer to skip client-only work on the server.')
  .given('A server store, and a client store.')
  .and('An action that starts an interval and keeps it in a store prop, unless the store is a server store.')
  .when('The action is dispatched in both stores.')
  .then('The server store has no clock prop, and the client store has one.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    await server.dispatchAndWait(new StartClock());
    expect(server.prop('clock')).toBeUndefined();

    await client.dispatchAndWait(new StartClock());
    expect(client.prop('clock')).toBeDefined();

    await server.dispose();
    await client.dispose();
  });

// Async action with unlimited retries, that adds 1 to the count, in an app that says there is
// no internet.
class LoadOffline extends KissAction<State> {
  unlimitedRetryCheckInternet = { initialDelay: 1, maxDelayNoInternet: 1 };
  runs = 0;
  internetChecks = 0;

  protected hasInternet(): Promise<boolean> {
    this.internetChecks++;
    return Promise.resolve(false);
  }

  async reduce() {
    this.runs++;
    await delayMillis(1);
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('An action with unlimitedRetryCheckInternet runs in a server store even when hasInternet() says there is no internet.')
  .given('A server store, and a client store.')
  .and('An action with unlimitedRetryCheckInternet whose hasInternet() returns false, and whose reducer adds 1 to the count.')
  .when('The action is dispatched in both stores.')
  .then('In the server store, the internet was not checked, the reducer ran once, and the count is 1.')
  .and('In the client store, the internet was checked, the reducer never ran, and the action waits until the store is disposed.')
  .run(async (_) => {
    const server = serverStore();
    const client = clientStore();

    const onServer = new LoadOffline();
    await server.dispatchAndWait(onServer);
    expect(onServer.internetChecks).toBe(0);
    expect(onServer.runs).toBe(1);
    expect(onServer.status.isCompletedOk).toBe(true);
    expect(server.state.count).toBe(1);

    const onClient = new LoadOffline();
    client.dispatch(onClient);
    await delayMillis(40);
    expect(onClient.internetChecks).toBeGreaterThan(1);
    expect(onClient.runs).toBe(0);
    expect(client.state.count).toBe(0);
    expect(client.isWaiting(LoadOffline)).toBe(true);

    await server.dispose();
    await client.dispose();
  });

// Async action with retry, that succeeds on the first try.
class LoadWithRetry extends KissAction<State> {
  retry = { on: true };

  async reduce() {
    await delayMillis(1);
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('An action with retry that succeeds works normally in a server store.')
  .given('A server store, and an action with retry whose reducer succeeds.')
  .when('The action is dispatched.')
  .then('The reducer ran once, the action completed OK, attempts is 0, and the count is 1.')
  .run(async (_) => {
    const server = serverStore();

    const action = new LoadWithRetry();
    await server.dispatchAndWait(action);
    expect(action.status.isCompletedOk).toBe(true);
    expect(action.attempts).toBe(0);
    expect(server.state.count).toBe(1);

    await server.dispose();
  });

// Polling combined with retry, which is a developer error.
class PollAndRetry extends KissAction<State> {
  retry = { on: true };

  constructor(readonly poll = Poll.start) { super(); }

  createPollingAction() { return new PollAndRetry(Poll.once); }

  async reduce() {
    return (state: State) => new State(state.count + 1);
  }
}

// A negative debounce, which is a developer error.
class NegativeDebounce extends KissAction<State> {
  debounce = -1;

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Debounce combined with retry, which is a developer error.
class DebounceAndRetry extends KissAction<State> {
  debounce = 10;
  retry = { on: true };

  async reduce() {
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('The validations of the action features still run in a server store.')
  .given('A server store, and a client store.')
  .and('An action that combines polling with retry, one with a negative debounce, and one that combines debounce with retry.')
  .when('Each action is dispatched in both stores.')
  .then('Each dispatch throws a StoreException, in the server store as in the client store.')
  .and('The state does not change.')
  .run(async (_) => {
    for (const store of [serverStore(), clientStore()]) {
      await expect(store.dispatchAndWait(new PollAndRetry())).rejects.toThrow(StoreException);
      await expect(store.dispatchAndWait(new NegativeDebounce())).rejects.toThrow(StoreException);
      await expect(store.dispatchAndWait(new DebounceAndRetry())).rejects.toThrow(StoreException);
      expect(store.state.count).toBe(0);
      await store.dispose();
    }
  });

/** Streams `element` with `renderToPipeableStream`, and resolves with the HTML when it's done. */
function streamToHtml(element: React.ReactElement): Promise<string> {
  const chunks: string[] = [];
  const finished = new Deferred<string>();
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
    final(callback) {
      finished.resolve(chunks.join(''));
      callback();
    },
  });
  const stream = renderToPipeableStream(element, {
    onAllReady() {
      stream.pipe(sink);
    },
    onError(error) {
      finished.reject(error);
    },
  });
  return finished.promise;
}

Bdd(feature)
  .scenario('A page streamed on the server with an action that polls by default shows the data, and no tick runs after.')
  .given('A server store, and the action class whose poll field defaults to Poll.start.')
  .when('The server code dispatches the action, streams the page with renderToPipeableStream, and 3 polling intervals pass.')
  .then('The HTML has the loaded count.')
  .and('The count is still 1 after the intervals: no polling tick ran.')
  .run(async (_) => {
    const server = serverStore();

    await server.dispatchAndWait(new PollByDefault());
    const html = await streamToHtml(
      <StoreProvider store={server} serverState={server.state}>
        <Counter />
      </StoreProvider>,
    );
    expect(html).toContain('count:');
    expect(html).toContain('1');

    await delayMillis(180);
    expect(server.state.count).toBe(1);

    await server.dispose();
  });
