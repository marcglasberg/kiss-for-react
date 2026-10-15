/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import {
  AbortDispatchException,
  KissAction,
  Store,
  StoreException,
  StoreProvider,
  useAllState,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  UserException,
} from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

// Scenario IDs D01 to D18 of STATE_REFACTOR.md. See also `bdd.UseIsWaitingAfterFailure.test.ts`,
// `bdd.UseIsWaitingSubclass.test.ts`, `bdd.UseSelectChangingSelector.test.ts` and
// `bdd.IsWaitingSyncAction.test.ts`.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Waiting, failure and exception status, seen by components');

class State {
  constructor(readonly count: number) {}
}

type Outcome = 'ok' | 'null' | 'same state' | 'abortReduce' | 'user exception' | 'error' | 'abort';

abstract class BaseLoad extends KissAction<State> {}

/** An async action (async reduce) that stays pending until `finish` resolves, then ends with `outcome`. */
class Load extends BaseLoad {
  constructor(readonly finish: Promise<void>, readonly outcome: Outcome = 'ok', readonly error?: Error) {
    super();
  }

  async reduce() {
    await this.finish;
    switch (this.outcome) {
      case 'ok': return (state: State) => new State(state.count + 1);
      case 'null': return null;
      case 'same state': return (state: State) => state;
      case 'abortReduce': return (state: State) => new State(state.count + 1000);
      case 'user exception': throw this.error ?? new UserException('Failed to load.');
      case 'error': throw this.error ?? new Error('Failed to load.');
      case 'abort': throw new AbortDispatchException();
    }
  }

  abortReduce(state: State) {
    return state.count >= 1000;
  }
}

class SubLoad extends Load {}

/** An action whose `before` is async, and whose reduce is sync. */
class LoadWithAsyncBefore extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async before() {
    await this.finish;
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

/** An unrelated async action. */
class Other extends KissAction<State> {
  constructor(readonly finish: Promise<void>, readonly outcome: Outcome = 'ok') {
    super();
  }

  async reduce() {
    await this.finish;
    if (this.outcome === 'user exception') throw new UserException('Other failed.');
    return (state: State) => new State(state.count + 10);
  }
}

/** A sync action, which records what `isWaiting` says inside its lifecycle methods. */
class Sync extends KissAction<State> {
  readonly seen: Record<string, boolean> = {};

  constructor(readonly outcome: 'ok' | 'null' | 'user exception' | 'error' | 'abort before' = 'ok') {
    super();
  }

  abortDispatch() {
    return this.outcome === 'abort before';
  }

  before() {
    this.seen.before = this.store.isWaiting(Sync);
  }

  reduce() {
    this.seen.reduce = this.store.isWaiting(Sync);
    if (this.outcome === 'user exception') throw new UserException('Sync failed.');
    if (this.outcome === 'error') throw new Error('Sync failed.');
    if (this.outcome === 'null') return null;
    return new State(this.state.count + 1);
  }

  after() {
    this.seen.after = this.store.isWaiting(Sync);
  }
}

function createStore(options: { errorObserver?: (error: unknown) => unknown } = {}) {
  return new Store<State>({
    initialState: new State(0),
    logger: () => {},
    showUserException: () => {},
    errorObserver: options.errorObserver === undefined ? undefined : ({ error }) => options.errorObserver!(error),
  });
}

type ActionType = abstract new (...args: any[]) => KissAction<State>;
type ConcreteActionType = new (...args: any[]) => KissAction<State>;

/** A component showing whether an action type is in progress, recording renders and commits. */
function spinner(type: ActionType) {
  const stats = { renders: 0, commits: [] as boolean[] };
  const Spinner: React.FC = () => {
    stats.renders++;
    const isWaiting = useIsWaiting(type);
    useCommitProbe(stats.commits, () => isWaiting);
    return <>{isWaiting ? 'waiting' : 'idle'}</>;
  };
  return { Spinner, stats, last: () => stats.commits[stats.commits.length - 1] };
}

/** A component showing whether an action type failed, recording renders and commits. */
function failed(type: ConcreteActionType) {
  const stats = { renders: 0, commits: [] as boolean[] };
  const Failed: React.FC = () => {
    stats.renders++;
    const isFailed = useIsFailed(type);
    useCommitProbe(stats.commits, () => isFailed);
    return <>{isFailed ? 'failed' : 'ok'}</>;
  };
  return { Failed, stats, last: () => stats.commits[stats.commits.length - 1] };
}

/** A component showing the exception of an action type, recording renders and committed references. */
function exception(type: ConcreteActionType) {
  const stats = { renders: 0, commits: [] as (UserException | null)[] };
  const Exception: React.FC = () => {
    stats.renders++;
    const error = useExceptionFor(type);
    useCommitProbe(stats.commits, () => error);
    return <>{error?.message ?? 'none'}</>;
  };
  return { Exception, stats, last: () => stats.commits[stats.commits.length - 1] };
}

/** A component reading the state plus all status hooks for a type, recording committed tuples. */
function tuple(type: ConcreteActionType) {
  const stats = { renders: 0, commits: [] as string[] };
  const Tuple: React.FC = () => {
    stats.renders++;
    const count = useAllState<State>().count;
    const isWaiting = useIsWaiting(type);
    const isFailed = useIsFailed(type);
    const error = useExceptionFor(type);
    const text = `count=${count},waiting=${isWaiting},failed=${isFailed},error=${error?.message ?? '-'}`;
    useCommitProbe(stats.commits, () => text);
    return <>{text}</>;
  };
  return { Tuple, stats, last: () => stats.commits[stats.commits.length - 1] };
}

function provide(store: Store<State>, ...children: React.ReactElement[]) {
  return <StoreProvider store={store}>{children}</StoreProvider>;
}

/** Dispatches `action` inside `act`, and returns a function that finishes it (inside `act`). */
async function start(store: Store<State>, action: KissAction<State>, finish: Deferred<void>) {
  await act(async () => store.dispatch(action));
  return async () => {
    await act(async () => {
      finish.resolve();
      await store.waitAllActions([action], { completeImmediately: true });
    });
  };
}

Bdd(feature)
  .scenario('A spinner shows while an async action runs, and the new state is committed together with the end of the waiting.')
  .given('A mounted component showing the count and whether Load is in progress.')
  .when('A Load action starts, waits, and then finishes with a new state.')
  .then('The component commits (0, idle), then (0, waiting), then (1, idle), and nothing else.')
  .run(async (_) => {
    // D01
    const store = createStore();
    const t = tuple(Load);
    await mount(provide(store, <t.Tuple key="t" />));

    const finish = new Deferred<void>();
    const end = await start(store, new Load(finish.promise), finish);
    expect(t.last()).toBe('count=0,waiting=true,failed=false,error=-');

    await end();
    expect(t.stats.commits).toEqual([
      'count=0,waiting=false,failed=false,error=-',
      'count=0,waiting=true,failed=false,error=-',
      'count=1,waiting=false,failed=false,error=-',
    ]);
    expect(t.stats.renders).toBe(3);
  });

Bdd(feature)
  .scenario('An async action that ends with no new state still ends the waiting, without rendering state consumers.')
  .given('A mounted spinner for Load, and a mounted component that shows the whole state.')
  .when('A Load action starts, and then ends by returning [Outcome].')
  .then('The spinner commits idle, waiting, idle.')
  .and('The state consumer renders only once, since the state object did not change.')
  .example(val('Outcome', 'null'))
  .example(val('Outcome', 'same state'))
  .example(val('Outcome', 'abortReduce'))
  .run(async (ctx) => {
    // D02
    const outcome = ctx.example.val('Outcome') as Outcome;
    const store = createStore();
    const s = spinner(Load);
    const stateRenders = { count: 0 };
    const AllState: React.FC = () => {
      stateRenders.count++;
      return <>{useAllState<State>().count}</>;
    };
    await mount(provide(store, <s.Spinner key="s" />, <AllState key="a" />));
    const stateBefore = store.state;

    const finish = new Deferred<void>();
    const action = new Load(finish.promise, outcome);
    const end = await start(store, action, finish);
    await end();

    expect(store.state).toBe(stateBefore);
    expect(action.status.isCompletedOk).toBe(true);
    expect(s.stats.commits).toEqual([false, true, false]);
    expect(stateRenders.count).toBe(1);
  });

Bdd(feature)
  .scenario('The waiting covers an async before method as well as an async reduce method.')
  .given('A mounted spinner for an action type with [Async method].')
  .when('The action starts, and later its async method finishes.')
  .then('The spinner commits idle, waiting, idle, and the state changed.')
  .example(val('Async method', 'an async before'))
  .example(val('Async method', 'an async reduce'))
  .run(async (ctx) => {
    // D03
    const asyncBefore = ctx.example.val('Async method') === 'an async before';
    const store = createStore();
    const s = spinner(asyncBefore ? LoadWithAsyncBefore : Load);
    await mount(provide(store, <s.Spinner key="s" />));

    const finish = new Deferred<void>();
    const action = asyncBefore ? new LoadWithAsyncBefore(finish.promise) : new Load(finish.promise);
    const end = await start(store, action, finish);
    expect(s.last()).toBe(true);
    expect(store.isWaiting(action.constructor as ActionType)).toBe(true);

    await end();
    expect(s.stats.commits).toEqual([false, true, false]);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A sync action never commits a spinner, even though it is in progress while its methods run.')
  .given('A mounted spinner for a sync action type, plus failed and exception components for it.')
  .when('A sync action is dispatched, and ends with [Outcome].')
  .then('Inside before and reduce, store.isWaiting says the action is in progress.')
  .and('Inside after, it says [Waiting in after]: an action that applied a new state is no longer in progress when after runs.')
  .and('The spinner never commits waiting: it renders only once.')
  .and('The failed component shows [Failed], and the exception component shows an exception: [Exception].')
  .and('A plain Error counts as failed, but has no UserException to show.')
  .example(val('Outcome', 'ok'), val('Waiting in after', false), val('Failed', false), val('Exception', false), val('Throws', false))
  .example(val('Outcome', 'null'), val('Waiting in after', true), val('Failed', false), val('Exception', false), val('Throws', false))
  .example(val('Outcome', 'user exception'), val('Waiting in after', true), val('Failed', true), val('Exception', true), val('Throws', false))
  .example(val('Outcome', 'error'), val('Waiting in after', true), val('Failed', true), val('Exception', false), val('Throws', true))
  .run(async (ctx) => {
    // D04 (sync actions, with the imperative reads inside the action characterized separately)
    const outcome = ctx.example.val('Outcome') as 'ok' | 'null' | 'user exception' | 'error';
    const waitingInAfter = ctx.example.val('Waiting in after') as boolean;
    const isFailed = ctx.example.val('Failed') as boolean;
    const hasException = ctx.example.val('Exception') as boolean;
    const throws = ctx.example.val('Throws') as boolean;
    const store = createStore();
    const s = spinner(Sync);
    const f = failed(Sync);
    const e = exception(Sync);
    const m = await mount(provide(store, <s.Spinner key="s" />, <f.Failed key="f" />, <e.Exception key="e" />));

    const action = new Sync(outcome);
    let thrown: unknown = null;
    await act(async () => {
      try {
        store.dispatch(action);
      } catch (error) {
        thrown = error;
      }
    });

    expect(action.seen).toEqual({ before: true, reduce: true, after: waitingInAfter });
    expect(store.isWaiting(Sync)).toBe(false);
    expect(s.stats.commits).toEqual([false]);
    expect(s.stats.renders).toBe(1);
    expect(f.last()).toBe(isFailed);
    expect(e.last()).toBe(hasException ? action.status.wrappedError : null);
    expect(thrown !== null).toBe(throws);
    expect(m.text()).toBe(`idle${isFailed ? 'failed' : 'ok'}${hasException ? 'Sync failed.' : 'none'}`);
  });

Bdd(feature)
  .scenario('A spinner stays on until both of two concurrent matching actions finish, without extra renders.')
  .given('A mounted spinner for Load.')
  .when('Two Load actions start, and then finish one at a time.')
  .then('The spinner commits waiting when the first starts, and idle only when the second finishes.')
  .and('Starting the second action and finishing the first did not render it again.')
  .run(async (_) => {
    // D05
    const store = createStore();
    const s = spinner(Load);
    await mount(provide(store, <s.Spinner key="s" />));

    const finish1 = new Deferred<void>();
    const finish2 = new Deferred<void>();
    const end1 = await start(store, new Load(finish1.promise), finish1);
    expect(s.stats.commits).toEqual([false, true]);
    const end2 = await start(store, new Load(finish2.promise), finish2);
    expect(s.stats.commits).toEqual([false, true]);
    expect(s.stats.renders).toBe(2);

    await end1();
    expect(s.stats.commits).toEqual([false, true]);
    expect(s.stats.renders).toBe(2);

    await end2();
    expect(s.stats.commits).toEqual([false, true, false]);
    expect(s.stats.renders).toBe(3);
  });

Bdd(feature)
  .scenario('Waiting follows the class hierarchy of the running action.')
  .given('Mounted spinners for an abstract base class, the exact class, a subclass, and an unrelated class.')
  .when('An action of the subclass runs and finishes.')
  .then('The base, exact and subclass spinners show waiting and then idle.')
  .and('The unrelated spinner never renders again.')
  .run(async (_) => {
    // D06
    const store = createStore();
    const base = spinner(BaseLoad);
    const exact = spinner(Load);
    const sub = spinner(SubLoad);
    const unrelated = spinner(Other);
    await mount(provide(store,
      <base.Spinner key="b" />, <exact.Spinner key="e" />, <sub.Spinner key="s" />, <unrelated.Spinner key="u" />));

    const finish = new Deferred<void>();
    const end = await start(store, new SubLoad(finish.promise), finish);
    expect([base.last(), exact.last(), sub.last(), unrelated.last()]).toEqual([true, true, true, false]);

    await end();
    for (const s of [base, exact, sub]) expect(s.stats.commits).toEqual([false, true, false]);
    expect(unrelated.stats.commits).toEqual([false]);
    expect(unrelated.stats.renders).toBe(1);
  });

Bdd(feature)
  .scenario('A UserException without a state change ends the waiting and shows the failure and the exception.')
  .given('A store, with [Components] mounted for Load.')
  .when('A Load action runs and fails with a UserException.')
  .then('The spinner shows waiting and then idle; the failed component shows failed; the exception component shows that exact exception.')
  .and('The state did not change.')
  .example(val('Components', 'the spinner'))
  .example(val('Components', 'the failed component'))
  .example(val('Components', 'the exception component'))
  .example(val('Components', 'all of them'))
  .run(async (ctx) => {
    // D07
    const which = ctx.example.val('Components') as string;
    const store = createStore();
    const s = spinner(Load);
    const f = failed(Load);
    const e = exception(Load);
    const children: React.ReactElement[] = [];
    if (which === 'the spinner' || which === 'all of them') children.push(<s.Spinner key="s" />);
    if (which === 'the failed component' || which === 'all of them') children.push(<f.Failed key="f" />);
    if (which === 'the exception component' || which === 'all of them') children.push(<e.Exception key="e" />);
    await mount(provide(store, ...children));
    const stateBefore = store.state;

    const error = new UserException('Failed to load.');
    const finish = new Deferred<void>();
    const end = await start(store, new Load(finish.promise, 'user exception', error), finish);
    await end();

    expect(store.state).toBe(stateBefore);
    if (children.some((c) => c.key === 's')) expect(s.stats.commits).toEqual([false, true, false]);
    if (children.some((c) => c.key === 'f')) expect(f.stats.commits).toEqual([false, true]);
    if (children.some((c) => c.key === 'e')) {
      expect(e.stats.commits).toEqual([null, error]);
      expect(e.last()).toBe(error);
    }
  });

Bdd(feature)
  .scenario('Retrying a failed action clears the error while it runs, then shows success or the new failure.')
  .given('A mounted component showing the count, waiting, failed and exception for Load.')
  .when('Load fails, is dispatched again and succeeds, and is dispatched once more and fails again.')
  .then('The committed history is: idle; waiting; failed with error 1; waiting (error cleared); ok with count 1; waiting; failed with error 2.')
  .run(async (_) => {
    // D08
    const store = createStore();
    const t = tuple(Load);
    await mount(provide(store, <t.Tuple key="t" />));

    const f1 = new Deferred<void>();
    await (await start(store, new Load(f1.promise, 'user exception', new UserException('error 1')), f1))();
    const f2 = new Deferred<void>();
    await (await start(store, new Load(f2.promise, 'ok'), f2))();
    const f3 = new Deferred<void>();
    await (await start(store, new Load(f3.promise, 'user exception', new UserException('error 2')), f3))();

    expect(t.stats.commits).toEqual([
      'count=0,waiting=false,failed=false,error=-',
      'count=0,waiting=true,failed=false,error=-',
      'count=0,waiting=false,failed=true,error=error 1',
      'count=0,waiting=true,failed=false,error=-',
      'count=1,waiting=false,failed=false,error=-',
      'count=1,waiting=true,failed=false,error=-',
      'count=1,waiting=false,failed=true,error=error 2',
    ]);
  });

Bdd(feature)
  .scenario('Clearing an error updates only the components of that action type.')
  .given('Load and Other both failed, with mounted failed and exception components for Load, and a failed component for Other.')
  .when('The error of Load is cleared, then the error of a type that has no error is cleared, then the error of Other is cleared.')
  .then('Clearing Load renders only the Load components, which show no error.')
  .and('Clearing a missing error renders nothing.')
  .and('Clearing Other renders only the Other component.')
  .run(async (_) => {
    // D09
    const store = createStore();
    const f = failed(Load);
    const e = exception(Load);
    const fo = failed(Other);
    const finish1 = new Deferred<void>();
    const finish2 = new Deferred<void>();
    await (await start(store, new Load(finish1.promise, 'user exception'), finish1))();
    await (await start(store, new Other(finish2.promise, 'user exception'), finish2))();
    await mount(provide(store, <f.Failed key="f" />, <e.Exception key="e" />, <fo.Failed key="fo" />));
    expect([f.last(), e.last()?.message, fo.last()]).toEqual([true, 'Failed to load.', true]);

    await act(async () => store.clearExceptionFor(Load));
    expect([f.last(), e.last(), fo.last()]).toEqual([false, null, true]);
    expect([f.stats.renders, e.stats.renders, fo.stats.renders]).toEqual([2, 2, 1]);

    await act(async () => store.clearExceptionFor(SubLoad));
    expect([f.stats.renders, e.stats.renders, fo.stats.renders]).toEqual([2, 2, 1]);

    await act(async () => store.clearExceptionFor(Other));
    expect(fo.last()).toBe(false);
    expect([f.stats.renders, e.stats.renders, fo.stats.renders]).toEqual([2, 2, 2]);
  });

Bdd(feature)
  .scenario('A second failure with a different exception object updates the exception consumer, but not an unchanged failed boolean.')
  .given('Two Load actions running at the same time, with mounted failed and exception components for Load.')
  .when('The first fails with exception 1, and then the second fails with exception 2, which has the same message.')
  .then('The exception component commits exception 1 and then exception 2 (a different object).')
  .and('The failed component commits true once, and does not render for the second failure.')
  .run(async (_) => {
    // D10
    const store = createStore();
    const f = failed(Load);
    const e = exception(Load);
    await mount(provide(store, <f.Failed key="f" />, <e.Exception key="e" />));

    const error1 = new UserException('same message');
    const error2 = new UserException('same message');
    const finish1 = new Deferred<void>();
    const finish2 = new Deferred<void>();
    const end1 = await start(store, new Load(finish1.promise, 'user exception', error1), finish1);
    const end2 = await start(store, new Load(finish2.promise, 'user exception', error2), finish2);

    await end1();
    expect(e.last()).toBe(error1);
    expect(f.stats.commits).toEqual([false, true]);

    await end2();
    expect(e.stats.commits).toEqual([null, error1, error2]);
    expect(e.last()).toBe(error2);
    expect(f.stats.commits).toEqual([false, true]);
    expect(f.stats.renders).toBe(2);
  });

Bdd(feature)
  .scenario('Failure and exception are matched by the exact action type, not by inheritance.')
  .given('Mounted failed and exception components for Load and for SubLoad.')
  .when('A SubLoad action fails with a UserException.')
  .then('The SubLoad components show the failure and the exception.')
  .and('The Load components do not, and did not render again.')
  .run(async (_) => {
    // D11
    const store = createStore();
    const fBase = failed(Load);
    const eBase = exception(Load);
    const fSub = failed(SubLoad);
    const eSub = exception(SubLoad);
    await mount(provide(store, <fBase.Failed key="fb" />, <eBase.Exception key="eb" />, <fSub.Failed key="fs" />, <eSub.Exception key="es" />));

    const finish = new Deferred<void>();
    await (await start(store, new SubLoad(finish.promise, 'user exception'), finish))();

    expect([fSub.last(), eSub.last()?.message]).toEqual([true, 'Failed to load.']);
    expect([fBase.last(), eBase.last()]).toEqual([false, null]);
    expect([fBase.stats.renders, eBase.stats.renders]).toEqual([1, 1]);
  });

Bdd(feature)
  .scenario('The status hooks follow the error rules: what wrapError and the errorObserver do with the error decides what is shown.')
  .given('A store whose errorObserver [Observer], and a mounted component showing waiting, failed and exception for Load.')
  .when('A Load action fails with [Thrown].')
  .then('The waiting ends; the failed component shows [Failed]; the exception component shows [Error]; dispatchAndWait [Rejects].')
  .and('A plain Error that is kept counts as failed, but there is no UserException to show.')
  .example(val('Observer', 'keeps the error'), val('Thrown', 'a UserException'), val('Failed', true), val('Error', 'Failed to load.'), val('Rejects', false))
  .example(val('Observer', 'keeps the error'), val('Thrown', 'an Error'), val('Failed', true), val('Error', '-'), val('Rejects', true))
  .example(val('Observer', 'swallows the error'), val('Thrown', 'a UserException'), val('Failed', false), val('Error', '-'), val('Rejects', false))
  .example(val('Observer', 'turns it into a UserException'), val('Thrown', 'an Error'), val('Failed', true), val('Error', 'wrapped'), val('Rejects', false))
  .run(async (ctx) => {
    // D12
    const observer = ctx.example.val('Observer') as string;
    const thrown = ctx.example.val('Thrown') as string;
    const isFailed = ctx.example.val('Failed') as boolean;
    const errorShown = ctx.example.val('Error') as string;
    const rejects = ctx.example.val('Rejects') as boolean;
    const store = createStore({
      errorObserver: (error) => {
        if (observer === 'swallows the error') return null;
        if (observer === 'turns it into a UserException') return new UserException('wrapped');
        return error;
      },
    });
    const t = tuple(Load);
    await mount(provide(store, <t.Tuple key="t" />));

    const finish = new Deferred<void>();
    const action = new Load(finish.promise, thrown === 'a UserException' ? 'user exception' : 'error');
    let rejected = false;
    let promise!: Promise<unknown>;
    await act(async () => {
      promise = store.dispatchAndWait(action).catch(() => rejected = true);
    });
    expect(t.last()).toBe('count=0,waiting=true,failed=false,error=-');
    await act(async () => {
      finish.resolve();
      await promise;
    });

    expect(t.last()).toBe(`count=0,waiting=false,failed=${isFailed},error=${errorShown}`);
    expect(rejected).toBe(rejects);
    expect(t.stats.commits[1]).toBe('count=0,waiting=true,failed=false,error=-');
  });

Bdd(feature)
  .scenario('A status component mounted while an action runs, or after it failed, shows the right status from its first render.')
  .given('No status component is mounted when a Load action starts.')
  .when('A spinner mounts while Load runs, and failed and exception components mount after Load failed.')
  .then('The spinner shows waiting from its first render, and idle when Load finishes.')
  .and('The failed and exception components show the failure from their first render.')
  .run(async (_) => {
    // D13
    const store = createStore();
    const error = new UserException('late');
    const finish = new Deferred<void>();
    const action = new Load(finish.promise, 'user exception', error);
    store.dispatch(action);

    const s = spinner(Load);
    const m = await mount(provide(store, <s.Spinner key="s" />));
    expect(s.stats.commits).toEqual([true]);
    await act(async () => {
      finish.resolve();
      await store.waitAllActions([]);
    });
    expect(s.stats.commits).toEqual([true, false]);
    await m.unmount();

    const f = failed(Load);
    const e = exception(Load);
    await mount(provide(store, <f.Failed key="f" />, <e.Exception key="e" />));
    expect(f.stats.commits).toEqual([true]);
    expect(e.stats.commits).toEqual([error]);
  });

Bdd(feature)
  .scenario('A status component that switches to another action type sees the status of the new type.')
  .given('A mounted component showing the status of Load, switched by a prop to show the status of Other.')
  .when('An Other action starts and then fails.')
  .then('The component shows Other waiting, then Other failed with its exception.')
  .run(async (_) => {
    // D14
    const store = createStore();
    const commits: string[] = [];
    const Status: React.FC<{ type: ConcreteActionType }> = ({ type }) => {
      const isWaiting = useIsWaiting(type);
      const isFailed = useIsFailed(type);
      const error = useExceptionFor(type);
      const text = `${type.name}:${isWaiting}:${isFailed}:${error?.message ?? '-'}`;
      useCommitProbe(commits, () => text);
      return <>{text}</>;
    };
    const m = await mount(provide(store, <Status key="s" type={Load} />));
    await m.rerender(provide(store, <Status key="s" type={Other} />));
    expect(commits).toEqual(['Load:false:false:-', 'Other:false:false:-']);

    const finish = new Deferred<void>();
    const end = await start(store, new Other(finish.promise, 'user exception'), finish);
    expect(m.text()).toBe('Other:true:false:-');
    await end();
    expect(m.text()).toBe('Other:false:true:Other failed.');
  });

Bdd(feature)
  .scenario('Status changes of another action type do not render the components of this type.')
  .given('Mounted spinner, failed and exception components for Load.')
  .when('An Other action starts, fails, and its error is cleared.')
  .then('None of the Load components renders again.')
  .run(async (_) => {
    // D15
    const store = createStore();
    const s = spinner(Load);
    const f = failed(Load);
    const e = exception(Load);
    await mount(provide(store, <s.Spinner key="s" />, <f.Failed key="f" />, <e.Exception key="e" />));

    const finish = new Deferred<void>();
    const end = await start(store, new Other(finish.promise, 'user exception'), finish);
    await end();
    await act(async () => store.clearExceptionFor(Other));

    expect([s.stats.renders, f.stats.renders, e.stats.renders]).toEqual([1, 1, 1]);
  });

Bdd(feature)
  .scenario('Aborted and rejected actions leave no spinner on and no failure; a throwing action leaves no spinner on, but is failed.')
  .given('Mounted spinner, failed and exception components for the action type.')
  .when('The action [Case].')
  .then('The spinner ends idle, the failed component shows [Failed], and nothing is left pending.')
  .and('The exception component shows nothing, since no UserException was recorded.')
  .example(val('Case', 'is aborted before dispatch, by abortDispatch'), val('Failed', false))
  .example(val('Case', 'aborts itself with an AbortDispatchException'), val('Failed', false))
  .example(val('Case', 'is async but dispatched with dispatchSync'), val('Failed', false))
  .example(val('Case', 'throws a plain Error from its reducer'), val('Failed', true))
  .run(async (ctx) => {
    // D16
    const testCase = ctx.example.val('Case') as string;
    const isFailed = ctx.example.val('Failed') as boolean;
    const store = createStore();

    if (testCase === 'is aborted before dispatch, by abortDispatch') {
      const s = spinner(Sync);
      const f = failed(Sync);
      await mount(provide(store, <s.Spinner key="s" />, <f.Failed key="f" />));
      const action = new Sync('abort before');
      let status!: { isDispatchAborted: boolean };
      await act(async () => {
        status = await store.dispatchAndWait(action);
      });
      expect(status.isDispatchAborted).toBe(true);
      expect(action.status.isDispatched).toBe(false);
      expect(action.seen).toEqual({});
      expect(s.stats.commits).toEqual([false]);
      expect(f.last()).toBe(isFailed);
      return;
    }

    const s = spinner(Load);
    const f = failed(Load);
    const e = exception(Load);
    await mount(provide(store, <s.Spinner key="s" />, <f.Failed key="f" />, <e.Exception key="e" />));
    const finish = new Deferred<void>();

    if (testCase === 'aborts itself with an AbortDispatchException') {
      const action = new Load(finish.promise, 'abort');
      const end = await start(store, action, finish);
      expect(s.last()).toBe(true);
      await end();
      expect(action.status.isDispatchAborted).toBe(true);
    } else if (testCase === 'is async but dispatched with dispatchSync') {
      const action = new Load(finish.promise, 'ok');
      await act(async () => {
        expect(() => store.dispatchSync(action)).toThrow(StoreException);
        finish.resolve();
        await store.waitAllActions([], { completeImmediately: true });
      });
      expect(store.state.count).toBe(0);
    } else {
      const action = new Load(finish.promise, 'error');
      let rejected: unknown = null;
      await act(async () => {
        const promise = store.dispatchAndWait(action).catch((error) => rejected = error);
        finish.resolve();
        await promise;
      });
      expect(String(rejected)).toContain('Failed to load.');
    }

    expect(store.isWaiting(Load)).toBe(false);
    expect(store.actionsInProgress().size).toBe(0);
    expect(s.last()).toBe(false);
    expect(f.last()).toBe(isFailed);
    expect(e.last()).toBeNull();
  });

Bdd(feature)
  .scenario('Status changes do not render a component that only uses the state.')
  .given('A mounted component showing the whole state, and a mounted spinner for Load.')
  .when('A Load action starts, fails with a UserException, and its error is cleared.')
  .then('The spinner updates, but the state component renders only once.')
  .run(async (_) => {
    // D17
    const store = createStore();
    const s = spinner(Load);
    const stateRenders = { count: 0 };
    const AllState: React.FC = () => {
      stateRenders.count++;
      return <>{useAllState<State>().count}</>;
    };
    await mount(provide(store, <s.Spinner key="s" />, <AllState key="a" />));

    const finish = new Deferred<void>();
    const end = await start(store, new Load(finish.promise, 'user exception'), finish);
    await end();
    await act(async () => store.clearExceptionFor(Load));

    expect(s.stats.commits).toEqual([false, true, false]);
    expect(stateRenders.count).toBe(1);
  });

Bdd(feature)
  .scenario('A component reading state and all status hooks commits only valid combinations across success, failure, clear and retry.')
  .given('A mounted component showing the count, waiting, failed and exception for Load.')
  .when('Load succeeds; then fails; then its error is cleared; then it runs again and succeeds.')
  .then('Every committed combination is valid, and the full history is as expected.')
  .run(async (_) => {
    // D18
    const store = createStore();
    const t = tuple(Load);
    await mount(provide(store, <t.Tuple key="t" />));

    const f1 = new Deferred<void>();
    await (await start(store, new Load(f1.promise, 'ok'), f1))();
    const f2 = new Deferred<void>();
    await (await start(store, new Load(f2.promise, 'user exception', new UserException('boom')), f2))();
    await act(async () => store.clearExceptionFor(Load));
    const f3 = new Deferred<void>();
    await (await start(store, new Load(f3.promise, 'ok'), f3))();

    expect(t.stats.commits).toEqual([
      'count=0,waiting=false,failed=false,error=-',
      'count=0,waiting=true,failed=false,error=-',
      'count=1,waiting=false,failed=false,error=-',
      'count=1,waiting=true,failed=false,error=-',
      'count=1,waiting=false,failed=true,error=boom',
      'count=1,waiting=false,failed=false,error=-',
      'count=1,waiting=true,failed=false,error=-',
      'count=2,waiting=false,failed=false,error=-',
    ]);
    // A spinner and a failure never show together, and a failure always comes with its error.
    for (const c of t.stats.commits) {
      expect(c.includes('waiting=true,failed=true')).toBe(false);
      expect(c.includes('failed=true,error=-')).toBe(false);
      expect(c.includes('failed=false,error=boom')).toBe(false);
    }
  });
