import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/asyncFeatureInSyncAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: async-feature-in-sync-action');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  add(n: number): State { return new State(this.count + n); }
}

declare function load(): Promise<number>;
`;

Bdd(feature)
  .scenario('nonReentrant in an action with a sync reduce is a warning.')
  .given('An action with nonReentrant = true, and a sync reduce.')
  .when('The code is linted.')
  .then('There is a warning in nonReentrant, saying it does nothing.')
  .and('The suggestion removes nonReentrant, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  nonReentrant = true;

  reduce() {
    return this.state.add(1);
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['nonReentrant']);
    expect(result.messages[0].message).toContain('`nonReentrant` does nothing in a sync action');
    expect(result.messages[0].suggestions).toEqual(['Remove `nonReentrant`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('class Increment extends KissAction<State> {\n\n  reduce() {');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('checkInternet in an action with a sync reduce is a warning.')
  .given('An action with checkInternet, and a sync reduce.')
  .when('The code is linted.')
  .then('There is a warning in checkInternet, saying it makes the action async.')
  .and('The suggestion removes checkInternet.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  checkInternet = { dialog: true };
  reduce() { return this.state.add(1); }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['checkInternet']);
    expect(result.messages[0].message).toContain('It makes the action async, so `dispatchSync` of it throws.');
    expect(result.messages[0].suggestions).toEqual(['Remove `checkInternet`.']);
    expect(result.withSuggestion(0, 0)).not.toContain('checkInternet');
  });

Bdd(feature)
  .scenario('Both nonReentrant and checkInternet: only checkInternet is reported.')
  .given('An action with a sync reduce, nonReentrant = true, and checkInternet.')
  .when('The code is linted.')
  .then('Only checkInternet is reported.')
  .and('nonReentrant is not, since checkInternet makes the action async.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  nonReentrant = true;
  checkInternet = { dialog: false };
  reduce() { return this.state.add(1); }
}
`;
    expect(lint(rule, code).messages.map((m) => m.text)).toEqual(['checkInternet']);
    expect(lint(rule, code, {types: false}).messages.map((m) => m.text)).toEqual(['checkInternet']);
  });

Bdd(feature)
  .scenario('Async features in actions that are or may be async are fine.')
  .given('An action with nonReentrant and checkInternet, and {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'an async reduce'), val('Code', `
  async reduce() { const n = await load(); return (state: State) => state.add(n); }`))
  .example(val('Case', 'a sync reduce, and an overridden before'), val('Code', `
  async before() { await load(); }
  reduce() { return this.state.add(1); }`))
  .example(val('Case', 'a sync reduce, and an overridden wrapReduce'), val('Code', `
  wrapReduce(reduce: () => any) { return reduce; }
  reduce() { return this.state.add(1); }`))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadCount extends KissAction<State> {
  nonReentrant = true;
  checkInternet = { dialog: true };${ctx.example.val('Code')}
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Features that are turned off are fine.')
  .given('An action with a sync reduce, nonReentrant = false, and checkInternet = undefined.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  nonReentrant = false;
  checkInternet = undefined;
  reduce() { return this.state.add(1); }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, a before overridden in a base action of another file is known.')
  .given('A base action in another file, which overrides before.')
  .and('An action that extends it, with nonReentrant = true and a sync reduce.')
  .when('The code is linted.')
  .then('With type information, there are no warnings, since the action may be async.')
  .and('Without type information, there is a warning, since the base action is unknown.')
  .run(async (_) => {
    // The files are in an existing directory, since TypeScript only finds imported virtual
    // files in directories that exist (the default virtual directory doesn't).
    const filename = '../increment.ts';
    const files = {
      '../action.ts': `import { KissAction } from 'kiss-for-react';
export class State { constructor(readonly count: number) {} }
declare function track(): Promise<void>;
export abstract class Action extends KissAction<State> {
  async before() { await track(); }
}`,
    };
    const code = `import { Action, State } from './action';

class Increment extends Action {
  nonReentrant = true;
  reduce() { return new State(this.state.count + 1); }
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {filename, files, types: false}).messages.map((m) => m.text)).toEqual(['nonReentrant']);
  });

Bdd(feature)
  .scenario('Async features in sync actions are not reported in tests.')
  .given('A test file with an action with nonReentrant and a sync reduce.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  nonReentrant = true;
  reduce() { return this.state.add(1); }
}
`;
    expect(lint(rule, code, {filename: '__tests__/increment.test.ts'}).messages).toEqual([]);
  });
