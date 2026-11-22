import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import plugin from '../src';

reporter(new FeatureFileReporter());
const feature = new Feature('Lint: state methods');

Bdd(feature)
  .scenario('State methods cannot change the existing instance or its nested objects.')
  .given('A state class identified by a decorator or a store, with methods that mutate its fields.')
  .when('The mutation rule checks the methods.')
  .then('Assignments, increments, deletions and Object.assign on the existing state are errors.')
  .example(val('Types', true), val('Annotated', true))
  .example(val('Types', false), val('Annotated', true))
  .example(val('Types', true), val('Annotated', false))
  .example(val('Types', false), val('Annotated', false))
  .run(async (ctx) => {
    const code = `import { stateClass, createStore } from 'kiss-for-react';
${ctx.example.val('Annotated') ? '@stateClass' : ''}
class State {
  count = 0;
  user = {name: '', optional: true as boolean | undefined};
  change() {
    this.count++;
    this.user.name = 'Mary';
    delete this.user.optional;
    Object.assign(this, {count: 1});
    Object.assign(this.user, {name: 'John'});
  }
  changeLater = () => { this.count = 2; };
}
${ctx.example.val('Annotated') ? '' : 'createStore({initialState: new State()});'}`;
    const result = lint('no-state-mutation', code, {types: ctx.example.val('Types') as boolean});
    expect(result.messages.map(m => m.messageId)).toEqual(Array(6).fill('assignment'));
  });

Bdd(feature)
  .scenario('State methods cannot mutate existing collections through aliases or callbacks.')
  .given('A state with arrays, a map, a set, and aliases to its fields.')
  .when('The mutation rule checks the code with type information.')
  .then('Mutating collection calls and nested callback assignments are errors.')
  .run(async () => {
    const code = `import { stateClass } from 'kiss-for-react';
@stateClass class State {
  readonly items = [{count: 0}];
  readonly map = new Map<string, number>();
  readonly set = new Set<number>();
  update() {
    const items = this.items;
    items.push({count: 1});
    this.map.set('a', 1);
    this.set.add(1);
    this.items.forEach(item => { item.count++; });
    const self = this;
    self.items[0].count = 4;
    (() => { this.items.pop(); })();
  }
}`;
    const result = lint('no-state-mutation', code);
    expect(result.messages.map(m => m.messageId)).toEqual(['method', 'method', 'method', 'assignment', 'assignment', 'method']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Constructors, new objects, queries, static methods and unrelated classes remain usable.')
  .given('State methods that query state, create objects, or return this without modifying state.')
  .when('The mutation rule checks the code.')
  .then('There are no errors for these operations or for a custom immutable add method.')
  .example(val('Types', true))
  .example(val('Types', false))
  .run(async (ctx) => {
    const code = `import { stateClass } from 'kiss-for-react';
class List { add(_value: number) { return new List(); } }
@stateClass class State {
  readonly count: number;
  readonly list = new List();
  constructor(count = 0) { this.count = count; }
  copy() { const next = {count: this.count}; next.count++; return new State(next.count); }
  unchanged() { return this; }
  isPositive() { return this.count > 0; }
  add() { return this.list.add(1); }
  static count = 0;
  static update() { this.count++; }
  otherThis() { return { count: 0, update() { this.count++; } }; }
}
class Service { count = 0; update() { this.count++; } }`;
    expect(lint('no-state-mutation', code, {types: ctx.example.val('Types') as boolean}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('State instance methods and function fields must be synchronous.')
  .given('A state class with async methods, an async generator, and an async arrow field.')
  .when('The synchronous-method rule checks the class.')
  .then('Each asynchronous member gets one warning, without a behavior-changing fix.')
  .example(val('Types', true))
  .example(val('Types', false))
  .run(async (ctx) => {
    const code = `import { stateClass } from 'kiss-for-react';
@stateClass class State {
  async load() { return 1; }
  async *stream() { yield 1; }
  loadMore = async () => 2;
  loadAgain = async function () { return 3; };
}`;
    const result = lint('state-methods-must-be-sync', code, {types: ctx.example.val('Types') as boolean});
    expect(result.messages.map(m => m.text)).toEqual(['load', 'stream', 'loadMore', 'loadAgain']);
    expect(result.fixed).toBe(code);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Type information finds promises returned without the async keyword.')
  .given('State methods, a getter, and a function field returning promises, including a union and a thenable.')
  .when('The rule checks the class with and without type information.')
  .then('Type information reports every promise-returning member, while the syntax-only check reports none.')
  .run(async () => {
    const code = `import { stateClass } from 'kiss-for-react';
@stateClass class State {
  load() { return Promise.resolve(1); }
  maybe(flag: boolean) { return flag ? Promise.resolve(1) : 1; }
  get pending() { return Promise.resolve(2); }
  field = () => Promise.resolve(3);
  thenable() { return {then(resolve: (value: number) => void) { resolve(1); }}; }
}`;
    expect(lint('state-methods-must-be-sync', code).messages.map(m => m.text)).toEqual(['load', 'maybe', 'pending', 'field', 'thenable']);
    expect(lint('state-methods-must-be-sync', code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Synchronous state methods and static or unrelated asynchronous methods are accepted.')
  .given('A state with queries, a method returning a new instance, a no-op, and a nested async function.')
  .when('The synchronous-method rule checks the classes.')
  .then('There are no warnings and the recommended severities are error for mutation and warning for async methods.')
  .run(async () => {
    const code = `import { stateClass } from 'kiss-for-react';
@stateClass class State {
  readonly count = 1;
  query() { return this.count > 0; }
  copy() { return new State(); }
  unchanged() { return this; }
  nested() { const helper = async () => 1; return helper; }
  unknown(value: any) { return value; }
  static async load() { return new State(); }
}
class Service { async load() { return 1; } }`;
    expect(lint('state-methods-must-be-sync', code).messages).toEqual([]);
    expect(plugin.configs.recommended.rules?.['kiss-for-react/state-methods-must-be-sync']).toBe('warn');
    expect(plugin.configs.recommended.rules?.['kiss-for-react/no-state-mutation']).toBe('error');
  });

Bdd(feature)
  .scenario('Both rules check nested state classes declared in another file.')
  .given('A nested state class and a store in separate files, without decorators.')
  .when('The nested class is linted with type information.')
  .then('Its mutation and asynchronous method are reported.')
  .run(async () => {
    const code = `export class User { count = 0; update() { this.count++; } async load() { return 1; } }`;
    const options = {filename: 'user.ts', files: {
      'store.ts': `import { createStore } from 'kiss-for-react'; import { User } from './user'; class State { readonly user = new User(); } createStore({initialState: new State()});`,
    }};
    expect(lint('no-state-mutation', code, options).messages.map(m => m.messageId)).toEqual(['assignment']);
    expect(lint('state-methods-must-be-sync', code, options).messages.map(m => m.text)).toEqual(['load']);
  });
