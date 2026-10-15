import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  AbortDispatchException,
  KissAction,
  Persistor,
  Poll,
  Retry,
  Store,
  StoreProvider,
  useIsStoreReady,
  useSelect,
} from '../src';
import { Deferred } from './fixtures/deferred';

// A server creates one store per request, renders, and discards the store (see the "Server-side
// rendering" section of README.md). This
// file runs in the default Node environment, with no DOM, as a server does, and checks that a
// server store leaves no live timers behind, which would leak in a long-lived Node process.
// Jest's fake timers count the pending timers (`jest.getTimerCount()`).

reporter(new FeatureFileReporter());

const feature = new Feature('Server safety: a per-request store leaves nothing behind');

class State {
  constructor(readonly count: number) {}
}

// Adds 1 to the count, after awaiting a promise (no timer involved).
class LoadAsync extends KissAction<State> {
  async reduce() {
    await Promise.resolve();
    return (state: State) => new State(state.count + 1);
  }
}

// Adds 1 to the count. Keeps running until `finish` resolves.
class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return (state: State) => new State(state.count + 1);
  }
}

class Tick extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

// Polls every second.
class PollingTick extends KissAction<State> {
  pollInterval = 1000;

  constructor(readonly poll = Poll.once) { super(); }

  createPollingAction() { return new PollingTick(); }

  reduce() { return new State(this.state.count + 1); }
}

// Waits a second before running.
class DebouncedTick extends KissAction<State> {
  debounce = 1000;

  reduce() { return new State(this.state.count + 1); }
}

// Fails, and retries after a second.
class FailingWithRetry extends KissAction<State> {
  constructor(retry: Retry = { initialDelay: 1000, multiplier: 1, maxRetries: 5 }) {
    super();
    this.retry = retry;
  }

  async reduce(): Promise<(state: State) => State> {
    throw new Error('always fails');
  }
}

// Waits for a condition, inside the reducer.
class WaitForTen extends KissAction<State> {
  async reduce() {
    await this.store.waitCondition((state) => state.count >= 10, { timeoutMillis: 60_000 });
    return null;
  }
}

// A persistor that saves right away or after a throttle, and never fails.
class MemoryPersistor extends Persistor<State> {
  saved: State[] = [];

  constructor(readonly throttleMillis: number | null = null) { super(); }

  get throttle(): number | null { return this.throttleMillis; }

  async readState(): Promise<State | null> { return null; }

  async deleteState(): Promise<void> {}

  async persistDifference(_last: State | null, newState: State): Promise<void> { this.saved.push(newState); }
}

// The client persistor of a real app, which reads `window.localStorage`. On the server there is
// no `window`, so it throws. The example apps in `examples/` only create the persistor on the
// client; this checks what happens if an app doesn't.
class LocalStoragePersistor extends Persistor<State> {
  async readState(): Promise<State | null> {
    const json = window.localStorage.getItem('state');
    return json === null ? null : new State(JSON.parse(json).count);
  }

  async deleteState(): Promise<void> { window.localStorage.removeItem('state'); }

  async persistDifference(_last: State | null, newState: State): Promise<void> {
    window.localStorage.setItem('state', JSON.stringify(newState));
  }
}

function createStore(params: { persistor?: Persistor<State>, errorObserver?: (p: any) => any } = {}) {
  return new Store<State>({
    initialState: new State(0),
    persistor: params.persistor,
    errorObserver: params.errorObserver,
    logger: () => {},
    showUserException: () => {},
  });
}

const Count: React.FC = () => <span>{useSelect((s: State) => s.count)}</span>;
const Ready: React.FC = () => <span>{String(useIsStoreReady())}</span>;

afterEach(() => {
  jest.useRealTimers();
});

Bdd(feature)
  .scenario('Creating a store, dispatching and awaiting async actions, and rendering, leaves no live timers.')
  .given('Fake timers that count the pending timers, and a store created for a request.')
  .when('Async actions are dispatched and awaited, the component is rendered to a string, and the store is disposed.')
  .then('The HTML shows the state after the actions.')
  .and('No timer is pending after the actions, after the render, or after the disposal.')
  .run(async (_) => {
    jest.useFakeTimers();
    expect(typeof window).toBe('undefined');
    const store = createStore();

    await store.dispatchAndWait(new LoadAsync());
    await store.dispatchAndWaitAll([new LoadAsync(), new LoadAsync()]);
    expect(store.state.count).toBe(3);
    expect(jest.getTimerCount()).toBe(0);

    const html = renderToString(<StoreProvider store={store} serverState={store.state}><Count /></StoreProvider>);
    expect(html).toBe('<span>3</span>');
    expect(jest.getTimerCount()).toBe(0);

    await store.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });

Bdd(feature)
  .scenario('The timers of the action features are cleared when the server store is disposed.')
  .given('Fake timers that count the pending timers, and a store where <Feature> left a timer pending.')
  .when('The store is disposed.')
  .then('No timer is pending anymore.')
  .and('The feature does not run after the disposal, even after its time passes.')
  .example(val('Feature', 'polling'))
  .example(val('Feature', 'debounce'))
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'dispatchWhen with a timeout'))
  .example(val('Feature', 'waitCondition with a timeout'))
  .example(val('Feature', 'waitActionCondition with a timeout'))
  .example(val('Feature', 'a persistor with a throttle'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const feature: string = ctx.example.val('Feature');
    const onTimeout = jest.fn();
    const persistor = new MemoryPersistor(1000);
    const store = createStore({ persistor: (feature === 'a persistor with a throttle') ? persistor : undefined });
    await store.ready();
    const rejected: unknown[] = [];

    // Given: the feature leaves a timer pending.
    switch (feature) {
      case 'polling':
        store.dispatch(new PollingTick(Poll.start));
        break;
      case 'debounce':
        store.dispatch(new DebouncedTick());
        break;
      case 'retry':
        store.dispatch(new FailingWithRetry());
        await Promise.resolve(); // Lets the first attempt fail, and the retry wait start.
        await Promise.resolve();
        await Promise.resolve();
        break;
      case 'dispatchWhen with a timeout':
        store.dispatchWhen(new Tick(), (state) => state.count >= 10, { timeoutMillis: 1000, onTimeout });
        break;
      case 'waitCondition with a timeout':
        store.waitCondition((state) => state.count >= 10, { timeoutMillis: 1000 }).catch((e) => rejected.push(e));
        break;
      case 'waitActionCondition with a timeout':
        store.waitActionCondition((actions) => actions.size >= 10, { timeoutMillis: 1000 }).catch((e) => rejected.push(e));
        break;
      case 'a persistor with a throttle':
        store.dispatch(new Tick()); // Saved right away.
        await Promise.resolve();
        store.dispatch(new Tick()); // Waits for the throttle.
        break;
      default:
        throw new Error(`Unknown feature: ${feature}`);
    }
    expect(jest.getTimerCount()).toBeGreaterThan(0);
    const countBefore = store.state.count;
    const savedBefore = persistor.saved.length;

    // When:
    await store.dispose();

    // Then:
    expect(jest.getTimerCount()).toBe(0);

    await jest.advanceTimersByTimeAsync(10_000);
    expect(jest.getTimerCount()).toBe(0);
    expect(store.state.count).toBe(countBefore);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(persistor.saved.length).toBe(savedBefore);
    for (const error of rejected) expect(error).toBeInstanceOf(AbortDispatchException);
  });

Bdd(feature)
  .scenario('A wait still pending when the store is disposed is rejected, so that the server code does not hang.')
  .given('A store with an action still running, and <Wait> still waiting, with a timeout.')
  .when('The store is disposed.')
  .then('The wait rejects with an AbortDispatchException, right away.')
  .and('Its timeout is cancelled, so no timer is pending.')
  .example(val('Wait', 'waitCondition'))
  .example(val('Wait', 'waitActionCondition'))
  .example(val('Wait', 'waitAllActions'))
  .example(val('Wait', 'waitActionType'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const wait: string = ctx.example.val('Wait');
    const store = createStore();
    const finish = new Deferred<void>();
    const load = new Load(finish.promise);
    store.dispatch(load);

    const pending: Promise<unknown> =
      (wait === 'waitCondition') ? store.waitCondition((state) => state.count >= 1, { timeoutMillis: 5000 })
        : (wait === 'waitActionCondition') ? store.waitActionCondition((actions) => actions.size === 0, { timeoutMillis: 5000 })
          : (wait === 'waitAllActions') ? store.waitAllActions([load], { timeoutMillis: 5000 })
            : store.waitActionType(Load, { timeoutMillis: 5000 });
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await store.dispose();

    await expect(pending).rejects.toBeInstanceOf(AbortDispatchException);
    await expect(pending).rejects.toThrow('The store was disposed, so the wait was aborted.');
    expect(jest.getTimerCount()).toBe(0);

    // The action that was running still finishes, but the store is disposed and shut down.
    finish.resolve();
    await store.waitAllActions([], { timeoutMillis: 0 });
    expect(store.isDisposed).toBe(true);
  });

Bdd(feature)
  .scenario('Inside an action, a wait aborted by the disposal aborts the action, which does not fail.')
  .given('An action whose reducer awaits a waitCondition, and an errorObserver.')
  .when('The store is disposed while the action waits.')
  .then('The action finishes as aborted, not as failed.')
  .and('The errorObserver is not called.')
  .run(async (_) => {
    const observed: unknown[] = [];
    const store = createStore({ errorObserver: ({ error }: { error: unknown }) => { observed.push(error); return null; } });
    const action = new WaitForTen();
    const status = store.dispatchAndWait(action);
    await Promise.resolve();
    expect(store.isWaiting(WaitForTen)).toBe(true);

    await store.dispose();

    expect((await status).isDispatchAborted).toBe(true);
    expect(store.isFailed(WaitForTen)).toBe(false);
    expect(observed).toEqual([]);
  });

Bdd(feature)
  .scenario('A persistor that throws on the server does not break the render, and the readiness hook still renders true.')
  .given('A store created with a persistor that reads window.localStorage, in an environment with no window.')
  .and('An errorObserver.')
  .when('A component using useIsStoreReady and useSelect is rendered to a string.')
  .then('The HTML shows the store as ready, with the initial state.')
  .and('The error of the persistor is given to the errorObserver, with a null action, and the store becomes ready.')
  .run(async (_) => {
    const observed: { error: unknown, action: unknown }[] = [];
    const store = createStore({
      persistor: new LocalStoragePersistor(),
      errorObserver: ({ error, action }: { error: unknown, action: unknown }) => { observed.push({ error, action }); return null; },
    });

    const html = renderToString(<StoreProvider store={store}><Ready /><Count /></StoreProvider>);

    expect(html).toBe('<span>true</span><span>0</span>');
    await store.ready();
    expect(observed.length).toBeGreaterThanOrEqual(1);
    expect(observed[0].error).toBeInstanceOf(ReferenceError);
    expect(observed[0].action).toBeNull();
    expect(store.state.count).toBe(0);
    await store.dispose();
  });

Bdd(feature)
  .scenario('Disposing the server store after the render leaves no timers, even if actions were dispatched during it.')
  .given('A component that dispatches a polling action and a debounced action from its body, which is a mistake on the server.')
  .when('The component is rendered to a string, and the store is disposed.')
  .then('The HTML shows the state the server rendered with, since nothing re-renders.')
  .and('No timer is pending after the disposal.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = createStore();
    const Misbehaving: React.FC = () => {
      store.dispatch(new PollingTick(Poll.start));
      store.dispatch(new DebouncedTick());
      return <Count />;
    };

    const html = renderToString(<StoreProvider store={store}><Misbehaving /></StoreProvider>);
    expect(html).toBe('<span>0</span>');
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    await store.dispose();
    expect(jest.getTimerCount()).toBe(0);
  });
