/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act, useEffect, useState } from 'react';
import { KissAction, Store, StoreProvider, useObject, useSelect } from '../src';
import { failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';

// Scenario IDs B01 to B11 of STATE_REFACTOR.md. B11 is covered by the concurrent rendering
// suite (G04), which can abandon a render.

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Selecting objects that keep their identity while their values are the same');

class Point {
  constructor(readonly x: number, readonly y: number) {}
}

class State {
  constructor(
    readonly name: string,
    readonly age: number,
    readonly other: string,
    readonly items: readonly string[] = ['a', 'b'],
    readonly map: ReadonlyMap<string, unknown> = new Map([['k1', 1], ['k2', 2]]),
    readonly set: ReadonlySet<unknown> = new Set([1, 2]),
    readonly point: Point = new Point(1, 2),
    readonly value: unknown = undefined,
  ) {}

  copy(changes: Partial<State>): State {
    return new State(
      changes.name ?? this.name,
      changes.age ?? this.age,
      changes.other ?? this.other,
      changes.items ?? this.items,
      changes.map ?? this.map,
      changes.set ?? this.set,
      changes.point ?? this.point,
      'value' in changes ? changes.value : this.value,
    );
  }
}

class Change extends KissAction<State> {
  constructor(readonly changes: Partial<State>) {
    super();
  }

  reduce() {
    return this.state.copy(this.changes);
  }
}

function createStore(initialState = new State('Mary', 30, 'initial')) {
  return new Store<State>({ initialState, logger: () => {} });
}

/** A component that selects with `useObject` and records its renders, results and commits. */
function objectConsumer<T extends Record<string, unknown> | readonly unknown[] | ReadonlyMap<unknown, unknown> | ReadonlySet<unknown> | null | undefined>(
  selector: (state: State) => T,
) {
  const stats = { renders: 0, results: [] as T[], commits: 0 };
  const Component: React.FC = () => {
    stats.renders++;
    const value = useObject(selector);
    stats.results.push(value);
    useCommitProbe([] as number[], () => stats.commits++);
    return null;
  };
  return { Component, stats, last: () => stats.results[stats.results.length - 1] };
}

function provide(store: Store<State>, ...children: React.ReactElement[]) {
  return <StoreProvider store={store}>{children}</StoreProvider>;
}

Bdd(feature)
  .scenario('An unrelated state change does not render the consumer, which keeps the same object.')
  .given('A mounted component that selects {name, age} with useObject.')
  .when('An action changes another field of the state.')
  .then('The component does not render again.')
  .and('Its selected object is the same reference as before.')
  .run(async (_) => {
    // B01
    const store = createStore();
    const c = objectConsumer((s) => ({ name: s.name, age: s.age }));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();
    expect(first).toEqual({ name: 'Mary', age: 30 });

    await act(async () => store.dispatch(new Change({ other: 'changed' })));
    expect(c.stats.renders).toBe(1);
    expect(c.stats.commits).toBe(1);
    expect(c.last()).toBe(first);
  });

Bdd(feature)
  .scenario('Changing one of the selected values renders the consumer with a new object.')
  .given('A mounted component that selects {name, age} with useObject.')
  .when('An action changes the [Field].')
  .then('The component renders again, with a new object holding the new value.')
  .example(val('Field', 'name'))
  .example(val('Field', 'age'))
  .run(async (ctx) => {
    // B02
    const field = ctx.example.val('Field') as 'name' | 'age';
    const store = createStore();
    const c = objectConsumer((s) => ({ name: s.name, age: s.age }));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    await act(async () => store.dispatch(new Change(field === 'name' ? { name: 'Anna' } : { age: 31 })));
    expect(c.stats.renders).toBe(2);
    expect(c.last()).not.toBe(first);
    expect(c.last()).toEqual(field === 'name' ? { name: 'Anna', age: 30 } : { name: 'Mary', age: 31 });
  });

Bdd(feature)
  .scenario('When the parent renders the consumer again with an equivalent inline selector, the object is reused.')
  .given('A component that selects {name, age} with an inline useObject selector, and passes it to a memoized child and an effect.')
  .when('Its parent renders it again, because of local state.')
  .then('The selected object is the same reference, the memoized child does not render, and the effect does not run again.')
  .run(async (_) => {
    // B03
    const store = createStore();
    const childRenders = { count: 0 };
    const effectRuns = { count: 0 };
    const results: unknown[] = [];
    let rerenderParent!: () => void;

    const Child = React.memo(function Child({ user }: { user: { name: string, age: number } }) {
      childRenders.count++;
      return <span>{`${user.name}:${user.age}`}</span>;
    });

    const Consumer: React.FC<{ tick: number }> = () => {
      const user = useObject((s: State) => ({ name: s.name, age: s.age }));
      results.push(user);
      useEffect(() => {
        effectRuns.count++;
      }, [user]);
      return <Child user={user} />;
    };

    const Parent: React.FC = () => {
      const [tick, setTick] = useState(0);
      rerenderParent = () => setTick((t) => t + 1);
      return <Consumer tick={tick} />;
    };

    const m = await mount(provide(store, <Parent key="p" />));
    expect(m.text()).toBe('Mary:30');
    expect(childRenders.count).toBe(1);
    expect(effectRuns.count).toBe(1);

    await act(async () => rerenderParent());
    expect(results.length).toBe(2);
    expect(results[1]).toBe(results[0]);
    expect(childRenders.count).toBe(1);
    expect(effectRuns.count).toBe(1);

    await act(async () => store.dispatch(new Change({ age: 31 })));
    expect(m.text()).toBe('Mary:31');
    expect(childRenders.count).toBe(2);
    expect(effectRuns.count).toBe(2);
  });

Bdd(feature)
  .scenario('An array selection is reused while its items are the same, in the same order.')
  .given('A mounted component that selects an array with useObject.')
  .when('The state array is replaced by one that is [Change].')
  .then('The component [Renders] again.')
  .example(val('Change', 'equal'), val('Renders', false))
  .example(val('Change', 'reordered'), val('Renders', true))
  .example(val('Change', 'longer'), val('Renders', true))
  .example(val('Change', 'shorter'), val('Renders', true))
  .example(val('Change', 'one item changed'), val('Renders', true))
  .run(async (ctx) => {
    // B04
    const change = ctx.example.val('Change') as string;
    const renders = ctx.example.val('Renders') as boolean;
    const store = createStore();
    // Selects a new array each time, with the items of the state array.
    const c = objectConsumer((s) => [...s.items]);
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    const next: Record<string, string[]> = {
      'equal': ['a', 'b'],
      'reordered': ['b', 'a'],
      'longer': ['a', 'b', 'c'],
      'shorter': ['a'],
      'one item changed': ['a', 'c'],
    };
    await act(async () => store.dispatch(new Change({ items: next[change] })));

    expect(c.stats.renders).toBe(renders ? 2 : 1);
    if (renders) expect(c.last()).toEqual(next[change]);
    else expect(c.last()).toBe(first);
  });

Bdd(feature)
  .scenario('A Map selection is reused while its entries are the same, in the same order.')
  .given('A mounted component that selects a Map with useObject.')
  .when('The state Map is replaced by one that is [Change].')
  .then('The component [Renders] again.')
  .example(val('Change', 'equal'), val('Renders', false))
  .example(val('Change', 'reordered'), val('Renders', true))
  .example(val('Change', 'bigger'), val('Renders', true))
  .example(val('Change', 'different key'), val('Renders', true))
  .example(val('Change', 'different value'), val('Renders', true))
  .example(val('Change', 'equal object value'), val('Renders', true))
  .run(async (ctx) => {
    // B05
    const change = ctx.example.val('Change') as string;
    const renders = ctx.example.val('Renders') as boolean;
    const shared = { id: 1 };
    const store = createStore(new State('Mary', 30, 'i', [], new Map<string, unknown>([['k1', 1], ['k2', shared]])));
    const c = objectConsumer((s) => new Map(s.map));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    const next: Record<string, Map<string, unknown>> = {
      'equal': new Map<string, unknown>([['k1', 1], ['k2', shared]]),
      'reordered': new Map<string, unknown>([['k2', shared], ['k1', 1]]),
      'bigger': new Map<string, unknown>([['k1', 1], ['k2', shared], ['k3', 3]]),
      'different key': new Map<string, unknown>([['k1', 1], ['kX', shared]]),
      'different value': new Map<string, unknown>([['k1', 2], ['k2', shared]]),
      'equal object value': new Map<string, unknown>([['k1', 1], ['k2', { id: 1 }]]),
    };
    await act(async () => store.dispatch(new Change({ map: next[change] })));

    expect(c.stats.renders).toBe(renders ? 2 : 1);
    if (renders) expect(c.last()).toEqual(next[change]);
    else expect(c.last()).toBe(first);
  });

Bdd(feature)
  .scenario('A Set selection is reused while its values are the same, in the same order.')
  .given('A mounted component that selects a Set with useObject.')
  .when('The state Set is replaced by one that is [Change].')
  .then('The component [Renders] again.')
  .example(val('Change', 'equal'), val('Renders', false))
  .example(val('Change', 'reordered'), val('Renders', true))
  .example(val('Change', 'bigger'), val('Renders', true))
  .example(val('Change', 'different value'), val('Renders', true))
  .run(async (ctx) => {
    // B06
    const change = ctx.example.val('Change') as string;
    const renders = ctx.example.val('Renders') as boolean;
    const store = createStore();
    const c = objectConsumer((s) => new Set(s.set));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    const next: Record<string, Set<unknown>> = {
      'equal': new Set([1, 2]),
      'reordered': new Set([2, 1]),
      'bigger': new Set([1, 2, 3]),
      'different value': new Set([1, 3]),
    };
    await act(async () => store.dispatch(new Change({ set: next[change] })));

    expect(c.stats.renders).toBe(renders ? 2 : 1);
    if (renders) expect(c.last()).toEqual(next[change]);
    else expect(c.last()).toBe(first);
  });

Bdd(feature)
  .scenario('Nested values are compared by identity, not deeply.')
  .given('A mounted component that selects {point} with useObject, where point is an object in the state.')
  .when('An unrelated field changes, so the same point object is selected.')
  .and('Then the point is replaced by a new object with the same x and y.')
  .then('The unrelated change does not render the component.')
  .and('The replacement renders it, since the nested value is a different object.')
  .run(async (_) => {
    // B07
    const store = createStore();
    const c = objectConsumer((s) => ({ point: s.point }));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    await act(async () => store.dispatch(new Change({ other: 'x' })));
    expect(c.stats.renders).toBe(1);
    expect(c.last()).toBe(first);

    await act(async () => store.dispatch(new Change({ point: new Point(1, 2) })));
    expect(c.stats.renders).toBe(2);
    expect(c.last()).not.toBe(first);
    expect(c.last().point).toBe(store.state.point);
  });

Bdd(feature)
  .scenario('Plain objects are compared by their own keys and values, whatever their key order or prototype.')
  .given('A mounted component whose useObject selector builds [Object] from the state value.')
  .when('The state value changes from [From] to [To].')
  .then('The component [Renders] again.')
  .example(val('Object', 'null prototype'), val('From', 1), val('To', 1), val('Renders', false))
  .example(val('Object', 'null prototype'), val('From', 1), val('To', 2), val('Renders', true))
  .example(val('Object', 'reordered keys'), val('From', 1), val('To', 1), val('Renders', false))
  .example(val('Object', 'missing vs undefined key'), val('From', 'present'), val('To', 'missing'), val('Renders', true))
  .example(val('Object', 'missing vs undefined key'), val('From', 'missing'), val('To', 'missing'), val('Renders', false))
  .example(val('Object', 'changed prototype'), val('From', 1), val('To', 1), val('Renders', true))
  .run(async (ctx) => {
    // B08
    const kind = ctx.example.val('Object') as string;
    const from = ctx.example.val('From');
    const to = ctx.example.val('To');
    const renders = ctx.example.val('Renders') as boolean;
    const store = createStore(new State('Mary', 30, 'i', [], new Map(), new Set(), new Point(0, 0), from));

    // Alternates between two shapes on each call, so that each selection builds the object differently.
    let calls = 0;
    const selector = (s: State): Record<string, unknown> => {
      calls++;
      const v = s.value;
      switch (kind) {
        case 'null prototype': {
          const obj = Object.create(null);
          obj.v = v;
          return obj;
        }
        case 'reordered keys':
          return calls % 2 === 1 ? { v, w: 0 } : { w: 0, v };
        case 'missing vs undefined key':
          return v === 'missing' ? {} : { v: undefined };
        case 'changed prototype': {
          // The same keys and values, but a different prototype each time.
          return Object.assign(Object.create({ marker: calls }), { v });
        }
      }
      throw new Error('Unknown object kind');
    };

    const c = objectConsumer(selector);
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    await act(async () => store.dispatch(new Change({ value: to })));
    expect(c.stats.renders).toBe(renders ? 2 : 1);
    if (!renders) expect(c.last()).toBe(first);
  });

Bdd(feature)
  .scenario('Values that are not plain objects, arrays, Maps or Sets are compared by identity.')
  .given('A mounted component that selects a [Kind] from the state with useObject.')
  .when('An unrelated field changes, and then the value is replaced by an equal-looking new instance.')
  .then('The unrelated change does not render the component, and the same instance is returned.')
  .and('The replacement renders it, even though the new instance has the same fields.')
  .example(val('Kind', 'Date'))
  .example(val('Kind', 'class instance'))
  .example(val('Kind', 'Map subclass'))
  .example(val('Kind', 'Set subclass'))
  .run(async (ctx) => {
    // B09 (a runtime fixture: the type restrictions of `useObject` are checked in the integration suite, I08).
    const kind = ctx.example.val('Kind') as string;
    class MyMap extends Map<string, number> {}
    class MySet extends Set<number> {}
    const make = (): unknown => {
      switch (kind) {
        case 'Date': return new Date(2020, 1, 1);
        case 'class instance': return new Point(1, 2);
        case 'Map subclass': return new MyMap([['a', 1]]);
        case 'Set subclass': return new MySet([1]);
      }
      throw new Error('Unknown kind');
    };
    const first = make();
    const store = createStore(new State('Mary', 30, 'i', [], new Map(), new Set(), new Point(0, 0), first));
    const c = objectConsumer((s) => s.value as any);
    await mount(provide(store, <c.Component key="c" />));
    expect(c.last()).toBe(first);

    await act(async () => store.dispatch(new Change({ other: 'x' })));
    expect(c.stats.renders).toBe(1);
    expect(c.last()).toBe(first);

    const second = make();
    expect(second).toEqual(first);
    await act(async () => store.dispatch(new Change({ value: second })));
    expect(c.stats.renders).toBe(2);
    expect(c.last()).toBe(second);
  });

Bdd(feature)
  .scenario('The values inside the selected object are compared with Object.is.')
  .given('A mounted component that selects {v} with useObject, where v is [From].')
  .when('v changes to [To].')
  .then('The component [Renders] again.')
  .example(val('From', NaN), val('To', NaN), val('Renders', false))
  .example(val('From', 0), val('To', -0), val('Renders', true))
  .example(val('From', null), val('To', 'undefined'), val('Renders', true))
  .example(val('From', 'undefined'), val('To', 'undefined'), val('Renders', false))
  .example(val('From', null), val('To', null), val('Renders', false))
  .run(async (ctx) => {
    // B10. The BDD tool can't show `undefined` in a table, so the examples use the text 'undefined'.
    const parse = (value: unknown) => value === 'undefined' ? undefined : value;
    const from = parse(ctx.example.val('From'));
    const to = parse(ctx.example.val('To'));
    const renders = ctx.example.val('Renders') as boolean;
    const store = createStore(new State('Mary', 30, 'i', [], new Map(), new Set(), new Point(0, 0), from));
    const c = objectConsumer((s) => ({ v: s.value }));
    await mount(provide(store, <c.Component key="c" />));
    const first = c.last();

    await act(async () => store.dispatch(new Change({ value: to })));
    expect(c.stats.renders).toBe(renders ? 2 : 1);
    if (!renders) expect(c.last()).toBe(first);
    else expect(Object.is(c.last().v, to)).toBe(true);
  });

Bdd(feature)
  .scenario('useObject and useSelect in the same component see the same state.')
  .given('A mounted component that selects {name} with useObject and age with useSelect.')
  .when('One action changes both the name and the age.')
  .then('The component commits the new name and the new age together.')
  .run(async (_) => {
    // B01-B02 companion: both hooks share the state snapshot.
    const store = createStore();
    const commits: string[] = [];
    const Component: React.FC = () => {
      const user = useObject((s: State) => ({ name: s.name }));
      const age = useSelect((s: State) => s.age);
      useCommitProbe(commits, () => `${user.name}:${age}`);
      return null;
    };
    await mount(provide(store, <Component key="c" />));

    await act(async () => store.dispatch(new Change({ name: 'Anna', age: 31 })));
    expect(commits).toEqual(['Mary:30', 'Anna:31']);
  });
