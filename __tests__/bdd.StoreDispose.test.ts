import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Poll, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Disposing the store');

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

function createStore(params: {
  persistor?: Persistor<State>,
  errorObserver?: (p: any) => any,
  logger?: ((obj: any) => void) | null,
} = {}): Store<State> {
  return new Store<State>({
    initialState: new State(0),
    logger: params.logger ?? null,
    persistor: params.persistor,
    errorObserver: params.errorObserver,
  });
}

// Adds 1 to the count.
class Tick extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

// Adds 1 to the count. Polls every 20 millis.
class PollingTick extends KissAction<State> {
  pollInterval = 20;

  constructor(readonly poll = Poll.once) { super(); }

  createPollingAction() { return new PollingTick(); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// An object that can be disposed with the TC39 explicit resource management protocol.
class Disposable {
  disposed = 0;

  [Symbol.dispose]() {
    this.disposed++;
  }
}

// An object that can be disposed asynchronously, in the given time.
class AsyncDisposable {
  disposed = 0;
  finished = false;

  constructor(readonly millis: number) {
  }

  async [Symbol.asyncDispose]() {
    this.disposed++;
    await delayMillis(this.millis);
    this.finished = true;
  }
}

// A persistor that records the saved states, with a throttle.
class RecordingPersistor extends Persistor<State> {
  saved: State[] = [];

  constructor(readonly throttleMillis: number) {
    super();
  }

  get throttle(): number | null {
    return this.throttleMillis;
  }

  async readState(): Promise<State | null> {
    return null;
  }

  async deleteState(): Promise<void> {
  }

  async persistDifference(_lastPersistedState: State | null, newState: State): Promise<void> {
    this.saved.push(newState);
  }
}

// ==========================================================================
// What dispose does.
// ==========================================================================

Bdd(feature)
  .scenario('A disposed store does not accept new actions.')
  .given('A store.')
  .when('The store is disposed.')
  .and('An action is dispatched.')
  .then('The action is aborted, and the state does not change.')
  .and('The store knows it is disposed.')
  .run(async (_) => {
    const store = createStore();
    expect(store.isDisposed).toBe(false);

    await store.dispose();
    expect(store.isDisposed).toBe(true);

    const status = await store.dispatchAndWait(new Tick());
    expect(status.isDispatchAborted).toBe(true);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store stops the action features, like polling.')
  .given('A store with a polling action running.')
  .when('The store is disposed.')
  .then('The polling stops, and the count does not grow anymore.')
  .run(async (_) => {
    const store = createStore();

    store.dispatch(new PollingTick(Poll.start));
    await delayMillis(100);
    expect(store.state.count).toBeGreaterThan(2);

    await store.dispose();
    const count = store.state.count;

    await delayMillis(100);
    expect(store.state.count).toBe(count);
  });

Bdd(feature)
  .scenario('Disposing the store disposes all its props, and removes them.')
  .given('A store with disposable props, and props that cannot be disposed.')
  .when('The store is disposed.')
  .then('The disposable props are disposed.')
  .and('All props are removed.')
  .run(async (_) => {
    const store = createStore();
    const disposable = new Disposable();
    const controller = new AbortController();
    const dispose = jest.fn();

    store.setProp('d', disposable);
    store.setProp('a', controller);
    store.setProp('o', 'text', { dispose });
    store.setProp('n', 42);

    await store.dispose();

    expect(disposable.disposed).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledWith('text');
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store stops a timer kept in a prop, so that it does not keep running after the test.')
  .given('An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.')
  .when('The store is disposed.')
  .then('The interval is cleared.')
  .run(async (_) => {
    const store = createStore();
    const cleared: unknown[] = [];

    class StartClock extends KissAction<State> {
      reduce() {
        const interval = setInterval(() => this.dispatch(new Tick()), 10);
        this.setProp('clock', interval, { dispose: (value) => { cleared.push(value); clearInterval(value as any); } });
        return null;
      }
    }

    store.dispatch(new StartClock());
    const interval = store.prop('clock');

    await store.dispose();
    expect(cleared).toEqual([interval]);
  });

Bdd(feature)
  .scenario('Disposing the store waits for the async disposals of the props.')
  .given('A store with props whose disposals are asynchronous: one with Symbol.asyncDispose, and one with a dispose option that returns a promise.')
  .when('The store is disposed, and the returned promise is awaited.')
  .then('All the async disposals have finished.')
  .run(async (_) => {
    const store = createStore();
    const asyncDisposable = new AsyncDisposable(30);
    let optionFinished = false;

    store.setProp('a', asyncDisposable);
    store.setProp('b', 'value', { dispose: async () => { await delayMillis(20); optionFinished = true; } });

    const promise = store.dispose();
    expect(asyncDisposable.finished).toBe(false);
    expect(optionFinished).toBe(false);

    await promise;
    expect(asyncDisposable.finished).toBe(true);
    expect(optionFinished).toBe(true);
  });

Bdd(feature)
  .scenario('Disposing the store twice disposes the props only once.')
  .given('A store with a disposable prop.')
  .when('The store is disposed twice.')
  .then('The prop is disposed once.')
  .and('Both calls finish without errors.')
  .run(async (_) => {
    const store = createStore();
    const disposable = new Disposable();
    store.setProp('d', disposable);

    await store.dispose();
    await store.dispose();

    expect(disposable.disposed).toBe(1);
    expect(store.isDisposed).toBe(true);
  });

Bdd(feature)
  .scenario('A prop set after the store was disposed is disposed right away, and not kept.')
  .given('A disposed store.')
  .when('A prop is set, for example by an async action that was still running.')
  .then('The value is disposed right away.')
  .and('The prop is not kept.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = createStore({ logger: (obj) => logs.push(String(obj)) });
    await store.dispose();

    const disposable = new Disposable();
    store.setProp('late', disposable);

    expect(disposable.disposed).toBe(1);
    expect(store.props.size).toBe(0);
    expect(store.prop('late')).toBeUndefined();
    expect(logs.some(log => log.includes('late') && log.includes('disposed'))).toBe(true);
  });

Bdd(feature)
  .scenario('Disposing the store cancels the dispatchWhens that are still waiting.')
  .given('A store with a dispatchWhen waiting for a condition, with a timeout.')
  .when('The store is disposed.')
  .then('The onTimeout is not called, even after the timeout.')
  .run(async (_) => {
    const store = createStore();
    const onTimeout = jest.fn();

    store.dispatchWhen(new Tick(), (state) => state.count > 100, { timeoutMillis: 50, onTimeout });
    await store.dispose();

    await delayMillis(100);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing the store pauses the persistor, and cancels its pending save.')
  .given('A store with a persistor with a throttle.')
  .and('The state changed twice, so that the second change is waiting for the throttle to be saved.')
  .when('The store is disposed.')
  .then('The pending save is cancelled, and the state is not saved after the throttle.')
  .run(async (_) => {
    const persistor = new RecordingPersistor(100);
    const store = createStore({ persistor });
    await store.ready();

    store.dispatch(new Tick());
    await delayMillis(10);
    expect(persistor.saved.length).toBe(1);

    // This change waits for the throttle.
    store.dispatch(new Tick());
    await delayMillis(10);
    expect(persistor.saved.length).toBe(1);

    await store.dispose();

    await delayMillis(200);
    expect(persistor.saved.length).toBe(1);
  });

Bdd(feature)
  .scenario('A disposal error does not make dispose fail, and the other props are still disposed.')
  .given('A store with an errorObserver, and a prop whose dispose throws, followed by a disposable prop.')
  .when('The store is disposed.')
  .then('The returned promise resolves.')
  .and('The error is given to the errorObserver, with a null action.')
  .and('The other prop is disposed.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = createStore({ errorObserver: (params) => { observed.push(params); return null; } });
    const error = new Error('Dispose failed');
    const other = new Disposable();

    store.setProp('fails', 'value', { dispose: () => { throw error; } });
    store.setProp('other', other);

    await expect(store.dispose()).resolves.toBeUndefined();

    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].action).toBeNull();
    expect(other.disposed).toBe(1);
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('An async disposal that fails does not make dispose fail.')
  .given('A store with an errorObserver, and a prop with Symbol.asyncDispose that rejects.')
  .when('The store is disposed.')
  .then('The returned promise resolves.')
  .and('The error is given to the errorObserver, with a null action.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = createStore({ errorObserver: (params) => { observed.push(params); return null; } });
    const error = new Error('Async dispose failed');

    store.setProp('fails', { async [Symbol.asyncDispose]() { await delayMillis(10); throw error; } });

    await expect(store.dispose()).resolves.toBeUndefined();

    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].action).toBeNull();
  });

// ==========================================================================
// Explicit resource management (`using`).
// ==========================================================================

Bdd(feature)
  .scenario('The store can be disposed with the explicit resource management protocol.')
  .given('A store with a disposable prop.')
  .when('The store is disposed with Symbol.dispose, or with Symbol.asyncDispose.')
  .then('The store is disposed, and so is the prop.')
  .run(async (_) => {
    const store1 = createStore();
    const disposable1 = new Disposable();
    store1.setProp('d', disposable1);

    store1[Symbol.dispose]();
    expect(store1.isDisposed).toBe(true);
    expect(disposable1.disposed).toBe(1);

    const store2 = createStore();
    const disposable2 = new AsyncDisposable(10);
    store2.setProp('d', disposable2);

    await store2[Symbol.asyncDispose]();
    expect(store2.isDisposed).toBe(true);
    expect(disposable2.finished).toBe(true);
  });

Bdd(feature)
  .scenario('A store declared with `await using` is disposed at the end of the block.')
  .given('A block that creates a store with `await using`, and sets a disposable prop.')
  .when('The block ends.')
  .then('The store is disposed, and so is the prop.')
  .run(async (_) => {
    const disposable = new AsyncDisposable(10);
    let store: Store<State>;

    {
      await using usingStore = createStore();
      store = usingStore;
      store.setProp('d', disposable);
      expect(store.isDisposed).toBe(false);
    }

    expect(store.isDisposed).toBe(true);
    expect(disposable.finished).toBe(true);
  });
