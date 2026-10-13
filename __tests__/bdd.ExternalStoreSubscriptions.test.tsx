/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act, Suspense, useEffect, useLayoutEffect, useState } from 'react';
import {
  KissAction,
  Store,
  StoreProvider,
  useDispatch,
  useIsStoreReady,
  useSelect,
  useStoreEffect,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// Scenario IDs C03, C06 to C12 of STATE_REFACTOR.md. C01, C02, C04 and C05 are covered by
// `bdd.UseSelectChangingSelector.test.ts`.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Subscriptions follow the lifetime of the components and providers');

class State {
  constructor(readonly count: number, readonly other: string = '') {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1, this.state.other);
  }
}

class SetOther extends KissAction<State> {
  constructor(readonly other: string) {
    super();
  }

  reduce() {
    return new State(this.state.count, this.other);
  }
}

function createStore(initialState = new State(0)) {
  return new Store<State>({ initialState, logger: () => {} });
}

/** Counts the subscriptions to the state of the store: how many were made, and how many are active. */
function countStateListeners(store: Store<State>) {
  const count = { subscribed: 0, active: 0 };
  const subscribe = store._subscribeState;
  store._subscribeState = (listener) => {
    count.subscribed++;
    count.active++;
    const unsubscribe = subscribe(listener);
    return () => {
      count.active--;
      unsubscribe();
    };
  };
  return count;
}

/** A component that shows the count and records its renders and commits. */
function counter() {
  const stats = { renders: 0, commits: [] as string[] };
  const Count: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
    stats.renders++;
    const count = useSelect((s: State) => s.count);
    useCommitProbe(stats.commits, () => `count=${count}`);
    return <>{`count=${count}`}{children}</>;
  };
  return { Count, stats };
}

Bdd(feature)
  .scenario('A parent catches up with a change its child made before the parent subscribed.')
  .given('A component that shows the count, whose child increments the count in a [Effect] effect when it mounts.')
  .when('The component is rendered.')
  .then('The child effect runs before the parent subscribes to the store, so the first commit shows the old count.')
  .and('The parent then catches up, committing the new count, with no further dispatch.')
  .example(val('Effect', 'layout'))
  .example(val('Effect', 'passive'))
  .run(async (ctx) => {
    // C03
    const useChosenEffect = ctx.example.val('Effect') === 'layout' ? useLayoutEffect : useEffect;
    const store = createStore();
    const dispatches: string[] = [];
    const Child: React.FC = () => {
      const dispatch = useDispatch();
      useChosenEffect(() => {
        dispatches.push('increment');
        dispatch(new Increment());
      }, []);
      return null;
    };
    const { Count, stats } = counter();
    const m = await mount(<StoreProvider store={store}><Count><Child /></Count></StoreProvider>);

    expect(store.state.count).toBe(1);
    expect(m.text()).toBe('count=1');
    expect(stats.commits).toEqual(['count=0', 'count=1']);
    expect(dispatches).toEqual(['increment']);
  });

Bdd(feature)
  .scenario('Rendering a consumer many times with new inline selectors does not churn its subscription.')
  .given('A mounted component that selects with an inline selector (a new function on every render).')
  .when('Its parent renders it 5 more times.')
  .then('The component subscribed to the store exactly once, and has exactly one active subscription.')
  .run(async (_) => {
    // C06
    const store = createStore();
    const listeners = countStateListeners(store);
    let rerender!: () => void;
    const Consumer: React.FC<{ tick: number }> = ({ tick }) => {
      const count = useSelect((s: State) => s.count + tick * 0);
      return <>{count}</>;
    };
    const Parent: React.FC = () => {
      const [tick, setTick] = useState(0);
      rerender = () => setTick((t) => t + 1);
      return <Consumer tick={tick} />;
    };
    await mount(<StoreProvider store={store}><Parent /></StoreProvider>);
    expect(listeners).toEqual({ subscribed: 1, active: 1 });

    for (let i = 0; i < 5; i++) await act(async () => rerender());
    expect(listeners).toEqual({ subscribed: 1, active: 1 });
  });

Bdd(feature)
  .scenario('An unmounted consumer stops listening, and a remounted one reads the latest state.')
  .given('A mounted component that shows the count.')
  .when('It is unmounted, the count changes, it is mounted again, and the count changes again.')
  .then('After the unmount, no subscription is left, and the change does not render it.')
  .and('When mounted again, it shows the latest count from its first render, and renders once for the last change.')
  .run(async (_) => {
    // C07
    const store = createStore();
    const listeners = countStateListeners(store);
    const { Count, stats } = counter();
    const element = (show: boolean) => <StoreProvider store={store}>{show ? <Count /> : null}</StoreProvider>;
    const m = await mount(element(true));
    expect(listeners.active).toBe(1);

    await m.rerender(element(false));
    expect(listeners.active).toBe(0);
    await act(async () => store.dispatch(new Increment()));
    expect(stats.renders).toBe(1);

    await m.rerender(element(true));
    expect(m.text()).toBe('count=1');
    expect(stats.renders).toBe(2);
    expect(listeners.active).toBe(1);

    await act(async () => store.dispatch(new Increment()));
    expect(m.text()).toBe('count=2');
    expect(stats.renders).toBe(3);
    expect(stats.commits).toEqual(['count=0', 'count=1', 'count=2']);
  });

Bdd(feature)
  .scenario('In StrictMode, the subscription survives the simulated unmount, and a real unmount removes it.')
  .given('A component that shows the count, mounted inside React.StrictMode.')
  .when('React simulates an unmount and mount of its effects, and later it is really unmounted.')
  .then('After mounting, exactly one subscription is active, and store changes update the component.')
  .and('After the real unmount, no subscription is active, and store changes cause no warning or render.')
  .run(async (_) => {
    // C08
    const store = createStore();
    const listeners = countStateListeners(store);
    const { Count, stats } = counter();
    const m = await mount(<StoreProvider store={store}><Count /></StoreProvider>, { strict: true });
    expect(listeners.active).toBe(1);
    expect(listeners.subscribed).toBeGreaterThanOrEqual(1);

    await act(async () => store.dispatch(new Increment()));
    expect(m.text()).toBe('count=1');

    await m.unmount();
    expect(listeners.active).toBe(0);
    const rendersAfterUnmount = stats.renders;
    await act(async () => store.dispatch(new Increment()));
    expect(stats.renders).toBe(rendersAfterUnmount);
  });

Bdd(feature)
  .scenario('A component that suspends before committing does not leave a subscription behind.')
  .given('A component that selects the count and suspends until some data arrives.')
  .when('It is rendered inside a Suspense boundary, the count changes, and later the data arrives.')
  .then('While suspended, no subscription is active.')
  .and('After it resumes and commits, exactly one subscription is active, and it shows the current count.')
  .run(async (_) => {
    // C09
    const store = createStore();
    const listeners = countStateListeners(store);
    const gate = new Deferred<void>();
    const Consumer: React.FC = () => {
      const count = useSelect((s: State) => s.count);
      if (!gate.isSettled) throw gate.promise;
      return <>{`count=${count}`}</>;
    };
    const m = await mount(
      <StoreProvider store={store}>
        <Suspense fallback={<>loading</>}><Consumer /></Suspense>
      </StoreProvider>,
    );
    expect(m.text()).toBe('loading');
    expect(listeners.active).toBe(0);

    await act(async () => store.dispatch(new Increment()));
    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(m.text()).toBe('count=1');
    expect(listeners.active).toBe(1);
  });

Bdd(feature)
  .scenario('Sibling and nested providers keep their stores apart.')
  .given('An outer provider with store A, and inside it a nested provider with store B, plus a sibling provider with store C.')
  .and('Each provider has a component that shows its count and can dispatch to its store.')
  .when('Each component dispatches an increment to its own store.')
  .then('Each component shows the count of its own store, and no other component renders.')
  .run(async (_) => {
    // C10
    const stores = { A: createStore(new State(10)), B: createStore(new State(20)), C: createStore(new State(30)) };
    const dispatchers: Record<string, (action: KissAction<State>) => void> = {};
    const renders: Record<string, number> = { A: 0, B: 0, C: 0 };
    const Consumer: React.FC<{ name: string }> = ({ name }) => {
      renders[name]++;
      dispatchers[name] = useDispatch();
      const count = useSelect((s: State) => s.count);
      return <span>{`${name}=${count};`}</span>;
    };
    const m = await mount(
      <>
        <StoreProvider store={stores.A}>
          <Consumer name="A" />
          <StoreProvider store={stores.B}><Consumer name="B" /></StoreProvider>
        </StoreProvider>
        <StoreProvider store={stores.C}><Consumer name="C" /></StoreProvider>
      </>,
    );
    expect(m.text()).toBe('A=10;B=20;C=30;');

    await act(async () => dispatchers.A(new Increment()));
    expect(m.text()).toBe('A=11;B=20;C=30;');
    expect(renders).toEqual({ A: 2, B: 1, C: 1 });

    await act(async () => dispatchers.B(new Increment()));
    expect(m.text()).toBe('A=11;B=21;C=30;');
    expect(renders).toEqual({ A: 2, B: 2, C: 1 });

    await act(async () => dispatchers.C(new Increment()));
    expect(m.text()).toBe('A=11;B=21;C=31;');
    expect(renders).toEqual({ A: 2, B: 2, C: 2 });
    expect(stores.A.state.count).toBe(11);
    expect(stores.B.state.count).toBe(21);
    expect(stores.C.state.count).toBe(31);
  });

Bdd(feature)
  .scenario('Replacing the store of a provider moves its components to the new store.')
  .given('A provider with store 1, whose component shows the count, dispatches, shows readiness and uses useStoreEffect.')
  .when('The provider is given store 2 ([How]).')
  .then('Store 1 has no active subscription left, and its useStoreEffect onUnmount ran.')
  .and('The component reads store 2 right away, dispatches to store 2, and onMount ran for store 2.')
  .and('The readiness of store 2 is shown, and updates when store 2 becomes ready.')
  .example(val('How', 'with a new key'))
  .example(val('How', 'changing the store prop'))
  .run(async (ctx) => {
    // C11
    const byKey = ctx.example.val('How') === 'with a new key';
    const store1 = createStore(new State(1));
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(200) });
    const store2 = new Store<State>({ initialState: new State(2), persistor, logger: () => {} });
    const listeners1 = countStateListeners(store1);
    const listeners2 = countStateListeners(store2);
    const log: string[] = [];
    let dispatch!: (action: KissAction<State>) => void;

    const Consumer: React.FC = () => {
      dispatch = useDispatch();
      const count = useSelect((s: State) => s.count);
      const isReady = useIsStoreReady();
      useStoreEffect({
        onMount: (s: Store<State>) => log.push(`mount:${s.state.count}`),
        onUnmount: (s: Store<State>) => log.push(`unmount:${s.state.count}`),
      });
      return <>{`count=${count},ready=${isReady}`}</>;
    };
    const element = (store: Store<State>) =>
      <StoreProvider key={byKey ? store.state.count : 'same'} store={store}><Consumer /></StoreProvider>;

    const m = await mount(element(store1));
    expect(m.text()).toBe('count=1,ready=true');
    expect(log).toEqual(['mount:1']);

    await m.rerender(element(store2));
    expect(listeners1.active).toBe(0);
    expect(listeners2.active).toBe(1);
    expect(m.text()).toBe('count=2,ready=false');
    expect(log).toEqual(['mount:1', 'unmount:1']);

    await act(async () => store1.dispatch(new Increment()));
    expect(m.text()).toBe('count=2,ready=false');

    await act(async () => {
      persistor.finishReading();
      await store2.ready();
    });
    expect(m.text()).toBe('count=200,ready=true');
    expect(log).toEqual(['mount:1', 'unmount:1', 'mount:200']);

    await act(async () => dispatch(new Increment()));
    expect(store2.state.count).toBe(201);
    expect(store1.state.count).toBe(2);
    expect(m.text()).toBe('count=201,ready=true');
  });

Bdd(feature)
  .scenario('Listeners added or removed during a notification follow a defined order.')
  .given('A store with state listeners A, B and C, where A removes B and adds D when it is notified.')
  .when('The state changes once, and then once more.')
  .then('On the first change, A and C are notified, but not B (removed before its turn) nor D (added during the notification).')
  .and('On the second change, A, C and D are notified.')
  .and('Unsubscribing twice does not remove another listener.')
  .run(async (_) => {
    // C12
    const store = createStore();
    const notified: string[] = [];
    let unsubscribeB: () => void = () => {};
    let addedD = false;
    const unsubscribeA = store._subscribeState(() => {
      notified.push('A');
      unsubscribeB();
      if (!addedD) {
        addedD = true;
        store._subscribeState(() => notified.push('D'));
      }
    });
    unsubscribeB = store._subscribeState(() => notified.push('B'));
    store._subscribeState(() => notified.push('C'));

    store.dispatch(new Increment());
    expect(notified).toEqual(['A', 'C']);

    notified.length = 0;
    store.dispatch(new Increment());
    expect(notified).toEqual(['A', 'C', 'D']);

    // Unsubscribing A twice, then subscribing E: E must still be notified (the second
    // unsubscribe of A must not remove anyone else).
    unsubscribeA();
    unsubscribeA();
    store._subscribeState(() => notified.push('E'));
    notified.length = 0;
    store.dispatch(new Increment());
    expect(notified).toEqual(['C', 'D', 'E']);
  });

Bdd(feature)
  .scenario('A listener that dispatches during a notification sees the newest state in every notification.')
  .given('A store with a state listener that dispatches a sync action the first time it is notified.')
  .and('A second listener that records the state it reads on every notification.')
  .when('The state changes.')
  .then('Both notifications read the newest state, and the second listener never reads an obsolete state.')
  .run(async (_) => {
    // C12 (nested dispatch)
    const store = createStore();
    const seen: number[] = [];
    let dispatched = false;
    store._subscribeState(() => {
      if (!dispatched) {
        dispatched = true;
        store.dispatch(new SetOther('nested'));
      }
    });
    store._subscribeState(() => seen.push(store._getState().count));

    store.dispatch(new Increment());
    expect(store.state).toEqual(new State(1, 'nested'));
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.every((count) => count === 1)).toBe(true);
  });
