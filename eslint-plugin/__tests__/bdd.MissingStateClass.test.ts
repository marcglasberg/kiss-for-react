import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import plugin from '../src';

reporter(new FeatureFileReporter());
const feature = new Feature('Lint: missing-state-class');

Bdd(feature)
  .scenario('Every state class needs its own annotation when the rule is enabled.')
  .given('A store with nested state classes, a base class, and an unrelated class.')
  .when('The code is linted with the optional rule enabled.')
  .then('The root, nested classes and base class are reported, but the unrelated class is not.')
  .example(val('Types', true))
  .example(val('Types', false))
  .run(async (ctx) => {
    const code = `import { createStore } from 'kiss-for-react';
class Address { readonly city = ''; }
class User { readonly address = new Address(); }
class Base { readonly version = 1; }
class State extends Base { readonly users: User[] = []; }
class Service {}
createStore({initialState: new State()});`;
    const result = lint('missing-state-class', code, {types: ctx.example.val('Types') as boolean});
    expect(result.messages.map(m => m.text)).toEqual(['Address', 'User', 'Base', 'State']);
    expect(result.fixed).toBe(code);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The decorator is recognized by its Kiss import, including aliases and namespace imports.')
  .given('An annotated class with no store and an unannotated nested class.')
  .when('The state rules and the optional annotation rule check the classes.')
  .then('The annotated class is checked for immutability and only its nested class needs an annotation.')
  .example(val('Import', "import { stateClass } from 'kiss-for-react';"), val('Decorator', 'stateClass'), val('Types', true))
  .example(val('Import', "import { stateClass as state } from 'kiss-for-react';"), val('Decorator', 'state'), val('Types', true))
  .example(val('Import', "import * as kiss from 'kiss-for-react';"), val('Decorator', 'kiss.stateClass'), val('Types', true))
  .example(val('Import', "import { stateClass as state } from 'kiss-for-react';"), val('Decorator', 'state'), val('Types', false))
  .example(val('Import', "import * as kiss from 'kiss-for-react';"), val('Decorator', 'kiss.stateClass'), val('Types', false))
  .run(async (ctx) => {
    const code = `${ctx.example.val('Import')}
class User { name = ''; }
@${ctx.example.val('Decorator')}
class State { user = new User(); }`;
    const options = {types: ctx.example.val('Types') as boolean};
    expect(lint('missing-state-class', code, options).messages.map(m => m.text)).toEqual(['User']);
    const result = lint('state-class-must-be-immutable', code, options);
    expect(result.messages.map(m => m.text)).toEqual(['name', 'user']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Nested state classes are found across files without annotations.')
  .given('A store, root state, user and address in separate files, and a cyclic state reference.')
  .when('The address file is linted with and without type information.')
  .then('Only the check with type information reports the missing annotation.')
  .run(async () => {
    const code = `export class Address { readonly city = ''; }`;
    const options = {filename: 'address.ts', files: {
      'user.ts': `import { Address } from './address'; export class User { readonly address = new Address(); readonly friend?: User; }`,
      'state.ts': `import { User } from './user'; export class State { readonly users: ReadonlyMap<string, User> = new Map(); }`,
      'store.ts': `import { createStore } from 'kiss-for-react'; import { State } from './state'; createStore({initialState: new State()});`,
    }};
    expect(lint('missing-state-class', code, options).messages.map(m => m.text)).toEqual(['Address']);
    expect(lint('missing-state-class', code, {...options, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An annotated root in another file makes its nested classes state classes.')
  .given('An annotated state with no store, and its user class in another file.')
  .when('The user file is linted with type information.')
  .then('The user is checked for immutability and needs its own annotation.')
  .run(async () => {
    const code = `export class User { name = ''; }`;
    const options = {filename: 'user.ts', files: {
      'state.ts': `import { stateClass } from 'kiss-for-react'; import { User } from './user'; @stateClass export class State { readonly user = new User(); }`,
    }};
    expect(lint('missing-state-class', code, options).messages.map(m => m.text)).toEqual(['User']);
    expect(lint('state-class-must-be-immutable', code, options).messages.map(m => m.text)).toEqual(['name']);
  });

Bdd(feature)
  .scenario('A different decorator with the same name does not mark a Kiss state class.')
  .given('A local decorator named stateClass and a class used by a Kiss action.')
  .when('The optional annotation rule checks the class.')
  .then('The rule reports the missing Kiss annotation.')
  .example(val('Types', true))
  .example(val('Types', false))
  .run(async (ctx) => {
    const code = `import { KissAction } from 'kiss-for-react';
function stateClass(target: Function) {}
@stateClass class State {}
class Action extends KissAction<State> { reduce() { return null; } }`;
    expect(lint('missing-state-class', code, {types: ctx.example.val('Types') as boolean}).messages.map(m => m.text)).toEqual(['State']);
  });

Bdd(feature)
  .scenario('Each subclass needs its own annotation and the rule is disabled by default.')
  .given('An annotated base class and an unannotated subclass used by a store.')
  .when('The optional rule checks the classes and the recommended configuration is inspected.')
  .then('Only the subclass is reported, and the recommended configuration does not enable the rule.')
  .run(async () => {
    const code = `import { stateClass, createStore } from 'kiss-for-react';
@stateClass class Base {}
class State extends Base {}
createStore({initialState: new State()});`;
    expect(lint('missing-state-class', code).messages.map(m => m.text)).toEqual(['State']);
    expect(plugin.configs.recommended.rules?.['kiss-for-react/missing-state-class']).toBeUndefined();
  });

Bdd(feature)
  .scenario('Fully annotated state and unrelated classes need no further annotations.')
  .given('An annotated root and nested class, a Date from the standard library, and a service outside state.')
  .when('The optional rule checks the classes.')
  .then('There are no warnings or TypeScript errors.')
  .example(val('Types', true))
  .example(val('Types', false))
  .run(async (ctx) => {
    const code = `import { stateClass, createStore } from 'kiss-for-react';
@stateClass class User { readonly name = ''; }
@stateClass class State { readonly users: User[] = []; readonly created = new Date(); }
class Service { value = 0; }
createStore({initialState: new State()});`;
    const result = lint('missing-state-class', code, {types: ctx.example.val('Types') as boolean});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Type information recognizes the Kiss decorator re-exported from another file.')
  .given('A class annotated with a re-exported Kiss decorator and no store.')
  .when('The class is linted with type information.')
  .then('The annotation is accepted and the state rules check the class.')
  .run(async () => {
    const code = `import { state } from './annotations';
@state class User { name = ''; }`;
    const options = {files: {'annotations.ts': `export { stateClass as state } from 'kiss-for-react';`}};
    expect(lint('missing-state-class', code, options).messages).toEqual([]);
    expect(lint('state-class-must-be-immutable', code, options).messages.map(m => m.text)).toEqual(['name']);
  });
