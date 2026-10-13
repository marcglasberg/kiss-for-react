/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act, useEffect, useState } from 'react';
import {
  KissAction,
  Store,
  StoreException,
  StoreProvider,
  useAllState,
  useDispatch,
  useIsStoreReady,
  useSelect,
  useStoreEffect,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';

// Scenario IDs E01 to E12 of STATE_REFACTOR.md. See also `bdd.UseIsStoreReady.test.ts`,
// `bdd.StoreReady.test.ts` and the `bdd.UseStoreEffect*.test.ts` files.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Readiness, persistence and the dispatch lifecycle, seen by components');

class State {
  constructor(readonly count: number, readonly name: string = 'initial') {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1, this.state.name);
  }
}

class SetName extends KissAction<State> {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return new State(this.state.count, this.name);
  }
}

/** Counts the active readiness subscriptions of the store. */
function countReadyListeners(store: Store<State>) {
  const count = { active: 0 };
  const subscribe = store._subscribeReady;
  store._subscribeReady = (listener) => {
    count.active++;
    const unsubscribe = subscribe(listener);
    return () => {
      count.active--;
      unsubscribe();
    };
  };
  return count;
}

/** A component that shows the readiness and the state, and records what it commits. */
function readyConsumer() {
  const stats = { renders: 0, commits: [] as string[] };
  const Ready: React.FC = () => {
    stats.renders++;
    const isReady = useIsStoreReady();
    const state = useAllState<State>();
    const text = `ready=${isReady},count=${state.count},name=${state.name}`;
    useCommitProbe(stats.commits, () => text);
    return <>{text}</>;
  };
  return { Ready, stats };
}

/** Finishes the reading of the persisted state, and waits for the store to be ready, inside `act`. */
async function finishReading(persistor: ControlledPersistor<State>, store: Store<State>) {
  await act(async () => {
    persistor.finishReading();
    await store.ready();
  });
}

Bdd(feature)
  .scenario('A store without a persistor is ready from the first render, and onMount runs right away.')
  .given('A store without a persistor.')
  .when('A component that shows readiness and uses useStoreEffect mounts.')
  .then('It shows ready from its first and only commit.')
  .and('onMount ran once, when it mounted.')
  .run(async (_) => {
    // E01
    const store = new Store<State>({ initialState: new State(0), logger: () => {} });
    const { Ready, stats } = readyConsumer();
    const log: string[] = [];
    const Effect: React.FC = () => {
      useStoreEffect({ onMount: () => log.push('mount') });
      return null;
    };
    await mount(<StoreProvider store={store}><Ready /><Effect /></StoreProvider>);
    expect(stats.commits).toEqual(['ready=true,count=0,name=initial']);
    expect(stats.renders).toBe(1);
    expect(log).toEqual(['mount']);
  });

Bdd(feature)
  .scenario('While the persisted state loads, the initial state is shown; then the restored state and readiness appear.')
  .given('A store with a persistor that is still reading a saved state with count 42.')
  .and('A mounted component that shows readiness and the state, with an effect that runs when ready.')
  .when('The persistor finishes reading.')
  .then('The component first committed not-ready with the initial state.')
  .and('It then commits ready with the restored state, and the effect sees the restored state.')
  .run(async (_) => {
    // E02
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(42, 'saved') });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const { Ready, stats } = readyConsumer();
    const effectSaw: string[] = [];
    const Gated: React.FC = () => {
      const isReady = useIsStoreReady();
      const count = useSelect((s: State) => s.count);
      useEffect(() => {
        if (isReady) effectSaw.push(`count=${count},store=${store.state.count}`);
      }, [isReady, count]);
      return null;
    };
    await mount(<StoreProvider store={store}><Ready /><Gated /></StoreProvider>);
    expect(stats.commits).toEqual(['ready=false,count=0,name=initial']);
    expect(effectSaw).toEqual([]);

    await finishReading(persistor, store);

    expect(stats.commits[stats.commits.length - 1]).toBe('ready=true,count=42,name=saved');
    // The restored state is never committed together with ready=true before it, nor after a
    // ready=true with the initial state.
    expect(stats.commits.some((c) => c.startsWith('ready=true,count=0'))).toBe(false);
    expect(effectSaw).toEqual(['count=42,store=42']);
  });

Bdd(feature)
  .scenario('With no saved state, the store is ready only after the initial state was saved.')
  .given('A store with a persistor that has no saved state, and whose saving of the initial state is delayed.')
  .and('A mounted component that shows readiness.')
  .when('The persistor finishes reading (with nothing), and later finishes saving the initial state.')
  .then('The component still shows not-ready after the read, since initialization is not complete.')
  .and('It shows ready after the initial state was saved.')
  .run(async (_) => {
    // E03
    const persistor = new ControlledPersistor<State>({ stateToRead: null });
    persistor.holdSaveInitialState = true;
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const { Ready, stats } = readyConsumer();
    await mount(<StoreProvider store={store}><Ready /></StoreProvider>);

    await act(async () => {
      persistor.finishReading();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(store._isReady).toBe(false);
    expect(stats.commits).toEqual(['ready=false,count=0,name=initial']);

    await act(async () => {
      persistor.finishSavingInitialState();
      await store.ready();
    });
    expect(persistor.savedInitialStates).toEqual([new State(0)]);
    expect(stats.commits).toEqual(['ready=false,count=0,name=initial', 'ready=true,count=0,name=initial']);
  });

Bdd(feature)
  .scenario('When initialization fails, the error is reported, the initial state is kept, and the store still becomes ready.')
  .given('A store with a persistor where [Failure].')
  .and('A mounted component that shows readiness and the state.')
  .when('The persistor finishes reading.')
  .then('The errors are given to the errorObserver, with no action.')
  .and('The component shows ready, with the initial state, and nothing stays pending.')
  .example(val('Failure', 'reading fails'), val('Errors', 1), val('Deletes', 1), val('Initial saves', 1))
  .example(val('Failure', 'reading and deleting fail'), val('Errors', 2), val('Deletes', 1), val('Initial saves', 1))
  .example(val('Failure', 'saving the initial state fails'), val('Errors', 1), val('Deletes', 0), val('Initial saves', 0))
  .run(async (ctx) => {
    // E04
    const failure = ctx.example.val('Failure') as string;
    const persistor = new ControlledPersistor<State>({ stateToRead: null });
    if (failure.startsWith('reading')) persistor.readError = new Error('read failed');
    if (failure === 'reading and deleting fail') persistor.deleteError = new Error('delete failed');
    if (failure === 'saving the initial state fails') persistor.saveInitialStateError = new Error('save failed');
    const observed: [string, unknown][] = [];
    const store = new Store<State>({
      initialState: new State(0), persistor, logger: () => {},
      errorObserver: ({ error, action }) => {
        observed.push([String(error), action]);
        return null;
      },
    });
    const { Ready, stats } = readyConsumer();
    await mount(<StoreProvider store={store}><Ready /></StoreProvider>);
    expect(stats.commits).toEqual(['ready=false,count=0,name=initial']);

    await finishReading(persistor, store);

    expect(observed.length).toBe(ctx.example.val('Errors'));
    expect(observed.every(([, action]) => action === null)).toBe(true);
    expect(persistor.deleteCount).toBe(ctx.example.val('Deletes'));
    expect(persistor.savedInitialStates.length).toBe(ctx.example.val('Initial saves'));
    expect(store.state).toEqual(new State(0));
    expect(stats.commits).toEqual(['ready=false,count=0,name=initial', 'ready=true,count=0,name=initial']);
  });

Bdd(feature)
  .scenario('Readiness is shown even when the restored state is the same object as the initial state.')
  .given('A store whose persistor returns the very same initial state object.')
  .and('A mounted component that shows readiness.')
  .when('The persistor finishes reading.')
  .then('The state object does not change, but the component still commits ready.')
  .run(async (_) => {
    // E05
    const initial = new State(7);
    const persistor = new ControlledPersistor<State>({ stateToRead: initial });
    const store = new Store<State>({ initialState: initial, persistor, logger: () => {} });
    const { Ready, stats } = readyConsumer();
    await mount(<StoreProvider store={store}><Ready /></StoreProvider>);

    await finishReading(persistor, store);

    expect(store.state).toBe(initial);
    expect(stats.commits).toEqual(['ready=false,count=7,name=initial', 'ready=true,count=7,name=initial']);
  });

Bdd(feature)
  .scenario('Readiness that settles before the mount, during the mount, or after the unmount is handled.')
  .given('A store with a persistor, and a component that shows readiness.')
  .when('The store becomes ready [When].')
  .then('The component shows the right value, with no missed update, no update after unmount, and no subscription left.')
  .example(val('When', 'before the component mounts'))
  .example(val('When', 'while the component is being mounted'))
  .example(val('When', 'after the component unmounts'))
  .run(async (ctx) => {
    // E06
    const when = ctx.example.val('When') as string;
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(1) });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const listeners = countReadyListeners(store);
    const { Ready, stats } = readyConsumer();

    if (when === 'before the component mounts') {
      await finishReading(persistor, store);
      await mount(<StoreProvider store={store}><Ready /></StoreProvider>);
      expect(stats.commits).toEqual(['ready=true,count=1,name=initial']);
      expect(stats.renders).toBe(1);
      expect(listeners.active).toBe(1);
      return;
    }

    if (when === 'while the component is being mounted') {
      // The reading finishes in the same `act` as the mount, after the first render.
      const FinishOnMount: React.FC = () => {
        useEffect(() => {
          persistor.finishReading();
        }, []);
        return null;
      };
      await mount(<StoreProvider store={store}><Ready /><FinishOnMount /></StoreProvider>);
      await act(async () => {
        await store.ready();
      });
      expect(stats.commits[0]).toBe('ready=false,count=0,name=initial');
      expect(stats.commits[stats.commits.length - 1]).toBe('ready=true,count=1,name=initial');
      expect(stats.commits.length).toBeLessThanOrEqual(3);
      expect(listeners.active).toBe(1);
      return;
    }

    const m = await mount(<StoreProvider store={store}><Ready /></StoreProvider>);
    expect(listeners.active).toBe(1);
    await m.unmount();
    expect(listeners.active).toBe(0);
    const renders = stats.renders;
    await finishReading(persistor, store);
    expect(store._isReady).toBe(true);
    expect(stats.renders).toBe(renders);
  });

Bdd(feature)
  .scenario('In StrictMode, a component mounted while the store is not ready shows readiness later, and onMount runs once.')
  .given('A store with a persistor that is still reading.')
  .and('A component inside React.StrictMode that shows readiness and uses useStoreEffect.')
  .when('The persistor finishes reading.')
  .then('The component shows ready with the restored state.')
  .and('onMount ran exactly once, with the restored state, and onUnmount did not run.')
  .run(async (_) => {
    // E07
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(5, 'saved') });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const log: string[] = [];
    const { Ready, stats } = readyConsumer();
    const Effect: React.FC = () => {
      useStoreEffect({
        onMount: (s: Store<State>) => log.push(`mount:${s.state.count}`),
        onUnmount: () => log.push('unmount'),
      });
      return null;
    };
    const m = await mount(<StoreProvider store={store}><Ready /><Effect /></StoreProvider>, { strict: true });
    expect(m.text()).toBe('ready=false,count=0,name=initial');
    await act(async () => {
      await Promise.resolve();
    });
    expect(log).toEqual([]);

    await finishReading(persistor, store);
    expect(m.text()).toBe('ready=true,count=5,name=saved');
    expect(stats.commits[stats.commits.length - 1]).toBe('ready=true,count=5,name=saved');
    expect(log).toEqual(['mount:5']);
  });

Bdd(feature)
  .scenario('onMount uses the callbacks of the latest render when it finally runs, and nothing runs after an early unmount.')
  .given('A store with a persistor that is still reading.')
  .and('A component with useStoreEffect whose deps and onMount change with a prop, [Case].')
  .when('The prop changes before the store is ready, and then the store becomes ready.')
  .then('[Outcome].')
  .example(val('Case', 'and it stays mounted'), val('Outcome', 'onMount runs once, with the latest prop, and onDepsChange does not run'))
  .example(val('Case', 'and it unmounts before the store is ready'), val('Outcome', 'neither onMount nor onUnmount runs'))
  .run(async (ctx) => {
    // E08
    const staysMounted = (ctx.example.val('Case') as string) === 'and it stays mounted';
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(1) });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const log: string[] = [];
    const Effect: React.FC<{ userId: string }> = ({ userId }) => {
      useStoreEffect({
        deps: userId,
        onMount: () => log.push(`mount:${userId}`),
        onDepsChange: (_s, old) => log.push(`deps:${old}->${userId}`),
        onUnmount: () => log.push(`unmount:${userId}`),
      });
      return null;
    };
    const element = (userId: string | null) =>
      <StoreProvider store={store}>{userId === null ? null : <Effect userId={userId} />}</StoreProvider>;
    const m = await mount(element('A'));
    await m.rerender(element('B'));
    expect(log).toEqual([]);

    if (!staysMounted) await m.rerender(element(null));
    await finishReading(persistor, store);
    await act(async () => {
      await Promise.resolve();
    });

    expect(log).toEqual(staysMounted ? ['mount:B'] : []);
  });

Bdd(feature)
  .scenario('onDepsChange and onUnmount see the right deps while store updates also render the component.')
  .given('A component that selects the count, and uses useStoreEffect with deps from a prop.')
  .when('The count changes (a store-driven render), then the prop changes, then the count changes again, then it unmounts.')
  .then('onDepsChange runs only for the prop change, with the old deps.')
  .and('onUnmount runs with the latest prop, and the callbacks ran in order: mount, deps, unmount.')
  .run(async (_) => {
    // E09
    const store = new Store<State>({ initialState: new State(0), logger: () => {} });
    const log: string[] = [];
    const Effect: React.FC<{ userId: string }> = ({ userId }) => {
      const count = useSelect((s: State) => s.count);
      useStoreEffect({
        deps: userId,
        onMount: () => log.push(`mount:${userId}:${count}`),
        onDepsChange: (_s, old) => log.push(`deps:${old}->${userId}:${count}`),
        onUnmount: () => log.push(`unmount:${userId}:${count}`),
      });
      return <>{count}</>;
    };
    const element = (userId: string | null) =>
      <StoreProvider store={store}>{userId === null ? null : <Effect userId={userId} />}</StoreProvider>;
    const m = await mount(element('A'));
    await act(async () => store.dispatch(new Increment()));
    expect(log).toEqual(['mount:A:0']);

    await m.rerender(element('B'));
    expect(log).toEqual(['mount:A:0', 'deps:A->B:1']);

    await act(async () => store.dispatch(new Increment()));
    expect(m.text()).toBe('2');
    expect(log).toEqual(['mount:A:0', 'deps:A->B:1']);

    await m.rerender(element(null));
    expect(log).toEqual(['mount:A:0', 'deps:A->B:1', 'unmount:B:2']);
  });

Bdd(feature)
  .scenario('Restoring the state does not persist it again, and dispatching before ready is an error.')
  .given('A store with a persistor that is still reading a saved state.')
  .and('A mounted component that dispatches with useDispatch.')
  .when('The component dispatches before the store is ready, and the persistor then finishes reading.')
  .then('The early dispatch throws a StoreException, and the state is unchanged.')
  .and('The restored state is shown, but not persisted again, and the initial state was not saved.')
  .run(async (_) => {
    // E10
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(42, 'saved') });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    let dispatch!: (action: KissAction<State>) => void;
    const { Ready, stats } = readyConsumer();
    const Dispatcher: React.FC = () => {
      dispatch = useDispatch();
      return null;
    };
    await mount(<StoreProvider store={store}><Ready /><Dispatcher /></StoreProvider>);

    expect(() => dispatch(new Increment())).toThrow(StoreException);
    expect(store.state).toEqual(new State(0));

    await finishReading(persistor, store);
    expect(stats.commits[stats.commits.length - 1]).toBe('ready=true,count=42,name=saved');
    expect(persistor.persistedStates).toEqual([]);
    expect(persistor.savedInitialStates).toEqual([]);

    await act(async () => dispatch(new Increment()));
    expect(persistor.persistedStates).toEqual([new State(43, 'saved')]);
  });

Bdd(feature)
  .scenario('Mounted components see the state reset by logOut.')
  .given('A store [Persistor], with a mounted component that shows the state, after some actions changed it.')
  .when('logOut is called with a new initial state.')
  .then('The component shows the new initial state.')
  .and('With a persistor, the saved state is deleted and the new initial state is persisted; a failure to delete is still thrown.')
  .example(val('Persistor', 'without a persistor'))
  .example(val('Persistor', 'with a persistor'))
  .example(val('Persistor', 'with a persistor that fails to delete'))
  .run(async (ctx) => {
    // E11
    const kind = ctx.example.val('Persistor') as string;
    const persistor = kind === 'without a persistor' ? undefined : new ControlledPersistor<State>({ stateToRead: null, holdRead: false });
    if (kind === 'with a persistor that fails to delete') persistor!.deleteError = new Error('delete failed');
    const observed: unknown[] = [];
    const store = new Store<State>({
      initialState: new State(0), persistor, logger: () => {},
      errorObserver: ({ error }) => {
        observed.push(String(error));
        return error;
      },
    });
    await store.ready();
    const { Ready, stats } = readyConsumer();
    const m = await mount(<StoreProvider store={store}><Ready /></StoreProvider>);
    await act(async () => store.dispatch(new SetName('user')));
    expect(m.text()).toBe('ready=true,count=0,name=user');

    let thrown: unknown = null;
    await act(async () => {
      await store.logOut({ initialState: new State(100, 'fresh'), throttle: 0, actionsThrottle: 0 }).catch((e) => thrown = e);
    });

    expect(m.text()).toBe('ready=true,count=100,name=fresh');
    expect(stats.commits[stats.commits.length - 1]).toBe('ready=true,count=100,name=fresh');
    if (persistor !== undefined) {
      expect(persistor.deleteCount).toBe(1);
      expect(persistor.savedState).toEqual(new State(100, 'fresh'));
    }
    if (kind === 'with a persistor that fails to delete') {
      expect(String(thrown)).toContain('delete failed');
      expect(observed).toEqual(['Error: delete failed']);
    } else {
      expect(thrown).toBeNull();
      expect(observed).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A state change seen by a component is also persisted and releases the code waiting for it.')
  .given('A ready store with a persistor, a mounted component that shows the count, and code waiting for count 1 and for the action to finish.')
  .when('An action increments the count.')
  .then('The component shows 1, the new state is persisted once, and both waits are released.')
  .run(async (_) => {
    // E12
    const persistor = new ControlledPersistor<State>({ stateToRead: null, holdRead: false });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    await store.ready();
    const { Ready, stats } = readyConsumer();
    const m = await mount(<StoreProvider store={store}><Ready /></StoreProvider>);

    const released: string[] = [];
    const stateWait = store.waitCondition((s) => s.count === 1, { timeoutMillis: 1000 }).then(() => released.push('state'));
    const actionWait = store.waitAnyActionTypeFinishes([Increment], { timeoutMillis: 1000 }).then(() => released.push('action'));

    await act(async () => {
      store.dispatch(new Increment());
      await Promise.all([stateWait, actionWait]);
    });

    expect(m.text()).toBe('ready=true,count=1,name=initial');
    expect(stats.commits).toEqual(['ready=true,count=0,name=initial', 'ready=true,count=1,name=initial']);
    expect(persistor.persistedStates).toEqual([new State(1)]);
    expect(released.sort()).toEqual(['action', 'state']);
  });

Bdd(feature)
  .scenario('A component mounted before the store is ready can dispatch as soon as it is ready.')
  .given('A store with a persistor that is still reading.')
  .and('A mounted component that dispatches an action in an effect when readiness becomes true.')
  .when('The persistor finishes reading.')
  .then('The action is dispatched once, after the restored state was applied, and no error is thrown.')
  .run(async (_) => {
    // E02 companion (reused from `bdd.UseIsStoreReady.test.ts`, with the DOM harness).
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(42) });
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });
    const dispatched: number[] = [];
    const Comp: React.FC = () => {
      const isReady = useIsStoreReady();
      const [, setTick] = useState(0);
      useEffect(() => {
        if (isReady) {
          dispatched.push(store.state.count);
          store.dispatch(new Increment());
          setTick(1);
        }
      }, [isReady]);
      return null;
    };
    await mount(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(dispatched).toEqual([]);

    await finishReading(persistor, store);
    expect(dispatched).toEqual([42]);
    expect(store.state.count).toBe(43);
  });
