import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  KissAction,
  Store,
  StoreProvider,
  useAllState,
  useExceptionFor,
  useIsFailed,
  useIsStoreReady,
  useIsWaiting,
  useObject,
  useSelect,
  useStoreEffect,
  UserException,
} from '../src';
import { ESSerializer } from '../src/Esserializer';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// Scenario IDs H01, H02, H06, H07 and H09 of STATE_REFACTOR.md. This file runs in the default
// Node environment, with no DOM, as a server does. Hydration is in `bdd.ExternalStoreHydration`.

reporter(new FeatureFileReporter());

const feature = new Feature('Rendering on the server');

let consoleErrors: string[] = [];
let spies: jest.SpyInstance[] = [];

beforeEach(() => {
  consoleErrors = [];
  spies = (['error', 'warn'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    }));
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  expect(consoleErrors).toEqual([]);
});

class Tag {
  constructor(readonly name: string) {}

  label() {
    return `#${this.name}`;
  }
}

class State {
  constructor(readonly name: string, readonly age: number, readonly tags: ReadonlyMap<string, Tag> = new Map()) {}

  tagLabels(): string {
    return Array.from(this.tags.values()).map((t) => t.label()).join(',');
  }
}

class SetName extends KissAction<State> {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return new State(this.name, this.state.age, this.state.tags);
  }
}

class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return null;
  }
}

class Fail extends KissAction<State> {
  reduce(): State {
    throw new UserException('failed on the server');
  }
}

/** A component that uses every hook that reads the store. */
const Everything: React.FC = () => {
  const name = useSelect((s: State) => s.name);
  const user = useObject((s: State) => ({ name: s.name, age: s.age }));
  const all = useAllState<State>();
  const isWaiting = useIsWaiting(Load);
  const isFailed = useIsFailed(Fail);
  const error = useExceptionFor(Fail);
  const isReady = useIsStoreReady();
  return (
    <div>
      {`name=${name};user=${user.name}/${user.age};all=${all.name};` +
        `waiting=${isWaiting};failed=${isFailed};error=${error?.message ?? '-'};ready=${isReady}`}
    </div>
  );
};

function createStore(initialState = new State('Mary', 30)) {
  return new Store<State>({ initialState, logger: () => {}, showUserException: () => {} });
}

Bdd(feature)
  .scenario('Every hook renders on the server, with no DOM and no missing server snapshot.')
  .given('A store, and a component using useSelect, useObject, useAllState, useIsWaiting, useIsFailed, useExceptionFor and useIsStoreReady.')
  .when('The component is rendered to a string, in an environment with no window or document.')
  .then('The HTML shows the state, no waiting or failed action, and the store as ready.')
  .and('No error or warning is logged.')
  .run(async (_) => {
    // H01
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    const store = createStore();

    const html = renderToString(<StoreProvider store={store}><Everything /></StoreProvider>);

    expect(html).toBe('<div>name=Mary;user=Mary/30;all=Mary;waiting=false;failed=false;error=-;ready=true</div>');
  });

Bdd(feature)
  .scenario('The server renders the state given as serverState, or the initial state of the store if none is given.')
  .given('A store created with the name Mary, where an action then changed the name to Anna before rendering.')
  .when('The component is rendered to a string with serverState={store.state}, and again without serverState.')
  .then('With serverState, the HTML shows Anna, the state at render time.')
  .and('Without it, the HTML shows Mary, the initial state the store was created with.')
  .run(async (_) => {
    // H02
    const store = createStore();
    store.dispatch(new SetName('Anna'));
    expect(store.state.name).toBe('Anna');

    const Name: React.FC = () => <span>{useSelect((s: State) => s.name)}</span>;
    const withServerState = renderToString(
      <StoreProvider store={store} serverState={store.state}><Name /></StoreProvider>);
    const withoutServerState = renderToString(<StoreProvider store={store}><Name /></StoreProvider>);

    expect(withServerState).toBe('<span>Anna</span>');
    expect(withoutServerState).toBe('<span>Mary</span>');
  });

Bdd(feature)
  .scenario('Two requests with their own stores do not share state, status or readiness.')
  .given('Store 1 with name Mary, a failed action and a running action; and store 2 with name Bob and a persistor still reading.')
  .when('Each store is rendered to a string, one after the other, and then store 1 again.')
  .then('Each HTML shows its own state.')
  .and('The server HTML never shows a waiting or failed action, and always shows the store as ready, as documented.')
  .run(async (_) => {
    // H06
    const store1 = createStore(new State('Mary', 30));
    store1.dispatch(new Fail());
    expect(store1.isFailed(Fail)).toBe(true);
    const finish = new Deferred<void>();
    store1.dispatch(new Load(finish.promise));
    expect(store1.isWaiting(Load)).toBe(true);

    const persistor = new ControlledPersistor<State>({ stateToRead: null });
    const store2 = new Store<State>({ initialState: new State('Bob', 40), persistor, logger: () => {} });
    expect(store2._isReady).toBe(false);

    const html1 = renderToString(<StoreProvider store={store1}><Everything /></StoreProvider>);
    const html2 = renderToString(<StoreProvider store={store2}><Everything /></StoreProvider>);
    const html1Again = renderToString(<StoreProvider store={store1}><Everything /></StoreProvider>);

    expect(html1).toBe('<div>name=Mary;user=Mary/30;all=Mary;waiting=false;failed=false;error=-;ready=true</div>');
    expect(html2).toBe('<div>name=Bob;user=Bob/40;all=Bob;waiting=false;failed=false;error=-;ready=true</div>');
    expect(html1Again).toBe(html1);

    finish.resolve();
    await store1.waitAllActions([]);
    persistor.finishReading();
    await store2.ready();
  });

Bdd(feature)
  .scenario('A class-based state with a Map can be rendered on the server, transferred, and restored with its methods.')
  .given('A server store whose state is a class instance with a Map of class instances.')
  .when('The server renders it, serializes the state, and a client store is created from the restored state.')
  .then('The server HTML uses the class methods.')
  .and('The restored state is a State instance whose Map holds Tag instances, and a client store renders the same HTML.')
  .run(async (_) => {
    // H07: the transfer uses the serializer behind ClassPersistor, in the test. An app can use
    // its own serialization, as long as it rebuilds the same state on the client.
    const serverState = new State('Mary', 30, new Map([['a', new Tag('alpha')], ['b', new Tag('beta')]]));
    const serverStore = createStore(serverState);
    const Tags: React.FC = () => <span>{useSelect((s: State) => s.tagLabels())}</span>;

    const html = renderToString(<StoreProvider store={serverStore}><Tags /></StoreProvider>);
    expect(html).toBe('<span>#alpha,#beta</span>');

    const transferred = ESSerializer.serialize(serverStore.state);
    const restored: State = ESSerializer.deserialize(transferred, [State, Tag]);
    expect(restored).toBeInstanceOf(State);
    expect(restored.tags.get('b')).toBeInstanceOf(Tag);
    expect(restored.tagLabels()).toBe('#alpha,#beta');

    const clientStore = createStore(restored);
    expect(renderToString(<StoreProvider store={clientStore}><Tags /></StoreProvider>)).toBe(html);
  });

Bdd(feature)
  .scenario('A server render leaves nothing behind: no subscription, no effect, no dispatched action.')
  .given('A store, and a component using the state, status and readiness hooks, plus useStoreEffect with onMount.')
  .when('The component is rendered to a string, and the result is discarded.')
  .then('The store has no state, status or readiness subscription.')
  .and('onMount was not called, and no action was dispatched.')
  .run(async (_) => {
    // H09
    const store = createStore();
    const counts = { state: 0, status: 0, ready: 0 };
    for (const [key, name] of [['state', '_subscribeState'], ['status', '_subscribeStatus'], ['ready', '_subscribeReady']] as const) {
      const subscribe = store[name];
      store[name] = (listener) => {
        counts[key]++;
        return subscribe(listener);
      };
    }
    const mounts: string[] = [];
    const Effect: React.FC = () => {
      useStoreEffect({ onMount: (s: Store<State>) => {
        mounts.push('mount');
        s.dispatch(new SetName('mounted'));
      } });
      return null;
    };

    renderToString(<StoreProvider store={store}><Everything /><Effect /></StoreProvider>);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(counts).toEqual({ state: 0, status: 0, ready: 0 });
    expect(mounts).toEqual([]);
    expect(store.dispatchCount).toBe(0);
    expect(store.state.name).toBe('Mary');
  });
