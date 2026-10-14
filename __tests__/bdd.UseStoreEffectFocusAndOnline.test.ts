import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { AppSignalSource, KissAction, Persistor, Store, StoreProvider, useStoreEffect } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useStoreEffect with onFocus, onBlur, onOnline and onOffline');

type Signal = 'focus' | 'online';

Bdd(feature)
  .scenario('onFocus and onOnline are called when the app is focused or online again, not on mount.')
  .given('A store that is ready, and the app is focused and online.')
  .and('A component that uses useStoreEffect with onFocus, onBlur, onOnline and onOffline.')
  .when('The component mounts.')
  .then('None of them is called.')
  .and('When the app loses focus, onBlur is called. When it is focused again, onFocus is called.')
  .and('When the app goes offline, onOffline is called. When it is online again, onOnline is called.')
  .and('The actions they dispatch change the state.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({
        onFocus: (s: Store<State>) => { log.push('focus'); s.dispatch(new SetText('focused')); },
        onBlur: (s: Store<State>) => { log.push('blur'); s.dispatch(new SetText('blurred')); },
        onOnline: (s: Store<State>) => { log.push('online'); s.dispatch(new SetText('online')); },
        onOffline: (s: Store<State>) => { log.push('offline'); s.dispatch(new SetText('offline')); },
      });
      return null;
    };

    const renderer = await render(store, Comp, strictMode);
    expect(log).toEqual([]);
    expect(store.state.text).toBe('initial');

    await signal(store, 'focus', false);
    expect(log).toEqual(['blur']);
    expect(store.state.text).toBe('blurred');

    await signal(store, 'focus', true);
    expect(log).toEqual(['blur', 'focus']);
    expect(store.state.text).toBe('focused');

    await signal(store, 'online', false);
    expect(log).toEqual(['blur', 'focus', 'offline']);
    expect(store.state.text).toBe('offline');

    await signal(store, 'online', true);
    expect(log).toEqual(['blur', 'focus', 'offline', 'online']);
    expect(store.state.text).toBe('online');

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('The callbacks are called only on transitions.')
  .given('A component with onFocus and onOnline, and the app is focused and online.')
  .when('The store is told again that the app is focused and online.')
  .then('onFocus and onOnline are not called.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({
        onFocus: () => log.push('focus'),
        onOnline: () => log.push('online'),
      });
      return null;
    };

    const renderer = await render(store, Comp);
    await signal(store, 'focus', true);
    await signal(store, 'online', true);
    expect(log).toEqual([]);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('Only onFocus can be given, or only onOnline, and the other transitions are ignored.')
  .given('A component that gives only one of the callbacks.')
  .when('All four transitions happen.')
  .then('Only that callback is called, once.')
  .example(val('Callback', 'onFocus'), val('Expected', 'focus'))
  .example(val('Callback', 'onBlur'), val('Expected', 'blur'))
  .example(val('Callback', 'onOnline'), val('Expected', 'online'))
  .example(val('Callback', 'onOffline'), val('Expected', 'offline'))
  .run(async (ctx) => {
    const callback = ctx.example.val('Callback') as string;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({ [callback]: () => log.push(ctx.example.val('Expected') as string) });
      return null;
    };

    const renderer = await render(store, Comp);
    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    await signal(store, 'online', false);
    await signal(store, 'online', true);
    expect(log).toEqual([ctx.example.val('Expected')]);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('A component without these callbacks does not start the focus and online sources.')
  .given('A store with custom focus and online sources.')
  .and('A component that uses useStoreEffect with onMount only.')
  .when('The component mounts.')
  .then('The sources are not started.')
  .and('A component with onFocus starts only the focus source, and one with onOnline only the online source.')
  .run(async (_) => {
    const focusSource = new FakeSource();
    const onlineSource = new FakeSource();
    const store = createStore(focusSource.source, onlineSource.source);

    const MountOnly: React.FC = () => {
      useStoreEffect({ onMount: () => {} });
      return null;
    };
    let renderer = await render(store, MountOnly);
    expect(focusSource.starts).toBe(0);
    expect(onlineSource.starts).toBe(0);
    await unmount(renderer);

    const FocusOnly: React.FC = () => {
      useStoreEffect({ onFocus: () => {} });
      return null;
    };
    renderer = await render(store, FocusOnly);
    expect(focusSource.starts).toBe(1);
    expect(onlineSource.starts).toBe(0);
    await unmount(renderer);

    const OnlineOnly: React.FC = () => {
      useStoreEffect({ onOffline: () => {} });
      return null;
    };
    renderer = await render(store, OnlineOnly);
    expect(focusSource.starts).toBe(1);
    expect(onlineSource.starts).toBe(1);
    await unmount(renderer);

    await store.dispose();
  });

Bdd(feature)
  .scenario('The callbacks are not called after the component unmounts.')
  .given('A component with onFocus and onOnline that mounted.')
  .when('The component unmounts, and then the app is focused and online again.')
  .then('onFocus and onOnline are not called.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({
        onFocus: () => log.push('focus'),
        onOnline: () => log.push('online'),
      });
      return null;
    };

    const renderer = await render(store, Comp);
    await unmount(renderer);

    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    await signal(store, 'online', false);
    await signal(store, 'online', true);
    expect(log).toEqual([]);

    await store.dispose();
  });

Bdd(feature)
  .scenario('The callbacks are not called before the store is ready.')
  .given('A store whose persisted state is still being read.')
  .and('A component with onMount and onFocus.')
  .when('The app loses focus and is focused again, before the store is ready.')
  .then('onFocus is not called.')
  .and('After the store is ready, onMount is called, and the next focus calls onFocus.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State('persisted'));
    const store = new Store<State>({ initialState: new State('initial'), persistor, logger: () => {} });
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({
        onMount: () => log.push('mount'),
        onFocus: () => log.push('focus'),
      });
      return null;
    };

    const renderer = await render(store, Comp);
    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    expect(log).toEqual([]);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    await flush();
    expect(log).toEqual(['mount']);

    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    expect(log).toEqual(['mount', 'focus']);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('The callbacks are the ones from the latest render, so they see its values.')
  .given('A component whose onFocus reads a prop.')
  .when('The component re-renders with another prop value, and then the app is focused again.')
  .then('onFocus sees the new prop value.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = ({ userId }) => {
      useStoreEffect({ onFocus: () => log.push('focus:' + userId) });
      return null;
    };

    const renderer = await render(store, Comp, false, { userId: 'A' });
    await update(renderer, store, Comp, false, { userId: 'B' });

    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    expect(log).toEqual(['focus:B']);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('A callback can be added in a later render, and then works.')
  .given('A component that gives onFocus only when a prop says so.')
  .when('It mounts without onFocus, re-renders with it, and then the app is focused again.')
  .then('onFocus is called.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ listen: boolean }> = ({ listen }) => {
      useStoreEffect(listen ? { onFocus: () => log.push('focus') } : {});
      return null;
    };

    const renderer = await render(store, Comp, false, { listen: false });
    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    expect(log).toEqual([]);

    await update(renderer, store, Comp, false, { listen: true });
    await signal(store, 'focus', false);
    await signal(store, 'focus', true);
    expect(log).toEqual(['focus']);

    await unmount(renderer);
    await store.dispose();
  });

Bdd(feature)
  .scenario('A transition that happens while the tab is hidden is seen when the component mounts.')
  .given('The app is not focused.')
  .and('A component with onFocus mounts.')
  .when('The app is focused.')
  .then('onFocus is called, since the app went from not focused to focused while the component was mounted.')
  .run(async (_) => {
    const store = createStore();
    store.setFocused(false);
    const log: string[] = [];

    const Comp: React.FC = () => {
      useStoreEffect({ onFocus: () => log.push('focus'), onBlur: () => log.push('blur') });
      return null;
    };

    const renderer = await render(store, Comp);
    expect(log).toEqual([]);

    await signal(store, 'focus', true);
    expect(log).toEqual(['focus']);

    await unmount(renderer);
    await store.dispose();
  });

// ---------------------------------------------------------------------------------------------

class State {
  constructor(readonly text: string) {}
}

class SetText extends KissAction<State> {
  constructor(readonly text: string) { super(); }

  reduce() { return new State(this.text); }
}

/** A source that counts its starts, and lets the test set the value. */
class FakeSource {
  starts = 0;
  private _set: ((value: boolean) => void) | null = null;

  readonly source: AppSignalSource = (set) => {
    this.starts++;
    this._set = set;
    return () => { this._set = null; };
  };

  set(value: boolean) { this._set?.(value); }
}

function createStore(focusSource?: AppSignalSource, onlineSource?: AppSignalSource) {
  return new Store<State>({ initialState: new State('initial'), logger: () => {}, focusSource, onlineSource });
}

/** Tells the store that the app is focused/online or not, inside `act`, and lets React render. */
async function signal(store: Store<State>, which: Signal, value: boolean) {
  await act(async () => {
    if (which === 'focus') store.setFocused(value);
    else store.setOnline(value);
  });
  await flush();
}

function element<P extends object>(store: Store<State>, Comp: React.FC<P>, strictMode: boolean, props: P) {
  const provider = React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp, props) });
  return strictMode ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function render<P extends object>(store: Store<State>, Comp: React.FC<P>, strictMode = false, props: P = {} as P) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element(store, Comp, strictMode, props));
  });
  await flush();
  return renderer;
}

async function update<P extends object>(renderer: ReactTestRenderer, store: Store<State>, Comp: React.FC<P>, strictMode: boolean, props: P) {
  await act(async () => {
    renderer.update(element(store, Comp, strictMode, props));
  });
  await flush();
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

class SlowPersistor extends Persistor<State> {
  private _finishReading!: () => void;
  private readonly _reading = new Promise<void>(resolve => this._finishReading = resolve);

  constructor(public savedState: State | null = null) { super(); }

  finishReading() { this._finishReading(); }

  async readState(): Promise<State | null> {
    await this._reading;
    return this.savedState;
  }

  async saveInitialState(state: State) { this.savedState = state; }

  async deleteState() { this.savedState = null; }

  async persistDifference(_lastPersistedState: State | null, newState: State) { this.savedState = newState; }

  get throttle(): number | null { return null; }
}
