import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/stateClassMustBeImmutable';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: state-class-must-be-immutable');

Bdd(feature)
  .scenario('A field of the state class that is not readonly is a warning, fixed by adding readonly.')
  .given('A state class with a field that is not readonly, a parameter property that is not readonly, and a readonly field.')
  .and('A store of that state, in the same file.')
  .when('The code is linted.')
  .then('There is a warning for each field that is not readonly.')
  .and('The fix adds readonly, and the fixed code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { createStore } from 'kiss-for-react';

export class State {
  count: number;
  readonly name: string;
  constructor(public age: number, private readonly id: string) {
    this.count = 0;
    this.name = 'Mary';
  }
  static initialState: State = new State(0, 'a');
}

export const store = createStore<State>({ initialState: State.initialState });
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['count', 'age']);
    expect(result.messages[0].message).toBe(
      'The field `count` of the state class `State` should be `readonly`. Kiss compares states by identity, ' +
      'so changing a field in place doesn\'t re-render the components, and isn\'t persisted. Create a new state instead.');
    expect(result.fixed).toContain('  readonly count: number;');
    expect(result.fixed).toContain('constructor(public readonly age: number, private readonly id: string)');
    if (types) expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The classes that the state contains are state classes too.')
  .given('A state class with an array of User, a map of Address, and a Settings or null.')
  .and('User, Address and Settings have fields that are not readonly.')
  .and('Only an action, in the same file, says State is the state.')
  .when('The code is linted.')
  .then('There are warnings in State, User, Address and Settings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { KissAction } from 'kiss-for-react';

class User { name = ''; }
class Address { street = ''; }
class Settings { dark = false; }

class State {
  users: readonly User[] = [];
  readonly addresses: ReadonlyMap<string, Address> = new Map();
  readonly settings: Settings | null = null;
}

class Action extends KissAction<State> {
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['name', 'street', 'dark', 'users']);
  });

Bdd(feature)
  .scenario('With type information, the state classes are found in other files.')
  .given('A state class in its own file, with a field that is not readonly.')
  .and('A base action, in another file, that extends KissAction of that state.')
  .when('The state file is linted, with and without type information.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since nothing in the file says it is a state class.')
  .run(async (_) => {
    const code = `export class State {
  count = 0;
}
`;
    const files = {
      'action.ts': `import { KissAction } from 'kiss-for-react';
import { State } from './state';
export abstract class Action extends KissAction<State> {}
`,
    };
    expect(lint(rule, code, {filename: 'state.ts', files}).messages.map((m) => m.text)).toEqual(['count']);
    expect(lint(rule, code, {filename: 'state.ts', files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, the state is found from the store, with or without a type argument.')
  .given('A state class in its own file.')
  .and('A store created in another file, in one of several ways.')
  .when('The state file is linted with type information.')
  .then('There is a warning for its field that is not readonly.')
  .example(val('Store', `createStore<State>({ initialState: new State() })`))
  .example(val('Store', `createStore({ initialState: new State() })`))
  .example(val('Store', `new Store<State>({ initialState: new State() })`))
  .example(val('Store', `null as unknown as Store<State>`))
  .run(async (ctx) => {
    const code = `export class State {
  count = 0;
}
`;
    const files = {
      'store.ts': `import { createStore, Store } from 'kiss-for-react';
import { State } from './state';
export const store = ${ctx.example.val('Store')};
`,
    };
    expect(lint(rule, code, {filename: 'state.ts', files}).messages.map((m) => m.text)).toEqual(['count']);
  });

Bdd(feature)
  .scenario('With type information, a generic base action and superclasses are followed.')
  .given('A generic base action, and an action that extends it with the state class.')
  .and('The state class extends a base class, in another file, with a field that is not readonly.')
  .when('The base class file is linted.')
  .then('There is a warning for the field of the base class.')
  .run(async (_) => {
    const code = `export class BaseState {
  version = 1;
}
`;
    const files = {
      'state.ts': `import { BaseState } from './base';
export class State extends BaseState {}
`,
      'action.ts': `import { KissAction } from 'kiss-for-react';
import { State } from './state';
abstract class Base<S> extends KissAction<S> {}
export class Increment extends Base<State> {
  reduce() { return null; }
}
`,
    };
    expect(lint(rule, code, {filename: 'base.ts', files}).messages.map((m) => m.text)).toEqual(['version']);
  });

Bdd(feature)
  .scenario('Classes that are not state classes are not reported.')
  .given('A class with fields that are not readonly, which is not used in the state.')
  .and('An action, and a store with a number as the state.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `import { createStore, KissAction } from 'kiss-for-react';

class Api { count = 0; }

class Increment extends KissAction<number> {
  api = new Api();
  reduce() { return this.state + 1; }
}

export const store = createStore<number>({ initialState: 0 });
`;
    expect(lint(rule, code, {types}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Static fields and methods are not reported.')
  .given('A state class with a static field, a method, and a getter.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class State {
  static initialState = new State(0);
  constructor(readonly count: number) {}
  get double() { return this.count * 2; }
  add(n: number) { return new State(this.count + n); }
}

export const store = createStore<State>({ initialState: State.initialState });
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no fix when the file changes the field outside the constructor.')
  .given('A state class with a field that is not readonly, which a method changes.')
  .when('The code is linted.')
  .then('There is a warning, but no fix, since readonly would not compile.')
  .run(async (_) => {
    const code = `import { createStore } from 'kiss-for-react';

class State {
  count = 0;
  increment() { this.count++; return this; }
}

export const store = createStore<State>({ initialState: new State() });
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['count']);
    expect(result.fixed).toBe(code);
  });
