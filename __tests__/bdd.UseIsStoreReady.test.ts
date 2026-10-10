import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Persistor, Store, StoreProvider, useIsStoreReady } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useIsStoreReady');

Bdd(feature)
  .scenario('A store without a persistor is ready from the first render.')
  .given('A store without a persistor.')
  .when('A component uses useIsStoreReady.')
  .then('It is true from the first render, and the component renders only once.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: () => {} });
    const results = renderRecording(store);
    await flush();
    expect(results).toEqual([true]);
  });

Bdd(feature)
  .scenario('While the persisted state is being read, the store is not ready. When it is read, it is.')
  .given('A store whose persisted state is still being read.')
  .when('A component uses useIsStoreReady.')
  .and('Later, the persisted state finishes being read.')
  .then('It is false while reading, and the component re-renders with true when reading finishes.')
  .example(val('Persisted state', 'none'))
  .example(val('Persisted state', 'some'))
  .example(val('Persisted state', 'read fails'))
  .run(async (ctx) => {
    const kind = ctx.example.val('Persisted state');
    const persistor = new SlowPersistor(kind === 'some' ? new State(42) : null);
    if (kind === 'read fails') persistor.readError = new Error('Disk error');
    // Swallows the read error, which would otherwise be thrown as an unhandled rejection.
    const store = new Store<State>({
      initialState: new State(0), persistor, logger: () => {}, errorObserver: () => null,
    });

    const results = renderRecording(store);
    await flush();
    expect(results).toEqual([false]);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });

    expect(results[results.length - 1]).toBe(true);
    expect(results.filter(r => !r).length).toBe(1);
  });

Bdd(feature)
  .scenario('A component mounted after the store is ready is ready from the first render.')
  .given('A store whose persisted state was already read.')
  .when('A component that uses useIsStoreReady is mounted.')
  .then('It is true from the first render, and the component renders only once.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(42));
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    persistor.finishReading();
    await store.ready();

    const results = renderRecording(store);
    await flush();
    expect(results).toEqual([true]);
  });

Bdd(feature)
  .scenario('When the store is ready, actions can be dispatched.')
  .given('A store whose persisted state is still being read.')
  .and('A component that dispatches an action only if useIsStoreReady is true.')
  .when('The persisted state finishes being read.')
  .then('The action is dispatched, and no error is thrown.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(42));
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });

    const Comp: React.FC = () => {
      const isReady = useIsStoreReady();
      React.useEffect(() => {
        if (isReady) store.dispatch(new Increment());
      }, [isReady]);
      return null;
    };
    act(() => {
      TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
    });
    expect(store.state.count).toBe(0);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });

    expect(store.state.count).toBe(43);
  });

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

/** Renders a component that calls `useIsStoreReady()` and records what it returns on every render. */
function renderRecording(store: Store<State>) {
  const results: boolean[] = [];
  const Comp: React.FC = () => {
    results.push(useIsStoreReady());
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
  });
  return results;
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}

class SlowPersistor extends Persistor<State> {
  readError: Error | null = null;
  private _finishReading!: () => void;
  private readonly _reading = new Promise<void>(resolve => this._finishReading = resolve);

  constructor(public savedState: State | null = null) {
    super();
  }

  finishReading() {
    this._finishReading();
  }

  async readState(): Promise<State | null> {
    await this._reading;
    if (this.readError) throw this.readError;
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(_lastPersistedState: State | null, newState: State) {
    this.savedState = newState;
  }

  get throttle(): number | null {
    return null;
  }
}
