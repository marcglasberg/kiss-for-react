import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/missingSuperInOverride';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: missing-super-in-override');

const prelude = `import { KissAction, OptimisticCommand, OptimisticSync, OptimisticSyncWithPush, PushMetadata, ServerPush } from 'kiss-for-react';

class State {
  constructor(readonly user: string | null) {}
}

declare function prepare(): Promise<void>;
declare function saveUser(user: string | null): Promise<void>;
`;

Bdd(feature)
  .scenario('A before without super.before() is fine, also in an action that sets checkInternet.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There are no errors, since the store checks the internet before it calls before.')
  .example(val('Case', 'checkInternet, and a before that does not call super.before()'), val('Code', `
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await prepare(); }
  reduce() { return null; }
}`))
  .example(val('Case', 'checkInternet in a superclass, and a before that does not call super.before()'), val('Code', `
abstract class Action extends KissAction<State> {
  checkInternet = { dialog: true };
}
class LoadUser extends Action {
  before(): void { console.log('Loading'); }
  reduce() { return null; }
}`))
  .example(val('Case', 'checkInternet, and an inherited before that does not call super.before()'), val('Code', `
abstract class Action extends KissAction<State> {
  async before() { await prepare(); }
}
class LoadUser extends Action {
  checkInternet = { dialog: true };
  reduce() { return null; }
}`))
  .example(val('Case', 'checkInternet, and a before that calls super.before()'), val('Code', `
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await super.before(); await prepare(); }
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

const optimisticSyncWithPush = (name: string, superclass: string, reduce: string) => `
class ${name} extends ${superclass}<State, string | null> {
  constructor(readonly user: string | null) { super(); }
  valueToApply() { return this.user; }
  applyOptimisticValueToState(state: State, user: string | null) { return new State(user); }
  getValueFromState(state: State) { return state.user; }
  getServerRevisionFromState(state: State, key: any) { return -1; }
  async sendValueToServer(user: string | null, localRevision: number, deviceId: number) {
    await saveUser(user);
    this.informServerRevision(Date.now());
  }${reduce}
}`;

const serverPush = (name: string, superclass: string, reduce: string) => `
class ${name} extends ${superclass}<State> {
  constructor(readonly user: string | null, readonly metadata: PushMetadata) { super(); }
  associatedAction() { return SaveUser; }
  pushMetadata() { return this.metadata; }
  applyServerPushToState(state: State, key: any, serverRevision: number) { return new State(this.user); }
  getServerRevisionFromState(state: State, key: any) { return -1; }${reduce}
}`;

Bdd(feature)
  .scenario('Overriding reduce in an OptimisticSyncWithPush or a ServerPush is an error.')
  .given('An action that extends {Class} {Where}, and overrides reduce.')
  .when('The code is linted.')
  .then('There is an error in reduce, saying not to override it in an {Class}.')
  .example(val('Class', 'OptimisticSyncWithPush'), val('Where', 'directly'), val('Type information', true))
  .example(val('Class', 'OptimisticSyncWithPush'), val('Where', 'directly'), val('Type information', false))
  .example(val('Class', 'OptimisticSyncWithPush'), val('Where', 'through a base class of the same file'), val('Type information', true))
  .example(val('Class', 'OptimisticSyncWithPush'), val('Where', 'through a base class of the same file'), val('Type information', false))
  .example(val('Class', 'ServerPush'), val('Where', 'directly'), val('Type information', true))
  .example(val('Class', 'ServerPush'), val('Where', 'directly'), val('Type information', false))
  .example(val('Class', 'ServerPush'), val('Where', 'through a base class of the same file'), val('Type information', true))
  .example(val('Class', 'ServerPush'), val('Where', 'through a base class of the same file'), val('Type information', false))
  .run(async (ctx) => {
    const className = ctx.example.val('Class') as string;
    const direct = ctx.example.val('Where') === 'directly';
    const isPush = className === 'ServerPush';
    const base = direct ? '' : isPush ? `
abstract class Push<St> extends ServerPush<St> {}
` : `
abstract class Sync<St, T> extends OptimisticSyncWithPush<St, T> {}
`;
    const superclass = direct ? className : isPush ? 'Push' : 'Sync';
    const code = isPush
      ? `${prelude}${optimisticSyncWithPush('SaveUser', 'OptimisticSyncWithPush', '')}${base}${serverPush('PushUser', superclass, `
  reduce(): State | null { return new State(this.user); }`)}
`
      : `${prelude}${base}${optimisticSyncWithPush('SaveUser', superclass, `
  async reduce(): Promise<null> { await saveUser(this.user); return null; }`)}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].message).toContain(`Don't override \`reduce\` in ${isPush ? 'a' : 'an'} \`${className}\``);
  });

Bdd(feature)
  .scenario('An OptimisticSyncWithPush and a ServerPush that do not override reduce are fine.')
  .given('An OptimisticSyncWithPush and a ServerPush that do not override reduce.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `${prelude}${optimisticSyncWithPush('SaveUser', 'OptimisticSyncWithPush', '')}${serverPush('PushUser', 'ServerPush', '')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });
