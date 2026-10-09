import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { KissAction, Persistor, Store, StoreProvider, useDispatch } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useDispatch with onMount, onDepsChange and onUnmount');

Bdd(feature)
  .scenario('onMount is called once when the component mounts, and onUnmount once when it unmounts.')
  .given('A store that is ready.')
  .and('A component that uses useDispatch with onMount and onUnmount.')
  .when('The component mounts, re-renders, and then unmounts.')
  .then('onMount is called once, when it mounts, with the store.')
  .and('onUnmount is called once, when it unmounts, with the store.')
  .and('The actions they dispatch change the state.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = () => {
      useDispatch({
        onMount: (s: Store<State>) => {
          log.push('mount:' + (s === store));
          s.dispatch(new SetText('mounted'));
        },
        onUnmount: (s: Store<State>) => {
          log.push('unmount:' + (s === store));
          s.dispatch(new SetText('unmounted'));
        },
      });
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A'}, strictMode);
    expect(log).toEqual(['mount:true']);
    expect(store.state.text).toBe('mounted');

    await update(renderer, store, Comp, {userId: 'B'}, strictMode);
    expect(log).toEqual(['mount:true']);

    await unmount(renderer);
    expect(log).toEqual(['mount:true', 'unmount:true']);
    expect(store.state.text).toBe('unmounted');
  });

Bdd(feature)
  .scenario('useDispatch with options still returns the dispatch function.')
  .given('A component that uses useDispatch with onMount.')
  .when('The component dispatches an action with the returned function.')
  .then('The action changes the state.')
  .run(async (_) => {
    const store = createStore();
    let dispatch!: (action: KissAction<State>) => void;

    const Comp: React.FC<{ userId: string }> = () => {
      dispatch = useDispatch({onMount: () => {}});
      return null;
    };

    await render(store, Comp, {userId: 'A'});
    act(() => dispatch(new SetText('dispatched')));
    expect(store.state.text).toBe('dispatched');
  });

Bdd(feature)
  .scenario('onMount waits for the store to be ready.')
  .given('A store whose persisted state is still being read.')
  .when('A component that uses useDispatch with onMount mounts.')
  .and('Later, the persisted state finishes being read.')
  .then('onMount is not called before the store is ready.')
  .and('onMount is called when the store is ready, and sees the persisted state.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State('persisted'));
    const store = new Store<State>({initialState: new State('initial'), persistor, logger: () => {}});
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = () => {
      useDispatch({onMount: (s: Store<State>) => log.push('mount:' + s.state.text)});
      return null;
    };

    await render(store, Comp, {userId: 'A'});
    expect(log).toEqual([]);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    expect(log).toEqual(['mount:persisted']);
  });

Bdd(feature)
  .scenario('If the component unmounts before the store is ready, nothing is called.')
  .given('A store whose persisted state is still being read.')
  .and('A component that uses useDispatch with onMount and onUnmount.')
  .when('The component mounts, and unmounts before the store is ready.')
  .and('Later, the store becomes ready.')
  .then('Neither onMount nor onUnmount is called.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State('persisted'));
    const store = new Store<State>({initialState: new State('initial'), persistor, logger: () => {}});
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = () => {
      useDispatch({
        onMount: () => log.push('mount'),
        onUnmount: () => log.push('unmount'),
      });
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A'});
    await unmount(renderer);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    await flush();
    expect(log).toEqual([]);
  });

Bdd(feature)
  .scenario('onDepsChange is called with the old value when a single-value dep changes.')
  .given('A component that uses useDispatch with deps: userId, onMount and onDepsChange.')
  .when('The component re-renders with the same userId, and then with other userIds.')
  .then('onMount is called only once.')
  .and('onDepsChange is called only when the userId changes, with the old userId.')
  .and('onDepsChange sees the new userId.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = ({userId}) => {
      useDispatch({
        deps: userId,
        onMount: () => log.push('mount:' + userId),
        onDepsChange: (_s, oldUserId) => {
          const typed: string = oldUserId; // Typed as a string.
          log.push(`change:${typed}→${userId}`);
        },
      });
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A'}, strictMode);
    await update(renderer, store, Comp, {userId: 'A'}, strictMode);
    await update(renderer, store, Comp, {userId: 'B'}, strictMode);
    await update(renderer, store, Comp, {userId: 'B'}, strictMode);
    await update(renderer, store, Comp, {userId: 'C'}, strictMode);

    expect(log).toEqual(['mount:A', 'change:A→B', 'change:B→C']);
  });

Bdd(feature)
  .scenario('onDepsChange gets the old array when the deps are an array.')
  .given('A component that uses useDispatch with deps: [userId, filter].')
  .when('The userId changes, and then the filter changes.')
  .then('onDepsChange is called for each change, with the old array.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ userId: string, filter: number }> = ({userId, filter}) => {
      useDispatch({
        deps: [userId, filter],
        onMount: () => log.push(`mount:${userId},${filter}`),
        onDepsChange: (_s, [oldUserId, oldFilter]) => {
          const typedUserId: string = oldUserId; // Typed as a string.
          const typedFilter: number = oldFilter; // Typed as a number.
          if (userId !== oldUserId) log.push(`user:${typedUserId}→${userId}`);
          else if (filter !== oldFilter) log.push(`filter:${typedFilter}→${filter}`);
        },
      });
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A', filter: 1});
    await update(renderer, store, Comp, {userId: 'A', filter: 1});
    await update(renderer, store, Comp, {userId: 'B', filter: 1});
    await update(renderer, store, Comp, {userId: 'B', filter: 2});

    expect(log).toEqual(['mount:A,1', 'user:A→B', 'filter:1→2']);
  });

Bdd(feature)
  .scenario('Deps that change before the store is ready don\'t call onDepsChange.')
  .given('A store whose persisted state is still being read.')
  .and('A component that uses useDispatch with deps: userId, onMount and onDepsChange.')
  .when('The userId changes before the store is ready.')
  .and('The store becomes ready.')
  .and('Then the userId changes again.')
  .then('onMount is called once, with the latest userId.')
  .and('onDepsChange is called only for the change after onMount, with the userId onMount saw.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State('persisted'));
    const store = new Store<State>({initialState: new State('initial'), persistor, logger: () => {}});
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = ({userId}) => {
      useDispatch({
        deps: userId,
        onMount: () => log.push('mount:' + userId),
        onDepsChange: (_s, oldUserId) => log.push(`change:${oldUserId}→${userId}`),
      });
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A'});
    await update(renderer, store, Comp, {userId: 'B'});
    expect(log).toEqual([]);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    expect(log).toEqual(['mount:B']);

    await update(renderer, store, Comp, {userId: 'C'});
    expect(log).toEqual(['mount:B', 'change:B→C']);
  });

Bdd(feature)
  .scenario('onUnmount sees the values of the latest render.')
  .given('A component that uses useDispatch with onUnmount.')
  .when('The component re-renders with another userId, and then unmounts.')
  .then('onUnmount sees the latest userId.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];

    const Comp: React.FC<{ userId: string }> = ({userId}) => {
      useDispatch({onUnmount: () => log.push('unmount:' + userId)});
      return null;
    };

    const renderer = await render(store, Comp, {userId: 'A'});
    await update(renderer, store, Comp, {userId: 'B'});
    await unmount(renderer);
    expect(log).toEqual(['unmount:B']);
  });

Bdd(feature)
  .scenario('onMount can be async, and wait for actions to finish.')
  .given('A component whose onMount is async.')
  .and('onMount dispatches an async action with dispatchAndWait, and then dispatches another action.')
  .when('The component mounts.')
  .then('Both actions run, in order.')
  .run(async (_) => {
    const store = createStore();

    const Comp: React.FC<{ userId: string }> = () => {
      useDispatch({
        onMount: async (s: Store<State>) => {
          await s.dispatchAndWait(new SetTextAsync('loaded'));
          s.dispatch(new SetText(s.state.text + ' and done'));
        },
      });
      return null;
    };

    await render(store, Comp, {userId: 'A'});
    await flush();
    expect(store.state.text).toBe('loaded and done');
  });

class State {
  constructor(readonly text: string) {
  }
}

class SetText extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    return new State(this.text);
  }
}

class SetTextAsync extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 1));
    return (_: State) => new State(this.text);
  }
}

function createStore() {
  return new Store<State>({initialState: new State('initial'), logger: () => {}});
}

function element<P extends object>(store: Store<State>, Comp: React.FC<P>, props: P, strictMode: boolean) {
  const provider = React.createElement(StoreProvider<State>, {store, children: React.createElement(Comp, props)});
  return strictMode ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function render<P extends object>(store: Store<State>, Comp: React.FC<P>, props: P, strictMode = false) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element(store, Comp, props, strictMode));
  });
  await flush();
  return renderer;
}

async function update<P extends object>(
  renderer: ReactTestRenderer, store: Store<State>, Comp: React.FC<P>, props: P, strictMode = false) {
  await act(async () => {
    renderer.update(element(store, Comp, props, strictMode));
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

  constructor(public savedState: State | null = null) {
    super();
  }

  finishReading() {
    this._finishReading();
  }

  async readState(): Promise<State | null> {
    await this._reading;
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
