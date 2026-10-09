import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/preferReadonlyCollections';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: prefer-readonly-collections');

const stateWith = (fields: string) => `import { createStore } from 'kiss-for-react';

class User { constructor(readonly name: string) {} }

class State {
${fields}
}

export const store = createStore<State>({ initialState: new State() });
`;

Bdd(feature)
  .scenario('A field of a state class with a mutable collection type is a warning, with a suggestion to make it readonly.')
  .given('A state class with a field of a mutable collection type.')
  .when('The code is linted.')
  .then('There is a warning in the type.')
  .and('The suggestion changes it to the readonly type, and the code still compiles.')
  .example(val('Field', 'readonly users: User[] = [];'), val('Readonly', 'readonly User[]'))
  .example(val('Field', 'readonly users: Array<User> = [];'), val('Readonly', 'ReadonlyArray<User>'))
  .example(val('Field', 'readonly users: Map<string, User> = new Map();'), val('Readonly', 'ReadonlyMap<string, User>'))
  .example(val('Field', 'readonly ids: Set<string> = new Set();'), val('Readonly', 'ReadonlySet<string>'))
  .example(val('Field', 'readonly users: User[] | null = null;'), val('Readonly', 'readonly User[]'))
  .example(val('Field', 'readonly users: (User | null)[] = [];'), val('Readonly', 'readonly (User | null)[]'))
  .run(async (ctx) => {
    const field = ctx.example.val('Field') as string;
    const readonly = ctx.example.val('Readonly') as string;
    const code = stateWith(`  ${field}`);
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toContain(`Use \`${readonly}\``);
    expect(result.messages[0].suggestions).toEqual([`Change the type to \`${readonly}\`.`]);
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain(readonly);
    expect(lint(rule, fixed).typeErrors).toEqual([]);
    expect(lint(rule, fixed).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Readonly collections, and other types, are fine.')
  .given('A state class with readonly collections, a string, and a user class.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = stateWith(`  readonly users: readonly User[] = [];
  readonly list: ReadonlyArray<User> = [];
  readonly map: ReadonlyMap<string, User> = new Map();
  readonly ids: ReadonlySet<string> = new Set();
  readonly name: string = '';
  readonly user: User | null = null;`);
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Only the type of the field is checked, not its type arguments.')
  .given('A state class with a readonly map whose values are mutable arrays.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = stateWith(`  readonly map: ReadonlyMap<string, User[]> = new Map();`);
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Classes that are not state classes are not reported.')
  .given('A class with a mutable array, which is not part of the state.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `class Cache {
  readonly items: string[] = [];
}
export const cache = new Cache();
`;
    expect(lint(rule, code, {types: ctx.example.val('Type information') as boolean}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A class named like a collection, but declared by the user, is not reported.')
  .given('A state class with a field of a user class named Set.')
  .when('The code is linted, with or without type information.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { createStore } from 'kiss-for-react';

class Set<T> { constructor(readonly items: readonly T[]) {} }

class State {
  readonly tags: Set<string> = new Set([]);
}

export const store = createStore<State>({ initialState: new State() });
`;
    expect(lint(rule, code, {types: ctx.example.val('Type information') as boolean}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, a state class in the same file is checked.')
  .given('A state class with a mutable array, and a store of that state in the same file.')
  .when('The code is linted without type information.')
  .then('There is a warning.')
  .run(async (_) => {
    const code = stateWith('  readonly users: User[] = [];');
    expect(lint(rule, code, {types: false}).messages.map((m) => m.text)).toEqual(['User[]']);
  });

Bdd(feature)
  .scenario('Mutable collections in state classes are not reported in tests.')
  .given('A test file with a state class with a mutable array.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = stateWith('  readonly users: User[] = [];');
    expect(lint(rule, code, {filename: '__tests__/state.test.ts'}).messages).toEqual([]);
  });
