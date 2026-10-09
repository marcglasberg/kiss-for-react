import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/missingInitialState';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: missing-initial-state');

const stateWithStatic = `class State {
  constructor(readonly count: number) {}
  static initialState: State = new State(0);
}
`;

const stateWithoutStatic = `class State {
  constructor(readonly count: number) {}
}
`;

Bdd(feature)
  .scenario('A store created with the static initialState of the state class is fine.')
  .given('A state class with a static initialState, used by the store.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true), val('Store', 'createStore<State>({ initialState: State.initialState })'))
  .example(val('Type information', false), val('Store', 'createStore<State>({ initialState: State.initialState })'))
  .example(val('Type information', true), val('Store', 'new Store<State>({ initialState: State.initialState })'))
  .example(val('Type information', true), val('Store', 'createStore({ initialState: State.initialState })'))
  .run(async (ctx) => {
    const code = `import { createStore, Store } from 'kiss-for-react';
${stateWithStatic}
export const store = ${ctx.example.val('Store')};
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A store that creates the state with the constructor is a warning, with a suggestion to use initialState.')
  .given('A state class with a static initialState.')
  .and('A store that creates the initial state with new.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning in the initial state.')
  .and('The suggestion replaces it with State.initialState, and the code compiles.')
  .example(val('Type information', true), val('Store', 'createStore<State>'))
  .example(val('Type information', false), val('Store', 'createStore<State>'))
  .example(val('Type information', true), val('Store', 'createStore'))
  .example(val('Type information', false), val('Store', 'new Store'))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { createStore, Store } from 'kiss-for-react';
${stateWithStatic}
export const store = ${ctx.example.val('Store')}({ initialState: new State(5) });
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['new State(5)']);
    expect(result.messages[0].message).toBe(
      'Use `State.initialState` instead of creating the state here. This keeps the initial state in one place, ' +
      'to reuse it in tests and to reset the state.');
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain('({ initialState: State.initialState });');
    if (types) expect(lint(rule, fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('When initialState is a static method, the suggestion calls it.')
  .given('A state class with a static initialState method.')
  .and('A store that creates the initial state with new.')
  .when('The code is linted.')
  .then('The suggestion replaces it with State.initialState().')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { createStore } from 'kiss-for-react';
class State {
  constructor(readonly count: number) {}
  static initialState() { return new State(0); }
}
export const store = createStore<State>({ initialState: new State(5) });
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.withSuggestion(0, 0)).toContain('({ initialState: State.initialState() });');
  });

Bdd(feature)
  .scenario('A state class without a static initialState is a warning.')
  .given('A state class without a static initialState.')
  .and('A store of that state.')
  .when('The code is linted, with or without type information.')
  .then('There is a warning, with no suggestion.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { createStore } from 'kiss-for-react';
${stateWithoutStatic}
export const store = createStore<State>({ initialState: new State(0) });
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['new State(0)']);
    expect(result.messages[0].message).toBe(
      'The state class `State` has no static `initialState`. Add one, like `static initialState = new State(...)`, ' +
      'and create the store with `State.initialState`. This keeps the initial state in one place, to reuse it in ' +
      'tests and to reset the state.');
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, the state class is checked in another file.')
  .given('A state class in another file, with or without a static initialState.')
  .and('A store that uses a value from another function as the initial state.')
  .when('The code is linted with type information.')
  .then('There is a warning only when the state class has no static initialState.')
  .example(val('Has initialState', true))
  .example(val('Has initialState', false))
  .run(async (ctx) => {
    const hasInitialState = ctx.example.val('Has initialState') as boolean;
    const code = `import { createStore } from 'kiss-for-react';
import { State, loadState } from './state';
export const store = createStore<State>({ initialState: loadState() });
`;
    const files = {
      'state.ts': `export ${hasInitialState ? stateWithStatic : stateWithoutStatic}
export function loadState() { return new State(1); }
`,
    };
    expect(lint(rule, code, {files}).messages.length).toBe(hasInitialState ? 0 : 1);
  });

Bdd(feature)
  .scenario('States that are not classes are not reported.')
  .given('A store whose state is a number, an object, or an interface.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true), val('Store', 'createStore<number>({ initialState: 0 })'))
  .example(val('Type information', false), val('Store', 'createStore<number>({ initialState: 0 })'))
  .example(val('Type information', true), val('Store', 'createStore({ initialState: { count: 0 } })'))
  .example(val('Type information', true), val('Store', 'createStore<Counter>({ initialState: { count: 0 } })'))
  .example(val('Type information', false), val('Store', 'createStore<Counter>({ initialState: { count: 0 } })'))
  .example(val('Type information', true), val('Store', 'createStore<Map<string, number>>({ initialState: new Map() })'))
  .example(val('Type information', false), val('Store', 'createStore({ initialState: new Map<string, number>() })'))
  .run(async (ctx) => {
    const code = `import { createStore } from 'kiss-for-react';
interface Counter { count: number }
export const store = ${ctx.example.val('Store')};
`;
    expect(lint(rule, code, {types: ctx.example.val('Type information') as boolean}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, a state class from another file is only reported when the store calls its constructor.')
  .given('A state class imported from another file.')
  .and('Two stores: one that calls its constructor, and one that uses a function.')
  .when('The code is linted without type information.')
  .then('There is a warning only for the constructor, without a suggestion.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';
import { State, loadState } from './state';
export const store1 = createStore<State>({ initialState: new State(0) });
export const store2 = createStore<State>({ initialState: loadState() });
`;
    const result = lint(rule, code, {types: false});
    expect(result.messages.map((m) => m.text)).toEqual(['new State(0)']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Stores created in tests are not reported.')
  .given('A test file that creates a store with new State().')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';
${stateWithoutStatic}
export const store = createStore<State>({ initialState: new State(0) });
`;
    expect(lint(rule, code, {filename: '__tests__/counter.test.ts'}).messages).toEqual([]);
  });
