import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Store props');

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

function createStore(params: { errorObserver?: (p: any) => any, logger?: ((obj: any) => void) | null } = {}): Store<State> {
  return new Store<State>({ initialState: new State(0), logger: params.logger ?? null, errorObserver: params.errorObserver });
}

// Adds 1 to the count.
class Tick extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

// Starts an interval that dispatches `Tick` every 10 millis, and keeps it in the `clock` prop.
class StartClock extends KissAction<State> {
  reduce() {
    const interval = setInterval(() => this.dispatch(new Tick()), 10);
    this.setProp('clock', interval, { dispose: clearInterval });
    return null;
  }
}

// Disposes the `clock` prop, which stops the interval.
class StopClock extends KissAction<State> {
  reduce() {
    this.disposeProp('clock');
    return null;
  }
}

// An object that can be disposed with the TC39 explicit resource management protocol.
class Disposable {
  disposed = 0;

  [Symbol.dispose]() {
    this.disposed++;
  }
}

// An object that can be disposed asynchronously.
class AsyncDisposable {
  disposed = 0;
  finished = false;

  async [Symbol.asyncDispose]() {
    this.disposed++;
    await delayMillis(20);
    this.finished = true;
  }
}

// An RxJS-like subscription.
class Subscription {
  unsubscribed = 0;

  unsubscribe() {
    this.unsubscribed++;
  }
}

// Creates an object that passes `instanceof type`, without calling the type's constructor
// (for example, a `WebSocket` that doesn't try to connect). The given methods are its own.
function fakeInstanceOf(type: any, methods: Record<string, any>): any {
  return Object.assign(Object.create(type.prototype), methods);
}

// Defines a global class with the given name, while `run` runs, if the runtime doesn't have it.
async function withGlobal(name: string, run: () => Promise<void>): Promise<void> {
  const g = globalThis as any;
  const existed = typeof g[name] !== 'undefined';
  if (!existed) g[name] = class {};
  try {
    await run();
  } finally {
    if (!existed) delete g[name];
  }
}

// ==========================================================================
// Setting and reading props.
// ==========================================================================

Bdd(feature)
  .scenario('A prop set in the store can be read back with its key.')
  .given('A store.')
  .when('A prop is set with a key and a value.')
  .then('The prop can be read with the key.')
  .and('Reading a key that was never set returns undefined.')
  .run(async (_) => {
    const store = createStore();

    store.setProp('name', 'Mary');
    store.setProp(42, { some: 'object' });

    expect(store.prop('name')).toBe('Mary');
    expect(store.prop<{ some: string }>(42)).toEqual({ some: 'object' });
    expect(store.prop('other')).toBeUndefined();
  });

Bdd(feature)
  .scenario('Prop keys are compared by identity, like the keys of a Map.')
  .given('A store with props with a string key, a symbol key and an object key.')
  .when('The props are read.')
  .then('Equal strings find the prop.')
  .and('The same symbol or object finds the prop, but a different one does not.')
  .run(async (_) => {
    const store = createStore();
    const symbolKey = Symbol('timer');
    const objectKey = { id: 1 };

    store.setProp('a' + 'b', 1);
    store.setProp(symbolKey, 2);
    store.setProp(objectKey, 3);

    expect(store.prop('ab')).toBe(1);
    expect(store.prop(symbolKey)).toBe(2);
    expect(store.prop(Symbol('timer'))).toBeUndefined();
    expect(store.prop(objectKey)).toBe(3);
    expect(store.prop({ id: 1 })).toBeUndefined();
  });

Bdd(feature)
  .scenario('The props of the store can be listed.')
  .given('A store with some props.')
  .when('The props are listed.')
  .then('All the props are there, with their keys and values.')
  .and('Setting a prop to undefined keeps its key.')
  .run(async (_) => {
    const store = createStore();
    store.setProp('a', 1);
    store.setProp('b', 'two');
    store.setProp('c', undefined);

    expect(store.props.size).toBe(3);
    expect([...store.props.entries()]).toEqual([['a', 1], ['b', 'two'], ['c', undefined]]);
    expect(store.props.has('c')).toBe(true);
    expect(store.props.has('d')).toBe(false);
  });

Bdd(feature)
  .scenario('A prop set again with a different value gets the new value.')
  .given('A store with a prop.')
  .when('The prop is set again with another value.')
  .then('Reading the prop gives the new value.')
  .and('The props still have one entry with that key.')
  .run(async (_) => {
    const store = createStore();
    store.setProp('name', 'Mary');
    store.setProp('name', 'John');

    expect(store.prop('name')).toBe('John');
    expect(store.props.size).toBe(1);
  });

// ==========================================================================
// Actions.
// ==========================================================================

Bdd(feature)
  .scenario('Actions can set, read and dispose props, with the same methods as the store.')
  .given('An action that sets a prop, and reads it.')
  .and('An action that lists the props, and another that disposes the prop.')
  .when('The actions are dispatched.')
  .then('The prop they set is in the store, and the prop the store set is seen by the actions.')
  .and('The prop they dispose is removed from the store.')
  .run(async (_) => {
    const store = createStore();
    const seen: unknown[] = [];

    class SetAndRead extends KissAction<State> {
      reduce() {
        this.setProp('fromAction', 'A');
        seen.push(this.prop('fromStore'), this.prop('fromAction'), this.props.size);
        return null;
      }
    }

    class Dispose extends KissAction<State> {
      reduce() {
        this.disposeProp('fromAction');
        return null;
      }
    }

    store.setProp('fromStore', 'S');
    store.dispatch(new SetAndRead());
    expect(seen).toEqual(['S', 'A', 2]);
    expect(store.prop('fromAction')).toBe('A');

    store.dispatch(new Dispose());
    expect(store.prop('fromAction')).toBeUndefined();
    expect(store.props.size).toBe(1);
  });

Bdd(feature)
  .scenario('A timer kept in a prop, with a dispose option, is stopped when the prop is disposed.')
  .given('An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.')
  .and('The interval dispatches an action that counts.')
  .when('Another action disposes the prop.')
  .then('The interval stops, and the count does not grow anymore.')
  .and('The prop is removed from the store.')
  .run(async (_) => {
    const store = createStore();

    store.dispatch(new StartClock());
    expect(store.props.has('clock')).toBe(true);
    await delayMillis(100);
    expect(store.state.count).toBeGreaterThan(2);

    store.dispatch(new StopClock());
    expect(store.props.has('clock')).toBe(false);
    const count = store.state.count;

    await delayMillis(100);
    expect(store.state.count).toBe(count);
  });

Bdd(feature)
  .scenario('Setting a prop again, with the same key, disposes the previous value.')
  .given('An action that starts an interval and keeps it in a prop, with clearInterval as its dispose.')
  .when('The action is dispatched twice.')
  .then('The first interval is stopped, so that it does not leak.')
  .and('Only the second interval is in the prop.')
  .run(async (_) => {
    const store = createStore();
    const disposed: unknown[] = [];

    class Start extends KissAction<State> {
      reduce() {
        const interval = setInterval(() => this.dispatch(new Tick()), 10);
        this.setProp('clock', interval, { dispose: (value) => { disposed.push(value); clearInterval(value as any); } });
        return null;
      }
    }

    store.dispatch(new Start());
    const first = store.prop('clock');
    store.dispatch(new Start());
    const second = store.prop('clock');

    expect(first).not.toBe(second);
    expect(disposed).toEqual([first]);
    expect(store.props.size).toBe(1);

    // Only the second interval is running.
    await delayMillis(100);
    const count = store.state.count;
    store.disposeProp('clock');
    expect(disposed).toEqual([first, second]);
    await delayMillis(50);
    expect(store.state.count).toBe(count);
  });

// ==========================================================================
// How a prop is disposed.
// ==========================================================================

Bdd(feature)
  .scenario('The dispose option given to setProp is called with the value, when the prop is disposed.')
  .given('A prop set with a dispose option.')
  .when('The prop is disposed.')
  .then('The dispose option is called once, with the value.')
  .and('The prop is removed.')
  .run(async (_) => {
    const store = createStore();
    const dispose = jest.fn();
    const value = { some: 'resource' };

    store.setProp('res', value, { dispose });
    store.disposeProp('res');

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(value);
    expect(store.props.has('res')).toBe(false);
  });

Bdd(feature)
  .scenario('Disposing a prop that does not exist does nothing.')
  .given('A store without the prop.')
  .when('The prop is disposed.')
  .then('Nothing happens, and no error is thrown.')
  .run(async (_) => {
    const store = createStore();
    store.setProp('other', 1);

    expect(() => store.disposeProp('missing')).not.toThrow();
    expect(store.props.size).toBe(1);
  });

Bdd(feature)
  .scenario('A value with Symbol.dispose is disposed with it.')
  .given('A prop whose value implements Symbol.dispose.')
  .when('The prop is disposed.')
  .then('Its Symbol.dispose method is called once.')
  .run(async (_) => {
    const store = createStore();
    const value = new Disposable();

    store.setProp('res', value);
    store.disposeProp('res');

    expect(value.disposed).toBe(1);
    expect(store.props.has('res')).toBe(false);
  });

Bdd(feature)
  .scenario('A value with Symbol.asyncDispose is disposed with it.')
  .given('A prop whose value implements Symbol.asyncDispose.')
  .when('The prop is disposed.')
  .then('Its Symbol.asyncDispose method is called once.')
  .and('The prop is removed right away, without waiting for the disposal to finish.')
  .run(async (_) => {
    const store = createStore();
    const value = new AsyncDisposable();

    store.setProp('res', value);
    store.disposeProp('res');

    expect(value.disposed).toBe(1);
    expect(value.finished).toBe(false);
    expect(store.props.has('res')).toBe(false);

    await delayMillis(50);
    expect(value.finished).toBe(true);
  });

Bdd(feature)
  .scenario('An AbortController is aborted when disposed.')
  .given('A prop whose value is an AbortController.')
  .when('The prop is disposed.')
  .then('The controller is aborted.')
  .run(async (_) => {
    const store = createStore();
    const controller = new AbortController();

    store.setProp('abort', controller);
    expect(controller.signal.aborted).toBe(false);

    store.disposeProp('abort');
    expect(controller.signal.aborted).toBe(true);
  });

Bdd(feature)
  .scenario('A WebSocket, EventSource, BroadcastChannel or MessagePort is closed when disposed.')
  .given('Props whose values are a WebSocket, an EventSource, a BroadcastChannel and a MessagePort.')
  .when('The props are disposed.')
  .then('Each of them is closed.')
  .run(async (_) => {
    await withGlobal('EventSource', async () => {
      const store = createStore();

      const webSocket = fakeInstanceOf(WebSocket, { close: jest.fn() });
      const eventSource = fakeInstanceOf((globalThis as any).EventSource, { close: jest.fn() });
      const channel = fakeInstanceOf(BroadcastChannel, { close: jest.fn() });
      const port = fakeInstanceOf(MessagePort, { close: jest.fn() });

      store.setProp('ws', webSocket);
      store.setProp('es', eventSource);
      store.setProp('bc', channel);
      store.setProp('mp', port);

      store.disposeProp('ws');
      store.disposeProp('es');
      store.disposeProp('bc');
      store.disposeProp('mp');

      expect(webSocket.close).toHaveBeenCalledTimes(1);
      expect(eventSource.close).toHaveBeenCalledTimes(1);
      expect(channel.close).toHaveBeenCalledTimes(1);
      expect(port.close).toHaveBeenCalledTimes(1);
      expect(store.props.size).toBe(0);
    });
  });

Bdd(feature)
  .scenario('A Worker is terminated when disposed.')
  .given('A prop whose value is a Worker.')
  .when('The prop is disposed.')
  .then('The worker is terminated.')
  .run(async (_) => {
    await withGlobal('Worker', async () => {
      const store = createStore();
      const worker = fakeInstanceOf((globalThis as any).Worker, { terminate: jest.fn(), close: jest.fn() });

      store.setProp('worker', worker);
      store.disposeProp('worker');

      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(worker.close).not.toHaveBeenCalled();
    });
  });

Bdd(feature)
  .scenario('An object with an unsubscribe method, like an RxJS subscription, is unsubscribed when disposed.')
  .given('A prop whose value has an unsubscribe method.')
  .when('The prop is disposed.')
  .then('The unsubscribe method is called once.')
  .run(async (_) => {
    const store = createStore();
    const subscription = new Subscription();

    store.setProp('sub', subscription);
    store.disposeProp('sub');

    expect(subscription.unsubscribed).toBe(1);
  });

Bdd(feature)
  .scenario('A function kept in a prop is not called when disposed, unless the dispose option says so.')
  .given('A prop whose value is an unsubscribe function, without the dispose option.')
  .and('Another prop with the same kind of function, with a dispose option that calls it.')
  .when('Both props are disposed.')
  .then('The first function is not called, and the prop is only removed.')
  .and('The second function is called.')
  .run(async (_) => {
    const store = createStore();
    const unsubscribe1 = jest.fn();
    const unsubscribe2 = jest.fn();

    store.setProp('u1', unsubscribe1);
    store.setProp('u2', unsubscribe2, { dispose: (unsubscribe) => (unsubscribe as () => void)() });

    store.disposeProp('u1');
    store.disposeProp('u2');

    expect(unsubscribe1).not.toHaveBeenCalled();
    expect(unsubscribe2).toHaveBeenCalledTimes(1);
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Values that cannot be disposed, like promises, numbers and plain objects, are only removed.')
  .given('Props whose values are a promise, a number, a string, null and a plain object.')
  .when('The props are disposed.')
  .then('They are removed, and no error is thrown.')
  .run(async (_) => {
    const store = createStore();

    store.setProp('promise', Promise.resolve(1));
    store.setProp('number', 42);
    store.setProp('string', 'text');
    store.setProp('null', null);
    store.setProp('object', { a: 1 });

    expect(() => store.disposeProps()).not.toThrow();
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('The dispose option wins over the other ways of disposing a value.')
  .given('A prop with a dispose option, whose value also has Symbol.dispose and unsubscribe.')
  .when('The prop is disposed.')
  .then('Only the dispose option is called.')
  .run(async (_) => {
    const store = createStore();
    const dispose = jest.fn();
    const value = { disposed: 0, unsubscribed: 0, [Symbol.dispose]() { this.disposed++; }, unsubscribe() { this.unsubscribed++; } };

    store.setProp('res', value, { dispose });
    store.disposeProp('res');

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(value.disposed).toBe(0);
    expect(value.unsubscribed).toBe(0);
  });

Bdd(feature)
  .scenario('Symbol.dispose wins over the built-in types and unsubscribe.')
  .given('A prop whose value is an AbortController with a Symbol.dispose and an unsubscribe method.')
  .when('The prop is disposed.')
  .then('Only Symbol.dispose is called: the controller is not aborted, and unsubscribe is not called.')
  .run(async (_) => {
    const store = createStore();
    const controller = new AbortController() as any;
    controller.disposed = 0;
    controller[Symbol.dispose] = function () { this.disposed++; };
    controller.unsubscribe = jest.fn();

    store.setProp('res', controller);
    store.disposeProp('res');

    expect(controller.disposed).toBe(1);
    expect(controller.signal.aborted).toBe(false);
    expect(controller.unsubscribe).not.toHaveBeenCalled();
  });

Bdd(feature)
  .scenario('Setting a prop again with the same value does not dispose it, and updates its dispose option.')
  .given('A prop set with a dispose option.')
  .when('The same value is set again with the same key, with another dispose option.')
  .and('The prop is disposed.')
  .then('The value was not disposed when it was set again.')
  .and('The new dispose option is the one called when the prop is disposed.')
  .run(async (_) => {
    const store = createStore();
    const dispose1 = jest.fn();
    const dispose2 = jest.fn();
    const value = { some: 'resource' };

    store.setProp('res', value, { dispose: dispose1 });
    store.setProp('res', value, { dispose: dispose2 });
    expect(dispose1).not.toHaveBeenCalled();

    store.disposeProp('res');
    expect(dispose1).not.toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalledTimes(1);
  });

// ==========================================================================
// Disposing many props.
// ==========================================================================

Bdd(feature)
  .scenario('Disposing all props disposes the disposable ones, and removes them all.')
  .given('A store with disposable props, and props that cannot be disposed.')
  .when('All props are disposed, without a predicate.')
  .then('Each disposable prop is disposed.')
  .and('All props are removed, including the ones that cannot be disposed.')
  .run(async (_) => {
    const store = createStore();
    const disposable = new Disposable();
    const subscription = new Subscription();
    const controller = new AbortController();
    const dispose = jest.fn();

    store.setProp('d', disposable);
    store.setProp('s', subscription);
    store.setProp('a', controller);
    store.setProp('o', 'text', { dispose });
    store.setProp('n', 42);

    store.disposeProps();

    expect(disposable.disposed).toBe(1);
    expect(subscription.unsubscribed).toBe(1);
    expect(controller.signal.aborted).toBe(true);
    expect(dispose).toHaveBeenCalledWith('text');
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Disposing props with a predicate disposes and removes only the props it selects.')
  .given('A store with some props.')
  .when('The props are disposed with a predicate that selects some of them, by key and value.')
  .then('The selected props are disposed and removed.')
  .and('The other props are kept, and not disposed.')
  .run(async (_) => {
    const store = createStore();
    const timer1 = new Disposable();
    const timer2 = new Disposable();
    const listener = new Subscription();
    const seen: Array<[unknown, unknown]> = [];

    store.setProp('timer1', timer1);
    store.setProp('timer2', timer2);
    store.setProp('listener', listener);

    store.disposeProps((key, value) => {
      seen.push([key, value]);
      return (key as string).startsWith('timer');
    });

    expect(seen).toEqual([['timer1', timer1], ['timer2', timer2], ['listener', listener]]);
    expect(timer1.disposed).toBe(1);
    expect(timer2.disposed).toBe(1);
    expect(listener.unsubscribed).toBe(0);
    expect([...store.props.keys()]).toEqual(['listener']);
  });

Bdd(feature)
  .scenario('Props are disposed in the order they were set.')
  .given('Props set in some order.')
  .when('All props are disposed.')
  .then('They are disposed in that order.')
  .run(async (_) => {
    const store = createStore();
    const order: string[] = [];
    const dispose = (value: unknown) => { order.push(value as string); };

    store.setProp('b', 'B', { dispose });
    store.setProp('a', 'A', { dispose });
    store.setProp('c', 'C', { dispose });
    store.setProp('b', 'B2', { dispose }); // Keeps its position.

    store.disposeProps();
    expect(order).toEqual(['B', 'B2', 'A', 'C']);
  });

Bdd(feature)
  .scenario('A dispose that throws does not stop the other props from being disposed.')
  .given('A store with an errorObserver, and three disposable props, of which the second throws when disposed.')
  .when('All props are disposed.')
  .then('The other two props are disposed, and all three are removed.')
  .and('The error is given to the errorObserver, with a null action.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = createStore({ errorObserver: (params) => { observed.push(params); return null; } });
    const error = new Error('Dispose failed');
    const first = new Disposable();
    const third = new Disposable();

    store.setProp('first', first);
    store.setProp('second', 'fails', { dispose: () => { throw error; } });
    store.setProp('third', third);

    expect(() => store.disposeProps()).not.toThrow();

    expect(first.disposed).toBe(1);
    expect(third.disposed).toBe(1);
    expect(store.props.size).toBe(0);
    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].originalError).toBe(error);
    expect(observed[0].action).toBeNull();
    expect(observed[0].store).toBe(store);
  });

Bdd(feature)
  .scenario('An async dispose that fails is reported to the errorObserver.')
  .given('A store with an errorObserver, and a prop whose dispose returns a promise that rejects.')
  .when('The prop is disposed.')
  .then('The error is given to the errorObserver, with a null action.')
  .and('The prop was removed.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = createStore({ errorObserver: (params) => { observed.push(params); return null; } });
    const error = new Error('Async dispose failed');

    store.setProp('res', 'value', { dispose: async () => { await delayMillis(10); throw error; } });
    store.disposeProp('res');
    expect(store.props.size).toBe(0);
    expect(observed.length).toBe(0);

    await delayMillis(30);
    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(error);
    expect(observed[0].action).toBeNull();
  });

Bdd(feature)
  .scenario('Without an errorObserver, a dispose that throws is logged, and the others are still disposed.')
  .given('A store with a logger and no errorObserver, and two disposable props, of which the first throws when disposed.')
  .when('All props are disposed.')
  .then('The error is logged.')
  .and('The second prop is disposed, and both are removed.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = createStore({ logger: (obj) => logs.push(String(obj)) });
    const second = new Disposable();

    store.setProp('first', 'fails', { dispose: () => { throw new Error('Dispose failed'); } });
    store.setProp('second', second);

    expect(() => store.disposeProps()).not.toThrow();

    expect(second.disposed).toBe(1);
    expect(store.props.size).toBe(0);
    expect(logs.some(log => log.includes('first') && log.includes('Dispose failed'))).toBe(true);
  });

Bdd(feature)
  .scenario('A dispose can set or dispose other props, without breaking the disposal in progress.')
  .given('A prop whose dispose disposes another prop, and sets a new one.')
  .when('All props are disposed.')
  .then('The other prop is disposed only once.')
  .and('The new prop is kept, since it was set after the disposal started.')
  .run(async (_) => {
    const store = createStore();
    const other = new Disposable();
    const added = new Disposable();

    store.setProp('first', 'value', {
      dispose: () => {
        store.disposeProp('other');
        store.setProp('added', added);
      },
    });
    store.setProp('other', other);

    store.disposeProps();

    expect(other.disposed).toBe(1);
    expect(added.disposed).toBe(0);
    expect([...store.props.keys()]).toEqual(['added']);
  });

// ==========================================================================
// The props and the other store features.
// ==========================================================================

Bdd(feature)
  .scenario('Clearing the internal action props does not touch the store props.')
  .given('A store with a disposable prop.')
  .when('The internal action props are cleared.')
  .then('The prop is still there, and was not disposed.')
  .run(async (_) => {
    const store = createStore();
    const value = new Disposable();
    store.setProp('res', value);

    store.clearInternalActionProps();

    expect(store.prop('res')).toBe(value);
    expect(value.disposed).toBe(0);
  });

Bdd(feature)
  .scenario('Shutting down the store does not dispose the props.')
  .given('A store with a disposable prop.')
  .when('The store is shut down.')
  .then('The prop is still there, and was not disposed.')
  .run(async (_) => {
    const store = createStore();
    const value = new Disposable();
    store.setProp('res', value);

    store.setShutDown(true);

    expect(store.prop('res')).toBe(value);
    expect(value.disposed).toBe(0);
  });

Bdd(feature)
  .scenario('Logging out keeps the props, by default.')
  .given('A store with a disposable prop.')
  .when('The store logs out.')
  .then('The prop is still there, and was not disposed.')
  .run(async (_) => {
    const store = createStore();
    const value = new Disposable();
    store.setProp('res', value);

    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });

    expect(store.prop('res')).toBe(value);
    expect(value.disposed).toBe(0);
  });

Bdd(feature)
  .scenario('Logging out can dispose all the props.')
  .given('A store with disposable props.')
  .when('The store logs out with disposeProps true.')
  .then('All props are disposed and removed, before logOut waits.')
  .run(async (_) => {
    const store = createStore();
    const value1 = new Disposable();
    const value2 = new Subscription();
    store.setProp('res1', value1);
    store.setProp('res2', value2);

    const promise = store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0, disposeProps: true });

    // Disposed right away, so that the previous user's timers and listeners stop.
    expect(value1.disposed).toBe(1);
    expect(value2.unsubscribed).toBe(1);
    expect(store.props.size).toBe(0);

    await promise;
    expect(store.props.size).toBe(0);
  });

Bdd(feature)
  .scenario('Logging out can dispose only some of the props.')
  .given('A store with a prop that belongs to the user, and a prop that belongs to the app.')
  .when('The store logs out with a disposeProps predicate that selects the user prop.')
  .then('The user prop is disposed and removed.')
  .and('The app prop is kept.')
  .run(async (_) => {
    const store = createStore();
    const userListener = new Subscription();
    const connectivityListener = new Subscription();
    store.setProp('user', userListener);
    store.setProp('connectivity', connectivityListener);

    await store.logOut({
      initialState: new State(0),
      throttle: 0,
      actionsThrottle: 0,
      disposeProps: (key) => key === 'user',
    });

    expect(userListener.unsubscribed).toBe(1);
    expect(connectivityListener.unsubscribed).toBe(0);
    expect([...store.props.keys()]).toEqual(['connectivity']);
  });

Bdd(feature)
  .scenario('Each store has its own props.')
  .given('Two stores.')
  .when('A prop is set in one of them.')
  .then('The other store does not have it.')
  .run(async (_) => {
    const store1 = createStore();
    const store2 = createStore();

    store1.setProp('res', 1);

    expect(store1.prop('res')).toBe(1);
    expect(store2.prop('res')).toBeUndefined();
    expect(store2.props.size).toBe(0);
  });
