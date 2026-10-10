import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useObject } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useObject with values that are not plain objects');

Bdd(feature)
  .scenario('useObject rebuilds the component when the selected value is replaced by a different one, which is not a plain object.')
  .given('A component that uses useObject to select a value from the state.')
  .and('The value is not a plain object or an array.')
  .when('An action replaces that value with a different one, of the same type.')
  .then('The component rebuilds.')
  .and('useObject returns the new value.')
  .example(val('Value', 'Map'))
  .example(val('Value', 'Set'))
  .example(val('Value', 'Date'))
  .example(val('Value', 'Class instance with only #private fields'))
  .run(async (ctx) => {
    const kind: Kind = ctx.example.val('Value');
    const [first, second] = createValues(kind);
    const store = createStore(first);
    const results: unknown[] = [];

    render(store, () => {
      results.push(useObject((state: State) => state.value));
      return null;
    });
    expect(results).toEqual([first]);

    act(() => store.dispatch(new SetValue(second)));
    expect(store.state.value).toBe(second);
    expect(results.length).toBe(2);
    expect(results[1]).toBe(second);
  });

Bdd(feature)
  .scenario('useObject does not rebuild the component while the selected value that is not a plain object is the same.')
  .given('A component that uses useObject to select a value from the state.')
  .and('The value is not a plain object or an array.')
  .when('An action changes another part of the state.')
  .then('The component does not rebuild.')
  .example(val('Value', 'Map'))
  .example(val('Value', 'Set'))
  .example(val('Value', 'Date'))
  .example(val('Value', 'Class instance with only #private fields'))
  .run(async (ctx) => {
    const kind: Kind = ctx.example.val('Value');
    const [first] = createValues(kind);
    const store = createStore(first);
    const results: unknown[] = [];

    render(store, () => {
      results.push(useObject((state: State) => state.value));
      return null;
    });

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(1);
    expect(results[0]).toBe(first);
  });

Bdd(feature)
  .scenario('useObject still compares objects without a prototype value by value.')
  .given('A component that uses useObject to select an object created with Object.create(null).')
  .when('An action changes another part of the state.')
  .then('The component does not rebuild.')
  .run(async (_) => {
    const store = createStore('a');
    const results: unknown[] = [];

    render(store, () => {
      results.push(useObject((state: State) => {
        const obj = Object.create(null);
        obj.value = state.value;
        return obj;
      }));
      return null;
    });

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(1);

    act(() => store.dispatch(new SetValue('b')));
    expect(results.length).toBe(2);
    expect((results[1] as any).value).toBe('b');
  });

Bdd(feature)
  .scenario('useObject compares a Map or a Set entry by entry.')
  .given('A component that uses useObject with a selector that creates a new Map or Set each time, with some parts of the state.')
  .when('An action changes another part of the state.')
  .and('Then an action changes one of the selected parts.')
  .then('The component only rebuilds when the selected part changes, with the new value.')
  .example(val('Collection', 'Map'))
  .example(val('Collection', 'Set'))
  .run(async (ctx) => {
    const collection: 'Map' | 'Set' = ctx.example.val('Collection');
    const store = createStore('a');
    const results: (Map<string, unknown> | Set<unknown>)[] = [];

    render(store, () => {
      results.push(useObject((state: State) =>
        collection === 'Map' ? new Map([['value', state.value]]) : new Set([state.value])));
      return null;
    });

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(1);

    act(() => store.dispatch(new SetValue('b')));
    expect(results.length).toBe(2);
    expect([...results[1].values()]).toEqual(['b']);
  });

Bdd(feature)
  .scenario('useObject rebuilds the component when a Map or a Set has the same entries in a different order.')
  .given('A component that uses useObject to select a Map or a Set from the state.')
  .when('An action replaces it with one that has the same entries, in a different order.')
  .then('The component rebuilds, with the entries in the new order.')
  .example(val('Collection', 'Map'))
  .example(val('Collection', 'Set'))
  .run(async (ctx) => {
    const collection: 'Map' | 'Set' = ctx.example.val('Collection');
    const [first, second] = collection === 'Map'
      ? [new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]])]
      : [new Set(['a', 'b']), new Set(['b', 'a'])];
    const store = createStore(first);
    const results: unknown[] = [];

    render(store, () => {
      results.push(useObject((state: State) => state.value));
      return null;
    });

    act(() => store.dispatch(new SetValue(second)));
    expect(results.length).toBe(2);
    expect(results[1]).toBe(second);
  });

Bdd(feature)
  .scenario('useObject compares other objects by identity, even when they have the same values.')
  .given('A component that uses useObject with a selector that creates a new object each time, with the same values.')
  .and('The object is not a plain object, an array, a Map or a Set.')
  .when('An action changes another part of the state.')
  .then('The component rebuilds, like it would with useSelect.')
  .example(val('Object', 'Class instance'))
  .example(val('Object', 'Date'))
  .example(val('Object', 'Subclass of Map'))
  .run(async (ctx) => {
    const kind: string = ctx.example.val('Object');
    const create = (): any =>
      kind === 'Class instance' ? new Point(1, 2)
        : kind === 'Date' ? new Date(1000)
          : new TagMap([['a', 1]]);
    const store = createStore('a');
    const results: unknown[] = [];

    render(store, () => {
      // Stops a render loop, so that the test fails instead of hanging.
      if (results.length > 20) throw new Error('Render loop.');
      results.push(useObject((_: State) => create()));
      return null;
    });
    expect(results.length).toBe(1);

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(2);
  });

Bdd(feature)
  .scenario('The useObject type only accepts selectors that return a plain object, an array, a Map or a Set.')
  .given('Components with useObject selectors that return different kinds of values.')
  .when('The code is type-checked.')
  .then('A plain object, an array, a Map, a Set, or null or undefined, compiles.')
  .and('A class instance, a Date, a string or a function does not compile.')
  .run(async (_) => {
    // Each `@ts-expect-error` fails the compilation if the error does NOT happen.
    type Info = { name: string };
    const results: unknown[] = [];

    render(createStore('a'), () => {
      results.push(useObject((state: State) => ({other: state.other})));
      results.push(useObject((state: State): [string, string] => [state.other, state.other]));
      results.push(useObject((state: State) => new Map([['other', state.other]])));
      results.push(useObject((state: State) => new Set([state.other])));
      results.push(useObject((state: State) => state.other === '' ? null : {other: state.other}));
      results.push(useObject((state: State) => state.other === '' ? {other: state.other} : undefined));
      results.push(useObject((state: State): Info => ({name: state.other})));

      // @ts-expect-error A class instance is not allowed.
      results.push(useObject((_: State) => new Point(1, 2)));
      // @ts-expect-error A class instance with #private fields is not allowed.
      results.push(useObject((_: State) => new Counter(1)));
      // @ts-expect-error A Date is not allowed.
      results.push(useObject((_: State) => new Date(1000)));
      // @ts-expect-error A string is not allowed. Use useSelect instead.
      results.push(useObject((state: State) => state.other));
      // @ts-expect-error A function is not allowed.
      results.push(useObject((_: State) => () => 1));
      return null;
    });

    expect(results.length).toBe(12);
    expect(results.slice(0, 7)).toEqual([
      {other: 'initial'}, ['initial', 'initial'], new Map([['other', 'initial']]), new Set(['initial']),
      {other: 'initial'}, undefined, {name: 'initial'},
    ]);
  });

type Kind = 'Map' | 'Set' | 'Date' | 'Class instance with only #private fields';

class Point {
  constructor(readonly x: number, readonly y: number) {
  }
}

class TagMap extends Map<string, number> {
}

class Counter {
  #count: number;

  constructor(count: number) {
    this.#count = count;
  }

  get count() {
    return this.#count;
  }
}

function createValues(kind: Kind): [unknown, unknown] {
  switch (kind) {
    case 'Map':
      return [new Map(), new Map([['a', 1]])];
    case 'Set':
      return [new Set(), new Set(['a'])];
    case 'Date':
      return [new Date(1000), new Date(2000)];
    case 'Class instance with only #private fields':
      return [new Counter(1), new Counter(2)];
  }
}

class State {
  // The value is `any`, since useObject's type doesn't accept some of the values tested here.
  constructor(readonly value: any, readonly other: string) {
  }
}

class SetValue extends KissAction<State> {
  constructor(readonly value: unknown) {
    super();
  }

  reduce() {
    return new State(this.value, this.state.other);
  }
}

class SetOther extends KissAction<State> {
  constructor(readonly other: string) {
    super();
  }

  reduce() {
    return new State(this.state.value, this.other);
  }
}

function createStore(value: unknown) {
  return new Store<State>({initialState: new State(value, 'initial'), logger: () => {}});
}

function render(store: Store<State>, component: React.FC) {
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, {store, children: React.createElement(component)}));
  });
}
