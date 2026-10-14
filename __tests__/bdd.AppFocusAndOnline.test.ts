import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { AppSignalSource, KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

// This file runs in the default Node environment, with no `document` and no `navigator`, so the
// default sources have nothing to listen to. The browser defaults are tested in
// `bdd.AppFocusAndOnlineBrowser.test.ts`.

const feature = new Feature('App focus and online signals in the store');

type Signal = 'focus' | 'online';

Bdd(feature)
  .scenario('Where the app cannot know if it is focused or online, the store assumes it is both.')
  .given('A store created in Node, with no document and no navigator.')
  .when('The signals are read.')
  .then('isFocused and isOnline are true.')
  .run(async (_) => {
    const store = createStore();
    expect(store.isFocused).toBe(true);
    expect(store.isOnline).toBe(true);
    await store.dispose();
  });

Bdd(feature)
  .scenario('The store can get its focus and online signals from a custom source.')
  .given('A store with a custom source for the signal (for example, AppState or NetInfo in React Native).')
  .when('The source sets the value.')
  .then('The store reports that value, and notifies its listeners.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);
    const notifications: boolean[] = [];
    subscribe(store, signal, () => notifications.push(read(store, signal)));

    expect(read(store, signal)).toBe(true);

    source.set(false);
    expect(read(store, signal)).toBe(false);
    expect(notifications).toEqual([false]);

    source.set(true);
    expect(read(store, signal)).toBe(true);
    expect(notifications).toEqual([false, true]);

    await store.dispose();
  });

Bdd(feature)
  .scenario('Setting the same value again does not notify the listeners.')
  .given('A store with a custom source, and a listener.')
  .when('The source sets the value the store already has.')
  .then('The listener is not called.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);
    let count = 0;
    subscribe(store, signal, () => count++);

    source.set(true); // Already true.
    expect(count).toBe(0);
    source.set(false);
    source.set(false);
    expect(count).toBe(1);

    await store.dispose();
  });

Bdd(feature)
  .scenario('The source is started lazily, once, when the signal is first read or subscribed to.')
  .given('A store with a custom source.')
  .when('The store is created.')
  .then('The source is not called.')
  .and('When the signal is read, or subscribed to, the source is called once.')
  .and('Reading it again does not call it again.')
  .example(val('Signal', 'focus'), val('How', 'read'))
  .example(val('Signal', 'focus'), val('How', 'subscribe'))
  .example(val('Signal', 'online'), val('How', 'read'))
  .example(val('Signal', 'online'), val('How', 'subscribe'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);
    expect(source.starts).toBe(0);

    if (ctx.example.val('How') === 'read') read(store, signal);
    else subscribe(store, signal, () => {});
    expect(source.starts).toBe(1);

    read(store, signal);
    read(store, signal);
    subscribe(store, signal, () => {});
    expect(source.starts).toBe(1);

    await store.dispose();
  });

Bdd(feature)
  .scenario('The source can set the initial value when it starts.')
  .given('A custom source that calls the setter right away, with false.')
  .when('The signal is first read.')
  .then('The store reports false.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const store = createStore(signal, (set) => { set(false); });
    expect(read(store, signal)).toBe(false);
    await store.dispose();
  });

Bdd(feature)
  .scenario('Disposing the store unsubscribes from the sources.')
  .given('A store whose custom source was started.')
  .when('The store is disposed.')
  .then('The unsubscribe function returned by the source is called.')
  .and('Values the source sets afterwards are ignored.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);
    read(store, signal);
    expect(source.stops).toBe(0);

    await store.dispose();
    expect(source.stops).toBe(1);

    source.set(false);
    expect(read(store, signal)).toBe(true);
    expect(source.starts).toBe(1); // Reading after dispose doesn't start the source again.
  });

Bdd(feature)
  .scenario('Disposing a store whose sources were never started does nothing to them.')
  .given('A store with a custom source that was never read.')
  .when('The store is disposed.')
  .then('The source is not started, and not stopped.')
  .run(async (_) => {
    const source = new FakeSource();
    const store = createStore('focus', source.source);
    await store.dispose();
    expect(source.starts).toBe(0);
    expect(source.stops).toBe(0);
  });

Bdd(feature)
  .scenario('An unsubscribe that throws when the store is disposed is reported, and the disposal continues.')
  .given('A store with a custom source whose unsubscribe throws.')
  .when('The store is disposed.')
  .then('The error is given to the errorObserver, with a null action.')
  .and('The store is disposed anyway.')
  .run(async (_) => {
    const errors: { error: any, action: any }[] = [];
    const store = new Store<State>({
      initialState: new State(0),
      logger: () => {},
      errorObserver: ({ error, action }) => { errors.push({ error, action }); return null; },
      focusSource: () => () => { throw new Error('unsubscribe failed'); },
    });
    read(store, 'focus');

    await store.dispose();

    expect(store.isDisposed).toBe(true);
    expect(errors.length).toBe(1);
    expect(errors[0].action).toBeNull();
    expect((errors[0].error as Error).message).toBe('unsubscribe failed');
  });

Bdd(feature)
  .scenario('Tests can set the signals by hand, which disconnects the source.')
  .given('A store with a custom source.')
  .when('setFocused or setOnline is called with a boolean.')
  .then('The store reports that value, and notifies its listeners.')
  .and('The source is stopped, and the values it sets afterwards are ignored.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);
    const notifications: boolean[] = [];
    subscribe(store, signal, () => notifications.push(read(store, signal)));
    expect(source.starts).toBe(1);

    set(store, signal, false);
    expect(read(store, signal)).toBe(false);
    expect(notifications).toEqual([false]);
    expect(source.stops).toBe(1);

    source.set(true); // Ignored.
    expect(read(store, signal)).toBe(false);
    expect(notifications).toEqual([false]);

    set(store, signal, true);
    expect(read(store, signal)).toBe(true);
    expect(notifications).toEqual([false, true]);
    expect(source.starts).toBe(1); // Not started again.

    await store.dispose();
  });

Bdd(feature)
  .scenario('Setting a signal by hand before it is read means the source is never started.')
  .given('A store with a custom source, whose signal was not read yet.')
  .when('setFocused or setOnline is called with a boolean.')
  .and('The signal is then read.')
  .then('The source is never started, and the store reports the value set by hand.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource();
    const store = createStore(signal, source.source);

    set(store, signal, false);
    expect(read(store, signal)).toBe(false);
    expect(source.starts).toBe(0);

    await store.dispose();
  });

Bdd(feature)
  .scenario('Setting a signal to null connects the source again.')
  .given('A store whose signal was set by hand.')
  .when('setFocused or setOnline is called with null.')
  .then('The source is started again, and the store reports what the source says.')
  .example(val('Signal', 'focus'))
  .example(val('Signal', 'online'))
  .run(async (ctx) => {
    const signal = ctx.example.val('Signal') as Signal;
    const source = new FakeSource(false); // The source says false when it starts.
    const store = createStore(signal, source.source);

    set(store, signal, true);
    expect(read(store, signal)).toBe(true);
    expect(source.starts).toBe(0);

    set(store, signal, null);
    expect(source.starts).toBe(1);
    expect(read(store, signal)).toBe(false);

    source.set(true);
    expect(read(store, signal)).toBe(true);

    await store.dispose();
  });

Bdd(feature)
  .scenario('By default, checkInternet uses the online signal of the store.')
  .given('An action with checkInternet, and no hasInternet override.')
  .and('The store says the app is offline.')
  .when('The action is dispatched.')
  .then('The action fails with a "No Internet" UserException.')
  .and('When the store says the app is online, the action runs.')
  .run(async (_) => {
    const store = createStore();
    store.setOnline(false);

    let status = await store.dispatchAndWait(new IncrementIfOnline());
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBeInstanceOf(UserException);
    expect((status.originalError as UserException).message).toBe('No Internet');
    expect(store.state.count).toBe(0);

    store.setOnline(true);
    status = await store.dispatchAndWait(new IncrementIfOnline());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);

    await store.dispose();
  });

Bdd(feature)
  .scenario('A custom online source is used by checkInternet.')
  .given('A store with a custom online source (like NetInfo), and an action with checkInternet.')
  .when('The source says the app is offline, and the action is dispatched.')
  .then('The action fails with "No Internet".')
  .run(async (_) => {
    const source = new FakeSource();
    const store = createStore('online', source.source);
    read(store, 'online');
    source.set(false);

    const status = await store.dispatchAndWait(new IncrementIfOnline());
    expect(status.isCompletedFailed).toBe(true);
    expect((status.originalError as UserException).message).toBe('No Internet');

    await store.dispose();
  });

Bdd(feature)
  .scenario('The internet simulation takes precedence over the online signal.')
  .given('A store that says the app is offline, but simulates that there is internet.')
  .when('An action with checkInternet is dispatched.')
  .then('The action runs.')
  .run(async (_) => {
    const store = createStore();
    store.setOnline(false);
    store.forceInternetOnOffSimulation = () => true;

    const status = await store.dispatchAndWait(new IncrementIfOnline());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);

    await store.dispose();
  });

Bdd(feature)
  .scenario('An action can still override hasInternet, ignoring the online signal.')
  .given('An action that overrides hasInternet to return true.')
  .and('The store says the app is offline.')
  .when('The action is dispatched.')
  .then('The action runs.')
  .run(async (_) => {
    const store = createStore();
    store.setOnline(false);

    const status = await store.dispatchAndWait(new IncrementAlwaysOnline());
    expect(status.isCompletedOk).toBe(true);

    await store.dispose();
  });

// ---------------------------------------------------------------------------------------------

class State {
  constructor(readonly count: number) {}

  toString() { return `State(${this.count})`; }
}

class IncrementIfOnline extends KissAction<State> {
  checkInternet = { dialog: false };

  async reduce() {
    return (state: State) => new State(state.count + 1);
  }
}

class IncrementAlwaysOnline extends IncrementIfOnline {
  protected async hasInternet() { return true; }
}

/** A source that counts its starts and stops, and lets the test set the value. */
class FakeSource {
  starts = 0;
  stops = 0;
  private _set: ((value: boolean) => void) | null = null;

  constructor(private readonly initialValue: boolean | null = null) {}

  readonly source: AppSignalSource = (set) => {
    this.starts++;
    this._set = set;
    if (this.initialValue !== null) set(this.initialValue);
    return () => {
      this.stops++;
      this._set = null;
    };
  };

  /** Sets the value, as the real source would (does nothing if the source was stopped). */
  set(value: boolean) {
    this._set?.(value);
  }
}

function createStore(signal?: Signal, source?: AppSignalSource): Store<State> {
  return new Store<State>({
    initialState: new State(0),
    logger: () => {},
    focusSource: signal === 'focus' ? source : undefined,
    onlineSource: signal === 'online' ? source : undefined,
  });
}

function read(store: Store<State>, signal: Signal): boolean {
  return signal === 'focus' ? store.isFocused : store.isOnline;
}

function set(store: Store<State>, signal: Signal, value: boolean | null): void {
  if (signal === 'focus') store.setFocused(value);
  else store.setOnline(value);
}

function subscribe(store: Store<State>, signal: Signal, listener: () => void): () => void {
  return signal === 'focus' ? store._subscribeFocus(listener) : store._subscribeOnline(listener);
}
