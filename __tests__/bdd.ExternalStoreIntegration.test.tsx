/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import {
  KissAction,
  OptimisticCommand,
  OptimisticSync,
  Poll,
  Store,
  StoreProvider,
  useAllState,
  useDispatch,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  useObject,
  useSelect,
  useStore,
  UserException,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// Scenario IDs I01 to I08 of STATE_REFACTOR.md. I09 to I12 are build, packaging and platform
// checks: see `build.esm.test.ts`, `scripts/pack-smoke.cjs` and the CI workflow.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Core features keep working with mounted components');

class State {
  constructor(readonly count: number, readonly text: string = '', readonly liked: boolean = false) {}

  copy(changes: Partial<State>): State {
    return new State(changes.count ?? this.count, changes.text ?? this.text, changes.liked ?? this.liked);
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return this.state.copy({ count: this.state.count + 1 });
  }
}

class Add extends KissAction<State> {
  constructor(readonly value: number) {
    super();
  }

  reduce() {
    return this.state.copy({ count: this.state.count + this.value });
  }
}

class SetText extends KissAction<State> {
  constructor(readonly text: string) {
    super();
  }

  reduce() {
    return this.state.copy({ text: this.text });
  }
}

class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void>, readonly fails = false) {
    super();
  }

  async reduce() {
    await this.finish;
    if (this.fails) throw new UserException('Load failed.');
    return (state: State) => state.copy({ count: state.count + 1 });
  }
}

function createStore(initialState = new State(0), persistor?: ControlledPersistor<State>) {
  return new Store<State>({ initialState, persistor, logger: () => {}, showUserException: () => {} });
}

/** A component showing the count and whether an action type is in progress, recording commits. */
function consumer(type: abstract new (...args: any[]) => KissAction<State> = Load) {
  const stats = { renders: 0, commits: [] as string[] };
  const Consumer: React.FC = () => {
    stats.renders++;
    const count = useSelect((s: State) => s.count);
    const isWaiting = useIsWaiting(type);
    const text = `count=${count},waiting=${isWaiting}`;
    useCommitProbe(stats.commits, () => text);
    return <span>{text}</span>;
  };
  return { Consumer, stats, last: () => stats.commits[stats.commits.length - 1] };
}

function countListeners(store: Store<State>) {
  const counts = { state: 0, status: 0, ready: 0 };
  for (const [key, name] of [['state', '_subscribeState'], ['status', '_subscribeStatus'], ['ready', '_subscribeReady']] as const) {
    const subscribe = store[name];
    store[name] = (listener) => {
      counts[key]++;
      const unsubscribe = subscribe(listener);
      return () => {
        counts[key]--;
        unsubscribe();
      };
    };
  }
  return counts;
}

Bdd(feature)
  .scenario('A component that only dispatches does not subscribe to the store, and gets stable functions.')
  .given('A mounted component that uses useDispatch and useStore, but no state or status hook.')
  .when('The state changes, an action runs and fails, and its error is cleared.')
  .then('The component never renders again, and has no subscription to the state, the status or the readiness.')
  .and('The functions it got are the same on every render.')
  .run(async (_) => {
    // I01 (see also `bdd.StableHookFunctions.test.ts`)
    const store = createStore();
    const listeners = countListeners(store);
    const seen: unknown[][] = [];
    let rerender!: () => void;
    const Dispatcher: React.FC = () => {
      const [, setTick] = React.useState(0);
      rerender = () => setTick((t) => t + 1);
      const dispatch = useDispatch();
      const dispatchers = useStore();
      seen.push([dispatch, dispatchers, dispatchers.dispatch]);
      return null;
    };
    await mount(<StoreProvider store={store}><Dispatcher /></StoreProvider>);

    const finish = new Deferred<void>();
    await act(async () => {
      store.dispatch(new Increment());
      store.dispatch(new Load(finish.promise, true));
      finish.resolve();
      await store.waitAllActions([]);
      store.clearExceptionFor(Load);
    });
    expect(seen.length).toBe(1);
    expect(listeners).toEqual({ state: 0, status: 0, ready: 0 });

    await act(async () => rerender());
    expect(seen.length).toBe(2);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[1][0]).toBe(seen[0][0]);
    expect(seen[1][1]).toBe(seen[0][1]);
  });

Bdd(feature)
  .scenario('The dispatch and wait methods of useStore work when destructured, with a mounted consumer.')
  .given('A mounted consumer of the count, and a component that destructures the methods of useStore.')
  .when('It uses dispatch, dispatchSync, dispatchAll, dispatchAndWait, dispatchAndWaitAll, dispatchWhen and waitCondition.')
  .then('Each one changes the state as expected, the promises resolve with the right values, and the consumer shows the final count.')
  .run(async (_) => {
    // I02 (see also `bdd.UseStoreDestructuring.test.ts`)
    const store = createStore();
    const c = consumer();
    let methods!: ReturnType<typeof useStore>;
    const Methods: React.FC = () => {
      methods = useStore();
      return null;
    };
    const m = await mount(<StoreProvider store={store}><c.Consumer /><Methods /></StoreProvider>);
    const { dispatch, dispatchSync, dispatchAll, dispatchAndWait, dispatchAndWaitAll, dispatchWhen, waitCondition } = methods;

    await act(async () => {
      dispatch(new Add(1));
      dispatchSync(new Add(10));
      const actions = dispatchAll([new Add(100), new Add(1000)]);
      expect(actions.length).toBe(2);
      const status = await dispatchAndWait(new Add(10000));
      expect(status.isCompletedOk).toBe(true);
      const finished = await dispatchAndWaitAll([new Add(100000), new Add(1000000)]);
      expect(finished.length).toBe(2);
      dispatchWhen(new SetText('reached'), (s: State) => s.count >= 2000000, { timeoutMillis: 1000 });
      const trigger = waitCondition((s: State) => s.text === 'reached', { timeoutMillis: 1000 });
      dispatch(new Add(1000000));
      expect(await trigger).toBeInstanceOf(SetText);
    });

    expect(store.state.count).toBe(2111111);
    expect(store.state.text).toBe('reached');
    expect(m.text()).toBe('count=2111111,waiting=false');
  });

Bdd(feature)
  .scenario('A state change seen by a component also triggers dispatchWhen and the state waiters, in order, with persistence.')
  .given('A ready store with a persistor, a mounted consumer, a dispatchWhen waiting for count 1, and a waitCondition for count 1.')
  .when('An action sets the count to 1.')
  .then('The dispatchWhen action runs right after, so the consumer shows the result of both.')
  .and('The persistor saw the state with count 1 before the state changed by the dispatchWhen action, and the waiter was released with the triggering action.')
  .run(async (_) => {
    // I03
    const persistor = new ControlledPersistor<State>({ stateToRead: null, holdRead: false });
    const store = createStore(new State(0), persistor);
    await store.ready();
    const c = consumer();
    const m = await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
    const observed: string[] = [];
    store.dispatchWhen(new SetText('when'), (s) => s.count === 1, { timeoutMillis: 1000 });
    const wait = store.waitCondition((s) => s.count === 1, { timeoutMillis: 1000 }).then((a) => observed.push(`wait:${a?.constructor.name}`));

    await act(async () => {
      store.dispatch(new Increment());
      await wait;
    });

    expect(observed).toEqual(['wait:Increment']);
    expect(store.state).toEqual(new State(1, 'when'));
    expect(m.text()).toBe('count=1,waiting=false');
    expect(persistor.persistedStates).toEqual([new State(1), new State(1, 'when')]);
    expect(c.stats.commits).toEqual(['count=0,waiting=false', 'count=1,waiting=false']);
  });

Bdd(feature)
  .scenario('When an observer dispatches another action during a state change, the newest state wins everywhere.')
  .given('A store whose state observer dispatches SetText once, when the count becomes 1, and a mounted consumer of the whole state.')
  .when('An action increments the count.')
  .then('The observer saw the increment first, and then the SetText.')
  .and('The store and the consumer end with the newest state: count 1 and the text.')
  .run(async (_) => {
    // I04
    const observed: string[] = [];
    let dispatched = false;
    const store = new Store<State>({
      initialState: new State(0), logger: () => {},
      stateObserver: (action, _prev, next) => {
        observed.push(`${action.constructor.name}:${next.count}:${next.text}`);
        if (!dispatched && next.count === 1) {
          dispatched = true;
          store.dispatch(new SetText('nested'));
        }
      },
    });
    const commits: string[] = [];
    const All: React.FC = () => {
      const state = useAllState<State>();
      useCommitProbe(commits, () => `${state.count}:${state.text}`);
      return <span>{`${state.count}:${state.text}`}</span>;
    };
    const m = await mount(<StoreProvider store={store}><All /></StoreProvider>);

    await act(async () => store.dispatch(new Increment()));

    expect(observed).toEqual(['Increment:1:', 'SetText:1:nested']);
    expect(store.state).toEqual(new State(1, 'nested'));
    expect(m.text()).toBe('1:nested');
    expect(commits[commits.length - 1]).toBe('1:nested');
  });

Bdd(feature)
  .scenario('Actions with retry, debounce, throttle, fresh, nonReentrant, sequential and ignoreOld keep their rules, and the UI follows the accepted updates.')
  .given('A mounted consumer of the count and the waiting status of the action type with [Feature].')
  .when('[When].')
  .then('[Then].')
  .example(val('Feature', 'retry'), val('When', 'The action fails once and then succeeds'), val('Then', 'The spinner stays on through the retry, and the count is 1'))
  .example(val('Feature', 'debounce'), val('When', 'The action is dispatched 3 times quickly'), val('Then', 'Only the last one runs, and the consumer commits the count once'))
  .example(val('Feature', 'throttle'), val('When', 'The action is dispatched 3 times quickly'), val('Then', 'Only the first one runs, and the consumer commits the count once'))
  .example(val('Feature', 'fresh'), val('When', 'The action is dispatched 3 times quickly'), val('Then', 'Only the first one runs, and the consumer commits the count once'))
  .example(val('Feature', 'nonReentrant'), val('When', 'The action is dispatched again while running'), val('Then', 'The second one is aborted, and the spinner stays on until the first finishes'))
  .example(val('Feature', 'sequential'), val('When', 'Two actions are dispatched, and then finish one at a time'), val('Then', 'The second only runs after the first, and the consumer commits 1 (still waiting) then 2'))
  .example(val('Feature', 'ignoreOld'), val('When', 'Two actions are dispatched, and the first finishes after the second'), val('Then', 'The result of the first is ignored, and the consumer shows the result of the second'))
  .run(async (ctx) => {
    // I05
    const feature = ctx.example.val('Feature') as string;
    const store = createStore();

    if (feature === 'retry') {
      // The second attempt waits for the test, so the spinner is checked while the action retries.
      const secondAttempt = new Deferred<void>();
      class Retrying extends KissAction<State> {
        retry = { initialDelay: 1, multiplier: 1, maxRetries: 3 };
        runs = 0;

        async reduce() {
          this.runs++;
          if (this.runs === 1) throw new UserException('first try fails');
          await secondAttempt.promise;
          return (state: State) => state.copy({ count: state.count + 1 });
        }
      }
      const c = consumer(Retrying);
      await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
      const action = new Retrying();
      await act(async () => store.dispatch(action));
      expect(c.last()).toBe('count=0,waiting=true');
      await act(async () => {
        secondAttempt.resolve();
        await store.waitAllActions([action], { completeImmediately: true });
      });
      expect(action.runs).toBe(2);
      expect(c.stats.commits).toEqual(['count=0,waiting=false', 'count=0,waiting=true', 'count=1,waiting=false']);
      return;
    }

    if (feature === 'debounce' || feature === 'throttle' || feature === 'fresh') {
      class Limited extends KissAction<State> {
        debounce = feature === 'debounce' ? 20 : false;
        throttle = feature === 'throttle' ? 1000 : false;
        fresh = feature === 'fresh' ? 1000 : false;

        constructor(readonly value: number) {
          super();
        }

        reduce() {
          return this.state.copy({ count: this.state.count + this.value });
        }
      }
      const c = consumer(Limited);
      const m = await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
      await act(async () => {
        store.dispatch(new Limited(1));
        store.dispatch(new Limited(10));
        store.dispatch(new Limited(100));
        await new Promise((resolve) => setTimeout(resolve, 50));
        await store.waitAllActions([], { completeImmediately: true });
      });
      expect(m.text()).toBe(feature === 'debounce' ? 'count=100,waiting=false' : 'count=1,waiting=false');
      expect(c.stats.commits.filter((commit) => commit.startsWith('count=') && !commit.startsWith('count=0')).length).toBe(1);
      store.clearInternalActionProps();
      return;
    }

    if (feature === 'nonReentrant') {
      class Save extends KissAction<State> {
        nonReentrant = true;

        constructor(readonly finish: Promise<void>) {
          super();
        }

        async reduce() {
          await this.finish;
          return (state: State) => state.copy({ count: state.count + 1 });
        }
      }
      const c = consumer(Save);
      await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
      const finish = new Deferred<void>();
      const first = new Save(finish.promise);
      const second = new Save(finish.promise);
      await act(async () => store.dispatch(first));
      let status!: { isDispatchAborted: boolean };
      await act(async () => {
        status = await store.dispatchAndWait(second);
      });
      expect(status.isDispatchAborted).toBe(true);
      expect(second.status.isDispatched).toBe(false);
      expect(c.last()).toBe('count=0,waiting=true');
      await act(async () => {
        finish.resolve();
        await store.waitAllActions([]);
      });
      expect(c.stats.commits).toEqual(['count=0,waiting=false', 'count=0,waiting=true', 'count=1,waiting=false']);
      return;
    }

    if (feature === 'sequential') {
      class Step extends KissAction<State> {
        sequential = true;

        constructor(readonly finish: Promise<void>) {
          super();
        }

        async reduce() {
          await this.finish;
          return (state: State) => state.copy({ count: state.count + 1 });
        }
      }
      const c = consumer(Step);
      await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
      const finish1 = new Deferred<void>();
      const finish2 = new Deferred<void>();
      const first = new Step(finish1.promise);
      const second = new Step(finish2.promise);
      await act(async () => {
        store.dispatch(first);
        store.dispatch(second);
      });
      expect(c.last()).toBe('count=0,waiting=true');
      await act(async () => {
        finish1.resolve();
        await store.waitAllActions([first]);
      });
      expect(c.last()).toBe('count=1,waiting=true');
      await act(async () => {
        finish2.resolve();
        await store.waitAllActions([]);
      });
      expect(c.stats.commits).toEqual([
        'count=0,waiting=false', 'count=0,waiting=true', 'count=1,waiting=true', 'count=2,waiting=false']);
      return;
    }

    // ignoreOld
    class LoadText extends KissAction<State> {
      ignoreOld = true;

      constructor(readonly finish: Promise<void>, readonly text: string) {
        super();
      }

      async reduce() {
        await this.finish;
        return (state: State) => state.copy({ text: this.text, count: state.count + 1 });
      }
    }
    const commits: string[] = [];
    const Text: React.FC = () => {
      const text = useSelect((s: State) => s.text);
      const count = useSelect((s: State) => s.count);
      useCommitProbe(commits, () => `${text}:${count}`);
      return <span>{`${text}:${count}`}</span>;
    };
    const m = await mount(<StoreProvider store={store}><Text /></StoreProvider>);
    const finish1 = new Deferred<void>();
    const finish2 = new Deferred<void>();
    await act(async () => {
      store.dispatch(new LoadText(finish1.promise, 'old'));
      store.dispatch(new LoadText(finish2.promise, 'new'));
    });
    await act(async () => {
      finish2.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(m.text()).toBe('new:1');
    await act(async () => {
      finish1.resolve();
      await store.waitAllActions([], { completeImmediately: true });
    });
    expect(m.text()).toBe('new:1');
    expect(commits).toEqual([':0', 'new:1']);
  });

Bdd(feature)
  .scenario('Polling runs the action repeatedly, and mounted consumers follow each accepted update.')
  .given('A mounted consumer of the count, and an action that polls every 10 milliseconds.')
  .when('Polling starts, runs a few times, and is stopped.')
  .then('The consumer shows the count growing, and stops growing after the polling stops.')
  .run(async (_) => {
    // I05 (polling)
    const store = createStore();
    class Tick extends KissAction<State> {
      pollInterval = 10;

      constructor(readonly poll = Poll.once) {
        super();
      }

      createPollingAction() {
        return new Tick();
      }

      reduce() {
        return this.state.copy({ count: this.state.count + 1 });
      }
    }
    const c = consumer(Tick);
    const m = await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);

    await act(async () => {
      store.dispatch(new Tick(Poll.start));
      await store.waitCondition((s) => s.count >= 3, { timeoutMillis: 2000 });
      store.dispatch(new Tick(Poll.stop));
    });
    const countAfterStop = store.state.count;
    expect(countAfterStop).toBeGreaterThanOrEqual(3);
    expect(m.text()).toBe(`count=${countAfterStop},waiting=false`);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(store.state.count).toBe(countAfterStop);
    expect(m.text()).toBe(`count=${countAfterStop},waiting=false`);
  });

Bdd(feature)
  .scenario('An optimistic command updates the UI right away, and keeps or rolls back the value when the server answers.')
  .given('A mounted component showing the text, whether SaveText is waiting, and whether it failed, plus a consumer of the count.')
  .when('A SaveText command is dispatched, and the server [Outcome].')
  .then('The text changes right away, with the spinner on; then [Then].')
  .and('The count consumer never renders again.')
  .example(val('Outcome', 'succeeds'), val('Then', 'the new text stays, and the spinner goes off'))
  .example(val('Outcome', 'fails'), val('Then', 'the text rolls back while the command finishes, then the spinner goes off and the command shows as failed'))
  .run(async (ctx) => {
    // I06 (OptimisticCommand)
    const fails = ctx.example.val('Outcome') === 'fails';
    const store = createStore(new State(0, 'old'));
    const server = new Deferred<void>();
    class SaveText extends OptimisticCommand<State, string> {
      optimisticValue() {
        return 'new';
      }

      getValueFromState(state: State) {
        return state.text;
      }

      applyValueToState(state: State, value: string) {
        return state.copy({ text: value });
      }

      async sendCommandToServer() {
        await server.promise;
        if (fails) throw new UserException('Server refused.');
      }
    }
    const commits: string[] = [];
    const Text: React.FC = () => {
      const text = useSelect((s: State) => s.text);
      const isWaiting = useIsWaiting(SaveText);
      const isFailed = useIsFailed(SaveText);
      const line = `${text},waiting=${isWaiting},failed=${isFailed}`;
      useCommitProbe(commits, () => line);
      return <span>{line}</span>;
    };
    const countRenders = { count: 0 };
    const Count: React.FC = () => {
      countRenders.count++;
      return <i>{useSelect((s: State) => s.count)}</i>;
    };
    await mount(<StoreProvider store={store}><Text /><Count /></StoreProvider>);

    await act(async () => store.dispatch(new SaveText()));
    expect(commits[commits.length - 1]).toBe('new,waiting=true,failed=false');

    await act(async () => {
      server.resolve();
      await store.waitAllActions([]);
    });
    // When the command fails, the rollback is applied before the command finishes failing, so
    // the rolled back text may be committed while the command still waits (a valid intermediate
    // state, which React may or may not render separately, since both happen in the same flush).
    if (fails) {
      const valid = ['old,waiting=false,failed=false', 'new,waiting=true,failed=false', 'old,waiting=true,failed=false', 'old,waiting=false,failed=true'];
      expect(commits.slice(0, 2)).toEqual(valid.slice(0, 2));
      expect(commits[commits.length - 1]).toBe('old,waiting=false,failed=true');
      expect(commits.every((c) => valid.includes(c))).toBe(true);
      expect(commits.length).toBeLessThanOrEqual(4);
    } else {
      expect(commits).toEqual(['old,waiting=false,failed=false', 'new,waiting=true,failed=false', 'new,waiting=false,failed=false']);
    }
    expect(countRenders.count).toBe(1);
  });

Bdd(feature)
  .scenario('An optimistic sync applies each toggle right away, and the UI follows the value the server confirms.')
  .given('A mounted component showing whether the item is liked, and whether ToggleLike is waiting.')
  .when('ToggleLike is dispatched twice quickly, and the server confirms the final value.')
  .then('The UI shows liked, then not liked, right away; then the spinner goes off with the confirmed value.')
  .run(async (_) => {
    // I06 (OptimisticSync, the push-based variant shares this machinery: see `bdd.OptimisticSyncWithPush.test.ts`)
    const store = createStore(new State(0, '', false));
    const requests: Deferred<void>[] = [];
    class ToggleLike extends OptimisticSync<State, boolean> {
      valueToApply() {
        return !this.state.liked;
      }

      applyOptimisticValueToState(state: State, liked: boolean) {
        return state.copy({ liked });
      }

      getValueFromState(state: State) {
        return state.liked;
      }

      async sendValueToServer() {
        const request = new Deferred<void>();
        requests.push(request);
        await request.promise;
      }
    }
    const commits: string[] = [];
    const Like: React.FC = () => {
      const liked = useSelect((s: State) => s.liked);
      const isWaiting = useIsWaiting(ToggleLike);
      const line = `liked=${liked},waiting=${isWaiting}`;
      useCommitProbe(commits, () => line);
      return <span>{line}</span>;
    };
    await mount(<StoreProvider store={store}><Like /></StoreProvider>);

    await act(async () => store.dispatch(new ToggleLike()));
    await act(async () => store.dispatch(new ToggleLike()));
    expect(commits[commits.length - 1]).toBe('liked=false,waiting=true');

    // The second toggle waits for the first request to finish, and is then sent as a new request.
    await act(async () => {
      expect(requests.length).toBe(1);
      requests[0].resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requests.length).toBe(2);
      requests[1].resolve();
      await store.waitAllActions([], { completeImmediately: true });
    });
    expect(store.state.liked).toBe(false);
    expect(commits[0]).toBe('liked=false,waiting=false');
    expect(commits[1]).toBe('liked=true,waiting=true');
    expect(commits[2]).toBe('liked=false,waiting=true');
    expect(commits[commits.length - 1]).toBe('liked=false,waiting=false');
  });

Bdd(feature)
  .scenario('Shutting down the store while an action runs lets it finish, and the UI shows its result; later dispatches are ignored.')
  .given('A mounted consumer of the count and the waiting status, and a Load action in progress.')
  .when('The store is shut down, the action finishes, and another action is dispatched.')
  .then('The consumer shows the result of the first action and no spinner.')
  .and('The later dispatch does nothing, and the subscriptions are unchanged.')
  .run(async (_) => {
    // I07
    const store = createStore();
    const listeners = countListeners(store);
    const c = consumer();
    const m = await mount(<StoreProvider store={store}><c.Consumer /></StoreProvider>);
    const finish = new Deferred<void>();
    await act(async () => store.dispatch(new Load(finish.promise)));
    expect(c.last()).toBe('count=0,waiting=true');
    const subscribed = { ...listeners };

    store.setShutDown(true);
    await act(async () => {
      finish.resolve();
      await store.waitAllActions([]);
    });
    expect(m.text()).toBe('count=1,waiting=false');

    await act(async () => store.dispatch(new Increment()));
    expect(store.state.count).toBe(1);
    expect(m.text()).toBe('count=1,waiting=false');
    expect(listeners).toEqual(subscribed);
  });

Bdd(feature)
  .scenario('The hooks keep their types: selections are inferred, and useObject rejects values it cannot compare.')
  .given('Components using the hooks with inferred and explicit types, readonly values, and invalid useObject selectors.')
  .when('They compile.')
  .then('The valid uses have the expected types, and the invalid ones are compile errors.')
  .run(async (_) => {
    // I08 (the `@ts-expect-error` lines fail the test if the invalid use starts compiling)
    class Point {
      constructor(readonly x: number) {}
    }
    interface UserInterface {
      name: string;
    }
    type UserType = { name: string };
    type St = { readonly n: number, readonly items: readonly string[], readonly point: Point, readonly map: ReadonlyMap<string, number> };

    const Comp: React.FC = () => {
      const n: number = useSelect((s: St) => s.n);
      const explicit = useSelect<St, string>((s) => s.items.join());
      const items: readonly string[] = useObject((s: St) => s.items);
      const map: ReadonlyMap<string, number> = useObject((s: St) => s.map);
      const user: UserType = useObject((s: St): UserType => ({ name: String(s.n) }));
      const maybe: { n: number } | null = useObject((s: St) => s.n > 0 ? { n: s.n } : null);
      const point: Point = useSelect((s: St) => s.point);

      // @ts-expect-error A class instance is not accepted by useObject.
      useObject((s: St) => s.point);
      // @ts-expect-error A Date is not accepted by useObject.
      useObject((_s: St) => new Date());
      // @ts-expect-error A string is not accepted by useObject.
      useObject((s: St) => s.items.join());
      // @ts-expect-error A number is not accepted by useObject.
      useObject((s: St) => s.n);
      // @ts-expect-error A function is not accepted by useObject.
      useObject((s: St) => () => s.n);
      // @ts-expect-error An interface type is not accepted by useObject (declare it with `type`).
      useObject((s: St): UserInterface => ({ name: String(s.n) }));
      // @ts-expect-error useExceptionFor needs a concrete action class.
      useExceptionFor(abstractType);

      return <span>{`${n}${explicit}${items.length}${map.size}${user.name}${maybe?.n ?? ''}${point.x}`}</span>;
    };
    abstract class AbstractAction extends KissAction<St> {}
    const abstractType = AbstractAction;

    const store = new Store<St>({ initialState: { n: 1, items: ['a'], point: new Point(2), map: new Map() }, logger: () => {} });
    const m = await mount(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(m.text()).toBe('1a10112');
  });
