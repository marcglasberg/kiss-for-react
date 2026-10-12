import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Logging state changes of any type');

class Inc extends KissAction<number> {
  reduce() { return this.state + 1; }
}

class Append extends KissAction<string> {
  constructor(readonly text: string) { super(); }
  reduce() { return this.state + this.text; }
}

class SameNumber extends KissAction<number> {
  reduce() { return this.state; }
}

Bdd(feature)
  .scenario('The state changes of a number state are logged.')
  .given('A store whose state is the number 0, which logs state changes.')
  .when('An action changes the state to 1.')
  .then('The state change is logged.')
  .run(async (_) => {
    // Given:
    const logs: string[] = [];
    const store = new Store<number>({ initialState: 0, logger: o => logs.push(String(o)) });

    // When:
    store.dispatch(new Inc());

    // Then:
    expect(store.state).toBe(1);
    expect(logs).toContain('State: 0 → 1; ');
  });

Bdd(feature)
  .scenario('The state changes of a string state are logged.')
  .given('A store whose state is the string "a", which logs state changes.')
  .when('An action changes the state to "ab".')
  .then('The state change is logged.')
  .run(async (_) => {
    // Given:
    const logs: string[] = [];
    const store = new Store<string>({ initialState: 'a', logger: o => logs.push(String(o)) });

    // When:
    store.dispatch(new Append('b'));

    // Then:
    expect(store.state).toBe('ab');
    expect(logs).toContain('State: a → ab; ');
  });

Bdd(feature)
  .scenario('Nothing is logged when a number state does not change.')
  .given('A store whose state is the number 0, which logs state changes.')
  .when('An action returns the same number.')
  .then('No state change is logged.')
  .run(async (_) => {
    // Given:
    const logs: string[] = [];
    const store = new Store<number>({ initialState: 0, logger: o => logs.push(String(o)) });

    // When:
    store.dispatch(new SameNumber());

    // Then:
    expect(logs.filter(log => log.startsWith('State'))).toEqual([]);
  });

Bdd(feature)
  .scenario('The change of a <Type> field is described.')
  .given('A state with a <Type> field.')
  .when('The field changes.')
  .then('The description shows the old and the new value of the field.')
  .example(
    val('Type', 'Date'),
    val('Before', { d: new Date(0) }),
    val('After', { d: new Date(1000) }),
    val('Description', 'State d: 1970-01-01T00:00:00.000Z → 1970-01-01T00:00:01.000Z; '))
  .example(
    val('Type', 'Set'),
    val('Before', { tags: new Set(['a', 'b']) }),
    val('After', { tags: new Set(['a', 'c']) }),
    val('Description', 'State tags: Set{a, b} → Set{a, c}; '))
  .example(
    val('Type', 'Set with a new element'),
    val('Before', { tags: new Set(['a']) }),
    val('After', { tags: new Set(['a', 'b']) }),
    val('Description', 'State tags: Set{a} → Set{a, b}; '))
  .example(
    val('Type', 'Map with a changed value'),
    val('Before', { prices: new Map([['IBM', 100], ['AAPL', 200]]) }),
    val('After', { prices: new Map([['IBM', 100], ['AAPL', 210]]) }),
    val('Description', 'State prices[AAPL]: 200 → 210; '))
  .example(
    val('Type', 'Map with a new key'),
    val('Before', { prices: new Map([['IBM', 100]]) }),
    val('After', { prices: new Map([['IBM', 100], ['AAPL', 200]]) }),
    val('Description', 'State prices[AAPL]: undefined → 200; '))
  .example(
    val('Type', 'Map with a removed key'),
    val('Before', { prices: new Map([['IBM', 100], ['AAPL', 200]]) }),
    val('After', { prices: new Map([['IBM', 100]]) }),
    val('Description', 'State prices[AAPL]: 200 → undefined; '))
  .example(
    val('Type', 'Map with a changed nested object'),
    val('Before', { users: new Map([['u1', { name: 'Ann' }]]) }),
    val('After', { users: new Map([['u1', { name: 'Bob' }]]) }),
    val('Description', 'State users[u1].name: Ann → Bob; '))
  .run(async (ctx) => {
    // Given:
    const before = ctx.example.val('Before');

    // When:
    const after = ctx.example.val('After');

    // Then:
    expect(Store.describeStateChange(before, after)).toBe(ctx.example.val('Description'));
  });

Bdd(feature)
  .scenario('A <Type> field replaced by an equal one is not described.')
  .given('A state with a <Type> field.')
  .when('The field is replaced by a new object with the same contents.')
  .then('The description is empty.')
  .example(
    val('Type', 'Date'),
    val('Before', { d: new Date(1000) }),
    val('After', { d: new Date(1000) }))
  .example(
    val('Type', 'Set'),
    val('Before', { tags: new Set(['a', 'b']) }),
    val('After', { tags: new Set(['b', 'a']) }))
  .example(
    val('Type', 'Map'),
    val('Before', { prices: new Map([['IBM', 100]]) }),
    val('After', { prices: new Map([['IBM', 100]]) }))
  .run(async (ctx) => {
    // Given:
    const before = ctx.example.val('Before');

    // When:
    const after = ctx.example.val('After');

    // Then:
    expect(Store.describeStateChange(before, after)).toBe('');
  });

Bdd(feature)
  .scenario('A state that is itself a <Type> is described when it changes.')
  .given('A state that is a <Type>.')
  .when('The state changes.')
  .then('The description shows the old and the new state.')
  .example(
    val('Type', 'number'),
    val('Before', 1),
    val('After', 2),
    val('Description', 'State: 1 → 2; '))
  .example(
    val('Type', 'Date'),
    val('Before', new Date(0)),
    val('After', new Date(1000)),
    val('Description', 'State: 1970-01-01T00:00:00.000Z → 1970-01-01T00:00:01.000Z; '))
  .example(
    val('Type', 'Map'),
    val('Before', new Map([['a', 1]])),
    val('After', new Map([['a', 2]])),
    val('Description', 'State [a]: 1 → 2; '))
  .run(async (ctx) => {
    // Given:
    const before = ctx.example.val('Before');

    // When:
    const after = ctx.example.val('After');

    // Then:
    expect(Store.describeStateChange(before, after)).toBe(ctx.example.val('Description'));
  });

Bdd(feature)
  .scenario('A field that changes from a value to null, or to another type, is described.')
  .given('A state with a field that is an object, and another that is a number.')
  .when('The object field becomes null, and the number field becomes a string.')
  .then('The description shows both changes.')
  .run(async (_) => {
    // Given:
    const before = { user: { name: 'Ann' }, count: 1 };

    // When:
    const after = { user: null, count: 'one' };

    // Then:
    expect(Store.describeStateChange(before, after)).toBe(
      'State user: [object Object] → null; State count: 1 → one; ');
  });
