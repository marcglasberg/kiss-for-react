import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/missingSuperInOverride';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: missing-super-in-override');

const prelude = `import { KissAction, OptimisticCommand, OptimisticSync } from 'kiss-for-react';

class State {
  constructor(readonly user: string | null) {}
}

declare function prepare(): Promise<void>;
declare function saveUser(user: string | null): Promise<void>;
`;

Bdd(feature)
  .scenario('A before without super.before(), in an action that sets checkInternet, is an error.')
  .given('An action that sets checkInternet {Where}.')
  .and('Its before does not call super.before().')
  .when('The code is linted.')
  .then('There is an error in before.')
  .and('There is a suggestion to call super.before() first.')
  .example(val('Where', 'itself'), val('Type information', true))
  .example(val('Where', 'itself'), val('Type information', false))
  .example(val('Where', 'in a superclass of the same file'), val('Type information', true))
  .example(val('Where', 'in a superclass of the same file'), val('Type information', false))
  .run(async (ctx) => {
    const inSuperclass = ctx.example.val('Where') !== 'itself';
    const code = `${prelude}
abstract class Action extends KissAction<State> {${inSuperclass ? '\n  checkInternet = { dialog: true };' : ''}
}

class LoadUser extends Action {${inSuperclass ? '' : '\n  checkInternet = { dialog: true };'}
  async before() { await prepare(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['before']);
    expect(result.messages[0].message).toContain('This `before` doesn\'t call `super.before()`');
    expect(result.messages[0].suggestions).toEqual(['Call `await super.before()` first.']);
  });

Bdd(feature)
  .scenario('The suggestion calls super.before() first, and the code compiles.')
  .given('An action that sets checkInternet, with {Before}.')
  .when('The suggestion is applied.')
  .then('The before method is {Result}.')
  .and('The code compiles, and there are no errors.')
  .example(
    val('Before', 'an async before in one line'),
    val('Code', 'async before() { await prepare(); }'),
    val('Result', 'async before() { await super.before(); await prepare(); }'))
  .example(
    val('Before', 'an async before in many lines'),
    val('Code', 'async before() {\n    await prepare();\n  }'),
    val('Result', 'async before() {\n    await super.before();\n    await prepare();\n  }'))
  .example(
    val('Before', 'a sync before'),
    val('Code', 'before() { console.log(this.state.user); }'),
    val('Result', 'async before() { await super.before(); console.log(this.state.user); }'))
  .example(
    val('Before', 'an empty before'),
    val('Code', 'before() {}'),
    val('Result', 'async before() { await super.before(); }'))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  ${ctx.example.val('Code')}
  reduce() { return null; }
}
`;
    const suggested = lint(rule, code).withSuggestion(0, 0);
    expect(suggested).toContain(`\n  ${ctx.example.val('Result')}\n`);
    const result = lint(rule, suggested);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no suggestion when before has a declared return type that is not a promise.')
  .given('An action that sets checkInternet, with a before declared as returning void.')
  .when('The code is linted.')
  .then('There is an error in before, but no suggestion.')
  .run(async (_) => {
    const code = `${prelude}
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  before(): void { console.log('Loading'); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['before']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, checkInternet inherited from another file is found.')
  .given('A base action, declared in another file, that sets checkInternet.')
  .and('An action that extends it, with a before that does not call super.before().')
  .when('The code is linted with type information.')
  .then('There is an error in before.')
  .and('Without type information, there is no error, since the base action is not known.')
  .run(async (_) => {
    // TypeScript only finds imported virtual files in directories that exist.
    const filename = '../missingSuperInOverride.ts';
    const files = {
      '../missingSuperInOverrideBase.ts': `import { KissAction } from 'kiss-for-react';
export class State { constructor(readonly user: string | null) {} }
export abstract class Action extends KissAction<State> {
  checkInternet = { dialog: true };
}
`,
    };
    const code = `import { Action } from './missingSuperInOverrideBase';

declare function prepare(): Promise<void>;

class LoadUser extends Action {
  async before() { await prepare(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['before']);
    expect(lint(rule, code, {filename, files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action that sets checkInternet, but inherits a before without super.before(), is an error.')
  .given('A base action with a before that does not call super.before().')
  .and('An action that extends it, and sets checkInternet.')
  .when('The code is linted.')
  .then('There is an error in checkInternet, that names the base action.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class Action extends KissAction<State> {
  async before() { await prepare(); }
}

class LoadUser extends Action {
  checkInternet = { dialog: true };
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['checkInternet']);
    expect(result.messages[0].message).toContain('the `before` of `Action` doesn\'t call `super.before()`');
  });

Bdd(feature)
  .scenario('Overrides of before that keep checkInternet working are fine.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Case', 'checkInternet, and a before that calls super.before()'), val('Code', `
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await super.before(); await prepare(); }
  reduce() { return null; }
}`))
  .example(val('Case', 'a before without super.before(), and no checkInternet'), val('Code', `
class LoadUser extends KissAction<State> {
  async before() { await prepare(); }
  reduce() { return null; }
}`))
  .example(val('Case', 'a before without super.before(), and checkInternet turned off'), val('Code', `
abstract class Action extends KissAction<State> {
  checkInternet: { dialog: boolean } | undefined = { dialog: true };
}
class LoadUser extends Action {
  checkInternet = undefined;
  async before() { await prepare(); }
  reduce() { return null; }
}`))
  .example(val('Case', 'a before that checks this.checkInternet by itself'), val('Code', `
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { if (this.checkInternet) await prepare(); }
  reduce() { return null; }
}`))
  .example(val('Case', 'checkInternet, and an inherited before that calls super.before()'), val('Code', `
abstract class Action extends KissAction<State> {
  async before() { await super.before(); await prepare(); }
}
class LoadUser extends Action {
  checkInternet = { dialog: true };
  reduce() { return null; }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

const optimisticCommand = (name: string, superclass: string, reduce: string) => `
class ${name} extends ${superclass}<State, string | null> {
  constructor(readonly user: string | null) { super(); }
  optimisticValue() { return this.user; }
  getValueFromState(state: State) { return state.user; }
  applyValueToState(state: State, user: string | null) { return new State(user); }
  async sendCommandToServer(user: string | null) { await saveUser(user); }${reduce}
}`;

Bdd(feature)
  .scenario('Overriding reduce in an OptimisticCommand is an error.')
  .given('An action that extends OptimisticCommand {Where}, and overrides reduce.')
  .when('The code is linted.')
  .then('There is an error in reduce.')
  .example(val('Where', 'directly'), val('Type information', true))
  .example(val('Where', 'directly'), val('Type information', false))
  .example(val('Where', 'through a base class of the same file'), val('Type information', true))
  .example(val('Where', 'through a base class of the same file'), val('Type information', false))
  .run(async (ctx) => {
    const direct = ctx.example.val('Where') === 'directly';
    const base = direct ? '' : `
abstract class Command<St, T> extends OptimisticCommand<St, T> {}
`;
    const code = `${prelude}${base}${optimisticCommand('SaveUser', direct ? 'OptimisticCommand' : 'Command', `
  async reduce(): Promise<null> { await saveUser(this.user); return null; }`)}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].message).toContain('Don\'t override `reduce` in an `OptimisticCommand`');
  });

Bdd(feature)
  .scenario('An OptimisticCommand without reduce, or a reduce in other actions, is fine.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Case', 'An OptimisticCommand that does not override reduce'), val('Code',
    optimisticCommand('SaveUser', 'OptimisticCommand', '')))
  .example(val('Case', 'A reduce in an action that is not an OptimisticCommand'), val('Code', `
abstract class MyCommand extends KissAction<State> {}
class SaveUser extends MyCommand {
  reduce() { return null; }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

const optimisticSync = (name: string, superclass: string, reduce: string) => `
class ${name} extends ${superclass}<State, string | null> {
  constructor(readonly user: string | null) { super(); }
  valueToApply() { return this.user; }
  applyOptimisticValueToState(state: State, user: string | null) { return new State(user); }
  getValueFromState(state: State) { return state.user; }
  async sendValueToServer(user: string | null) { await saveUser(user); }${reduce}
}`;

Bdd(feature)
  .scenario('Overriding reduce in an OptimisticSync is an error.')
  .given('An action that extends OptimisticSync {Where}, and overrides reduce.')
  .when('The code is linted.')
  .then('There is an error in reduce.')
  .example(val('Where', 'directly'), val('Type information', true))
  .example(val('Where', 'directly'), val('Type information', false))
  .example(val('Where', 'through a base class of the same file'), val('Type information', true))
  .example(val('Where', 'through a base class of the same file'), val('Type information', false))
  .run(async (ctx) => {
    const direct = ctx.example.val('Where') === 'directly';
    const base = direct ? '' : `
abstract class Sync<St, T> extends OptimisticSync<St, T> {}
`;
    const code = `${prelude}${base}${optimisticSync('SaveUser', direct ? 'OptimisticSync' : 'Sync', `
  async reduce(): Promise<null> { await saveUser(this.user); return null; }`)}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].message).toContain('Don\'t override `reduce` in an `OptimisticSync`');
  });

Bdd(feature)
  .scenario('An OptimisticSync that does not override reduce is fine.')
  .given('An OptimisticSync that does not override reduce.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `${prelude}${optimisticSync('SaveUser', 'OptimisticSync', '')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });
