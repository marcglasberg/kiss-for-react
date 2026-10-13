/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import { KissAction, Store, StoreProvider, useAllState, useIsWaiting, useSelect } from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

// Scenario IDs A01 to A15 of STATE_REFACTOR.md.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Selecting state without unnecessary renders');

class User {
  constructor(readonly name: string) {}

  greeting() {
    return `Hi, ${this.name}`;
  }
}

class State {
  constructor(
    readonly a: number,
    readonly b: number,
    readonly user: User = new User('Mary'),
    readonly tags: readonly string[] = [],
    readonly other: string = '',
  ) {}

  copy(changes: Partial<State>): State {
    return new State(
      changes.a ?? this.a,
      changes.b ?? this.b,
      changes.user ?? this.user,
      changes.tags ?? this.tags,
      changes.other ?? this.other,
    );
  }
}

class SetA extends KissAction<State> {
  constructor(readonly a: number) {
    super();
  }

  reduce() {
    return this.state.copy({ a: this.a });
  }
}

class SetB extends KissAction<State> {
  constructor(readonly b: number) {
    super();
  }

  reduce() {
    return this.state.copy({ b: this.b });
  }
}

class SetAAndB extends KissAction<State> {
  constructor(readonly a: number, readonly b: number) {
    super();
  }

  reduce() {
    return this.state.copy({ a: this.a, b: this.b });
  }
}

class SetOther extends KissAction<State> {
  constructor(readonly other: string) {
    super();
  }

  reduce() {
    return this.state.copy({ other: this.other });
  }
}

class SetUser extends KissAction<State> {
  constructor(readonly user: User) {
    super();
  }

  reduce() {
    return this.state.copy({ user: this.user });
  }
}

/** An action that ends without a new state, in one of the supported ways. */
class NoChange extends KissAction<State> {
  constructor(readonly how: 'null' | 'same state' | 'abortReduce', readonly finish?: Promise<void>) {
    super();
  }

  reduce() {
    if (this.finish !== undefined) return this.finish.then(() => this.result());
    const result = this.result();
    return result === null ? null : result(this.state);
  }

  /** The result as a function of the state, as an async reducer returns it. */
  private result(): ((state: State) => State | null) | null {
    if (this.how === 'null') return null;
    if (this.how === 'same state') return (state: State) => state;
    return (state: State) => state.copy({ other: 'aborted' });
  }

  abortReduce(state: State) {
    return this.how === 'abortReduce' && state.other === 'aborted';
  }
}

function createStore(initialState = new State(1, 2)) {
  return new Store<State>({ initialState, logger: () => {} });
}

/** Shows a number so that -0 can be told from 0. */
function show(value: unknown): string {
  if (Object.is(value, -0)) return '-0';
  return String(value);
}

/**
 * Creates a component that selects a value with `useSelect`, shows it, and records how many
 * times it rendered and what it showed after each of its commits.
 */
function consumer<T>(selector: (state: State) => T, display: (value: T) => string = show) {
  const stats = { renders: 0, commits: [] as string[] };
  const Component: React.FC = () => {
    stats.renders++;
    const value = useSelect(selector);
    const text = display(value);
    useCommitProbe(stats.commits, () => text);
    return <span>{text}</span>;
  };
  return { Component, stats };
}

function provide(store: Store<State>, ...children: React.ReactElement[]) {
  return <StoreProvider store={store}>{children}</StoreProvider>;
}

/** Counts the active state subscriptions of the store, through its subscribe function. */
function countStateListeners(store: Store<State>): { active: number } {
  const count = { active: 0 };
  const subscribe = store._subscribeState;
  store._subscribeState = (listener) => {
    count.active++;
    const unsubscribe = subscribe(listener);
    return () => {
      count.active--;
      unsubscribe();
    };
  };
  return count;
}

Bdd(feature)
  .scenario('A consumer shows the selected value as soon as it mounts, with a single render.')
  .given('A store with a=1 and b=2.')
  .when('A component that selects a is mounted.')
  .then('It shows 1 after its first commit.')
  .and('It does not need a second render to start listening to the store.')
  .run(async (_) => {
    // A01
    const store = createStore();
    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));
    expect(m.text()).toBe('1');
    expect(a.stats.renders).toBe(1);
    expect(a.stats.commits).toEqual(['1']);
  });

Bdd(feature)
  .scenario('Changing an unrelated part of the state does not render the consumer again.')
  .given('A mounted component that selects a.')
  .when('An action changes only b, creating a new state object.')
  .then('The component still shows a=1.')
  .and('It did not render or commit again.')
  .run(async (_) => {
    // A02
    const store = createStore();
    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));
    const before = { renders: a.stats.renders, commits: a.stats.commits.length };

    await act(async () => store.dispatch(new SetB(20)));

    expect(store.state.b).toBe(20);
    expect(m.text()).toBe('1');
    expect(a.stats.renders).toBe(before.renders);
    expect(a.stats.commits.length).toBe(before.commits);
  });

Bdd(feature)
  .scenario('Changing the selected value renders the consumer once, keeping a single subscription.')
  .given('A mounted component that selects a, with one active subscription to the store.')
  .when('An action changes a to 3.')
  .then('The component commits 3, with exactly one more render.')
  .and('It still has exactly one subscription to the store.')
  .run(async (_) => {
    // A03
    const store = createStore();
    const listeners = countStateListeners(store);
    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));
    expect(listeners.active).toBe(1);

    await act(async () => store.dispatch(new SetA(3)));

    expect(m.text()).toBe('3');
    expect(a.stats.renders).toBe(2);
    expect(a.stats.commits).toEqual(['1', '3']);
    expect(listeners.active).toBe(1);
  });

Bdd(feature)
  .scenario('Only the consumers of the changed fields render, and the all-state consumer sees every state.')
  .given('Three mounted components: one selects a, one selects b, and one uses the whole state.')
  .when('An action changes a, and then another action changes b.')
  .then('The a consumer renders only for the a change, and the b consumer only for the b change.')
  .and('The all-state consumer renders for both, seeing each new state object.')
  .run(async (_) => {
    // A04
    const store = createStore();
    const a = consumer((s) => s.a);
    const b = consumer((s) => s.b);
    const seenStates: State[] = [];
    const All: React.FC = () => {
      const state = useAllState<State>();
      seenStates.push(state);
      return <span>{`${state.a},${state.b}`}</span>;
    };
    const m = await mount(provide(store, <a.Component key="a" />, <b.Component key="b" />, <All key="all" />));
    expect(m.text()).toBe('1' + '2' + '1,2');
    const state0 = store.state;

    await act(async () => store.dispatch(new SetA(10)));
    const state1 = store.state;
    expect(a.stats.commits).toEqual(['1', '10']);
    expect(b.stats.commits).toEqual(['2']);
    expect(b.stats.renders).toBe(1);

    await act(async () => store.dispatch(new SetB(20)));
    const state2 = store.state;
    expect(a.stats.commits).toEqual(['1', '10']);
    expect(a.stats.renders).toBe(2);
    expect(b.stats.commits).toEqual(['2', '20']);

    expect(m.text()).toBe('10' + '20' + '10,20');
    expect(seenStates).toEqual([state0, state1, state2]);
  });

Bdd(feature)
  .scenario('An action that ends without a new state does not render the state consumers.')
  .given('A mounted component that selects a, and a store with a state observer.')
  .when('An action ends [How] (so the state is not replaced).')
  .then('The component does not render again.')
  .and('The action completes with no error, and the state observer still sees it.')
  .example(val('How', 'null'))
  .example(val('How', 'same state'))
  .example(val('How', 'abortReduce'))
  .run(async (ctx) => {
    // A05
    const how = ctx.example.val('How');
    const observed: unknown[] = [];
    const store = new Store<State>({
      initialState: new State(1, 2), logger: () => {},
      stateObserver: (action, prev, next, error) => observed.push([action.constructor.name, prev === next, error]),
    });
    const a = consumer((s) => s.a);
    await mount(provide(store, <a.Component key="a" />));
    const stateBefore = store.state;

    const action = new NoChange(how);
    await act(async () => store.dispatch(action));

    expect(store.state).toBe(stateBefore);
    expect(action.status.isCompletedOk).toBe(true);
    expect(observed).toEqual([['NoChange', true, null]]);
    expect(a.stats.renders).toBe(1);
    expect(a.stats.commits).toEqual(['1']);
  });

Bdd(feature)
  .scenario('An async action that ends without a new state still ends the waiting, without rendering state consumers.')
  .given('A mounted component that selects a, and another that shows if the action is in progress.')
  .when('An async action is dispatched, and later ends [How].')
  .then('The waiting component shows true while the action runs, and false when it ends.')
  .and('The state consumer never renders again.')
  .example(val('How', 'null'))
  .example(val('How', 'same state'))
  .example(val('How', 'abortReduce'))
  .run(async (ctx) => {
    // A05 (async variant, see also D02)
    const how = ctx.example.val('How');
    const store = createStore();
    const a = consumer((s) => s.a);
    const waiting: boolean[] = [];
    const Waiting: React.FC = () => {
      const isWaiting = useIsWaiting(NoChange);
      useCommitProbe(waiting, () => isWaiting);
      return null;
    };
    await mount(provide(store, <a.Component key="a" />, <Waiting key="w" />));

    const finish = new Deferred<void>();
    const action = new NoChange(how, finish.promise);
    await act(async () => store.dispatch(action));
    expect(waiting).toEqual([false, true]);

    await act(async () => {
      finish.resolve();
      await store.waitAllActions([]);
    });
    expect(waiting).toEqual([false, true, false]);
    expect(action.status.isCompletedOk).toBe(true);
    expect(a.stats.renders).toBe(1);
  });

Bdd(feature)
  .scenario('A derived value that stays the same skips the render, and renders when it changes.')
  .given('A mounted component that selects whether a is positive.')
  .when('a changes from 1 to 2 (still positive), and then to -1.')
  .then('The first change does not render the component.')
  .and('The second change renders it, showing false.')
  .run(async (_) => {
    // A06
    const store = createStore();
    const positive = consumer((s) => s.a > 0);
    const m = await mount(provide(store, <positive.Component key="p" />));
    expect(m.text()).toBe('true');

    await act(async () => store.dispatch(new SetA(2)));
    expect(positive.stats.renders).toBe(1);
    expect(m.text()).toBe('true');

    await act(async () => store.dispatch(new SetA(-1)));
    expect(positive.stats.renders).toBe(2);
    expect(m.text()).toBe('false');
  });

Bdd(feature)
  .scenario('A selected NaN is equal to NaN, so only real changes render the consumer.')
  .given('A store where a is NaN, and a mounted component that selects a.')
  .when('b changes, then a changes to 5, then a changes back to NaN.')
  .then('The b change does not render the component.')
  .and('The change to 5 and the change back to NaN each render it once.')
  .run(async (_) => {
    // A07
    const store = createStore(new State(NaN, 2));
    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));
    expect(m.text()).toBe('NaN');

    await act(async () => store.dispatch(new SetB(3)));
    expect(a.stats.renders).toBe(1);

    await act(async () => store.dispatch(new SetA(5)));
    expect(a.stats.commits).toEqual(['NaN', '5']);

    await act(async () => store.dispatch(new SetA(NaN)));
    expect(a.stats.commits).toEqual(['NaN', '5', 'NaN']);
    expect(a.stats.renders).toBe(3);
  });

Bdd(feature)
  .scenario('Selected values are compared with Object.is, so changes between similar values render the consumer.')
  .given('A store where the selected value is [From].')
  .when('An action changes it to [To].')
  .then('The component [Renders] again, and shows the new value.')
  .example(val('From', 0), val('To', -0), val('Renders', true))
  .example(val('From', -0), val('To', 0), val('Renders', true))
  .example(val('From', 0), val('To', 0), val('Renders', false))
  .example(val('From', true), val('To', false), val('Renders', true))
  .example(val('From', 'x'), val('To', 'y'), val('Renders', true))
  .example(val('From', 'x'), val('To', 'x'), val('Renders', false))
  .example(val('From', null), val('To', 'undefined'), val('Renders', true))
  .example(val('From', 'undefined'), val('To', null), val('Renders', true))
  .example(val('From', null), val('To', null), val('Renders', false))
  .run(async (ctx) => {
    // A08
    // The BDD tool can't show `undefined` in a table, so the examples use the text 'undefined'.
    const parse = (value: unknown) => value === 'undefined' ? undefined : value;
    const from = parse(ctx.example.val('From'));
    const to = parse(ctx.example.val('To'));
    const renders = ctx.example.val('Renders') as boolean;

    class SetValue extends KissAction<{ value: unknown }> {
      constructor(readonly value: unknown) {
        super();
      }

      reduce() {
        return { value: this.value };
      }
    }

    const store = new Store<{ value: unknown }>({ initialState: { value: from }, logger: () => {} });
    const stats = { renders: 0 };
    const Component: React.FC = () => {
      stats.renders++;
      return <span>{show(useSelect((s: { value: unknown }) => s.value))}</span>;
    };
    const m = await mount(<StoreProvider store={store}><Component /></StoreProvider>);
    expect(m.text()).toBe(show(from));

    await act(async () => store.dispatch(new SetValue(to)));
    expect(m.text()).toBe(show(to));
    expect(stats.renders).toBe(renders ? 2 : 1);
  });

Bdd(feature)
  .scenario('A selected class instance keeps its identity and prototype until it is replaced.')
  .given('A state with a User class instance, and a mounted component that selects the user.')
  .when('An unrelated field changes, and then the user is replaced.')
  .then('The unrelated change does not render the component, which keeps the same instance.')
  .and('Replacing the user renders it, with the new instance, whose methods still work.')
  .run(async (_) => {
    // A09
    const store = createStore();
    const seen: User[] = [];
    const Component: React.FC = () => {
      const user = useSelect((s: State) => s.user);
      seen.push(user);
      return <span>{user.greeting()}</span>;
    };
    const m = await mount(provide(store, <Component key="c" />));
    expect(m.text()).toBe('Hi, Mary');

    await act(async () => store.dispatch(new SetOther('changed')));
    expect(seen.length).toBe(1);
    expect(seen[0]).toBe(store.state.user);

    const anna = new User('Anna');
    await act(async () => store.dispatch(new SetUser(anna)));
    expect(m.text()).toBe('Hi, Anna');
    expect(seen.length).toBe(2);
    expect(seen[1]).toBe(anna);
    expect(seen[1]).toBeInstanceOf(User);
  });

Bdd(feature)
  .scenario('A selector that returns a new object each time does not loop, and renders for each state change.')
  .given('A component whose [Selector] returns a new object with a.')
  .when('It mounts, and then an action changes b.')
  .then('It renders once when it mounts, and once more for the state change (no render loop).')
  .example(val('Selector', 'inline'))
  .example(val('Selector', 'stable'))
  .run(async (ctx) => {
    // A10
    const stable = (s: State) => ({ a: s.a });
    const isInline = ctx.example.val('Selector') === 'inline';
    const store = createStore();
    const stats = { renders: 0 };
    const Component: React.FC = () => {
      if (++stats.renders > 20) throw new Error('Render loop.');
      const value = useSelect(isInline ? (s: State) => ({ a: s.a }) : stable);
      return <span>{value.a}</span>;
    };
    const m = await mount(provide(store, <Component key="c" />));
    expect(stats.renders).toBe(1);
    expect(m.text()).toBe('1');

    await act(async () => store.dispatch(new SetB(99)));
    expect(stats.renders).toBe(2);
    expect(m.text()).toBe('1');
  });

Bdd(feature)
  .scenario('The same selector function used against two stores does not mix their values.')
  .given('Two providers with different stores, each with a component using the same selector function.')
  .when('a changes in the first store.')
  .then('Only the first component renders again, showing the first store value.')
  .and('The second component still shows the second store value.')
  .run(async (_) => {
    // A11
    const store1 = createStore(new State(1, 0));
    const store2 = createStore(new State(2, 0));
    const selectA = (s: State) => s.a;
    const c1 = consumer(selectA);
    const c2 = consumer(selectA);
    const m = await mount(
      <>
        <StoreProvider store={store1}><c1.Component /></StoreProvider>
        <StoreProvider store={store2}><c2.Component /></StoreProvider>
      </>,
    );
    expect(m.text()).toBe('12');

    await act(async () => store1.dispatch(new SetA(10)));
    expect(m.text()).toBe('102');
    expect(c1.stats.commits).toEqual(['1', '10']);
    expect(c2.stats.commits).toEqual(['2']);
    expect(c2.stats.renders).toBe(1);
  });

Bdd(feature)
  .scenario('A value that changes A, B, A in separate updates shows all three; in one batch, it ends at A.')
  .given('A mounted component that selects a, equal to 1.')
  .when('Three separate actions set a to 2, then 1, then 2.')
  .and('Then one batch of actions sets a to 1, then 2, then 1.')
  .then('The separate updates commit 2, 1, 2 in order.')
  .and('The batch ends showing 1, the current state, and does not render for stale values afterwards.')
  .run(async (_) => {
    // A12
    const store = createStore();
    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));

    await act(async () => store.dispatch(new SetA(2)));
    await act(async () => store.dispatch(new SetA(1)));
    await act(async () => store.dispatch(new SetA(2)));
    expect(a.stats.commits).toEqual(['1', '2', '1', '2']);

    await act(async () => {
      store.dispatch(new SetA(1));
      store.dispatch(new SetA(2));
      store.dispatch(new SetA(1));
    });
    expect(m.text()).toBe('1');
    expect(a.stats.commits[a.stats.commits.length - 1]).toBe('1');
    const rendersAfterBatch = a.stats.renders;

    await act(async () => store.dispatch(new SetB(7)));
    expect(a.stats.renders).toBe(rendersAfterBatch);
    expect(m.text()).toBe('1');
  });

Bdd(feature)
  .scenario('A component with several selectors commits a consistent tuple when one update changes several fields.')
  .given('A mounted component that selects a and b separately.')
  .when('One action changes both a and b.')
  .then('The component commits the new a and the new b together, with a single render.')
  .run(async (_) => {
    // A13
    const store = createStore();
    const stats = { renders: 0, commits: [] as string[] };
    const Component: React.FC = () => {
      stats.renders++;
      const a = useSelect((s: State) => s.a);
      const b = useSelect((s: State) => s.b);
      useCommitProbe(stats.commits, () => `${a},${b}`);
      return <span>{`${a},${b}`}</span>;
    };
    const m = await mount(provide(store, <Component key="c" />));

    await act(async () => store.dispatch(new SetAAndB(10, 20)));

    expect(m.text()).toBe('10,20');
    expect(stats.commits).toEqual(['1,2', '10,20']);
    expect(stats.renders).toBe(2);
  });

Bdd(feature)
  .scenario('A consumer mounted after state changes, with no other consumer, reads the latest state.')
  .given('A store with no mounted consumers.')
  .when('An action changes a, and then a component that selects a is mounted.')
  .then('Its first render shows the latest value.')
  .run(async (_) => {
    // A14
    const store = createStore();
    store.dispatch(new SetA(42));

    const a = consumer((s) => s.a);
    const m = await mount(provide(store, <a.Component key="a" />));
    expect(m.text()).toBe('42');
    expect(a.stats.commits).toEqual(['42']);
  });

Bdd(feature)
  .scenario('A primitive or falsy root state works with the whole-state hook and the "no change" rules.')
  .given('A store whose state is the primitive [Initial].')
  .when('An action returns [Next], and then another returns null.')
  .then('The component shows [Initial], then [Next], and renders [Renders] times in total.')
  .and('The null return keeps the state and does not render.')
  .example(val('Initial', 0), val('Next', 1), val('Renders', 2))
  .example(val('Initial', ''), val('Next', 'x'), val('Renders', 2))
  .example(val('Initial', false), val('Next', true), val('Renders', 2))
  .example(val('Initial', NaN), val('Next', NaN), val('Renders', 1))
  .run(async (ctx) => {
    // A15
    const initial = ctx.example.val('Initial');
    const next = ctx.example.val('Next');
    const renders = ctx.example.val('Renders') as number;

    class SetRoot extends KissAction<unknown> {
      constructor(readonly value: unknown) {
        super();
      }

      reduce() {
        return this.value;
      }
    }

    const store = new Store<unknown>({ initialState: initial, logger: () => {} });
    const stats = { renders: 0 };
    const Component: React.FC = () => {
      stats.renders++;
      return <span>{show(useAllState())}</span>;
    };
    const m = await mount(<StoreProvider store={store}><Component /></StoreProvider>);
    expect(m.text()).toBe(show(initial));

    await act(async () => store.dispatch(new SetRoot(next)));
    expect(m.text()).toBe(show(next));
    expect(Object.is(store.state, next)).toBe(true);

    await act(async () => store.dispatch(new SetRoot(null)));
    expect(Object.is(store.state, next)).toBe(true);
    expect(m.text()).toBe(show(next));
    expect(stats.renders).toBe(renders);
  });
