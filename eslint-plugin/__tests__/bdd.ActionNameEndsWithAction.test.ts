import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/actionNameEndsWithAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: action-name-ends-with-action');

const prelude = `import { KissAction, OptimisticCommand, Store } from 'kiss-for-react';

class State {
  constructor(readonly user: string, readonly liked: boolean) {}
}

abstract class Action extends KissAction<State> {}
`;

Bdd(feature)
  .scenario('An action whose name does not end with Action is reported.')
  .given('An action called LoadUser, which is not exported.')
  .and('The action is used in other places of the same file.')
  .when('The code is linted.')
  .then('The action name is reported, telling to rename it to LoadUserAction.')
  .and('The suggestion renames the action and all its uses in the file.')
  .and('The renamed code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class LoadUser extends Action {
  static create(): LoadUser { return new LoadUser(); }
  reduce() { return new State('Mary', false); }
}

const store = new Store<State>({ initialState: new State('', false) });
const action: LoadUser = new LoadUser();
store.dispatch(action);
const waiting = store.isWaiting(LoadUser);
const actions = { LoadUser };
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
    expect(result.messages[0].message).toBe(
      'Rename the action `LoadUser` to `LoadUserAction`. This project names actions like `LoadUserAction`.');
    expect(result.messages[0].suggestions).toEqual(['Rename `LoadUser` to `LoadUserAction` in this file.']);

    const renamed = result.withSuggestion(0, 0);
    expect(renamed).toContain('class LoadUserAction extends Action {');
    expect(renamed).toContain('static create(): LoadUserAction { return new LoadUserAction(); }');
    expect(renamed).toContain('const action: LoadUserAction = new LoadUserAction();');
    expect(renamed).toContain('store.isWaiting(LoadUserAction);');
    expect(renamed).toContain('const actions = { LoadUser: LoadUserAction };');
    expect(renamed).not.toMatch(/\bLoadUser\b(?!:)/);
    expect(lint(rule, renamed).typeErrors).toEqual([]);
    expect(lint(rule, renamed, {types}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action whose name ends with _Action is reported, to remove the underscore.')
  .given('An action called LoadUser_Action.')
  .when('The code is linted.')
  .then('It is reported, and the suggestion renames it to LoadUserAction.')
  .run(async (_) => {
    const code = `${prelude}
class LoadUser_Action extends Action {
  reduce() { return new State('Mary', false); }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser_Action']);
    expect(result.withSuggestion(0, 0)).toContain('class LoadUserAction extends Action {');
  });

Bdd(feature)
  .scenario('Actions whose names end with Action, abstract actions, and other classes are not reported.')
  .given('{Description}.')
  .when('The code is linted, with or without type information.')
  .then('There are no reports.')
  .example(val('Description', 'An action called LoadUserAction'), val('Code', `
class LoadUserAction extends Action {
  reduce() { return new State('Mary', false); }
}`))
  .example(val('Description', 'An abstract action called BaseUser'), val('Code', `
abstract class BaseUser extends Action {
  reduce() { return new State('Mary', false); }
}`))
  .example(val('Description', 'A class that is not an action'), val('Code', `
class UserList extends Array<string> {
  total() { return this.length; }
}
class User {
  reduce() { return 1; }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions that inherit reduce are reported too.')
  .given('An action that extends {Superclass}, and does not declare reduce.')
  .when('The code is linted, with or without type information.')
  .then('It is reported.')
  .example(val('Superclass', 'OptimisticCommand'), val('Code', `
class LikePost extends OptimisticCommand<State, boolean> {
  optimisticValue() { return true; }
  applyValueToState(state: State, value: boolean) { return new State(state.user, value); }
  getValueFromState(state: State) { return state.liked; }
  async sendCommandToServer(value: boolean) {}
}`), val('Name', 'LikePost'))
  .example(val('Superclass', 'an abstract action of the same file that declares reduce'), val('Code', `
abstract class LoadUserBase extends Action {
  abstract readonly name: string;
  reduce() { return new State(this.name, false); }
}
class LoadMary extends LoadUserBase {
  readonly name = 'Mary';
}`), val('Name', 'LoadMary'))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Name')]);
    expect(lint(rule, code, {types: false}).messages.map((m) => m.text)).toEqual([ctx.example.val('Name')]);
  });

Bdd(feature)
  .scenario('With type information, actions that inherit reduce from another file are reported.')
  .given('An action that extends an abstract action of another file, which declares reduce.')
  .when('The code is linted with type information.')
  .then('It is reported.')
  .and('Without type information, it is not reported, since the action can not be recognized.')
  .run(async (_) => {
    // The files are in an existing directory, since TypeScript only finds imported virtual
    // files in directories that exist (the default virtual directory doesn't).
    const filename = '../user.ts';
    const files = {
      '../base.ts': `import { KissAction } from 'kiss-for-react';
export class State { constructor(readonly user: string) {} }
export abstract class LoadUserBase extends KissAction<State> {
  abstract readonly name: string;
  reduce() { return new State(this.name); }
}
`,
    };
    const code = `import { LoadUserBase } from './base';

class LoadMary extends LoadUserBase {
  readonly name = 'Mary';
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadMary']);
    expect(lint(rule, code, {filename, files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action that other files may use is reported, but there is no suggestion.')
  .given('An action called LoadUser that is {Exported}.')
  .when('The code is linted.')
  .then('It is reported, telling to rename it with the IDE.')
  .and('There is no suggestion, since ESLint can only change this file.')
  .example(val('Exported', 'declared with export'), val('Code', `
export class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}`))
  .example(val('Exported', 'declared with export default'), val('Code', `
export default class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}`))
  .example(val('Exported', 'exported by name later'), val('Code', `
class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}
export { LoadUser };`))
  .example(val('Exported', 'exported as default later'), val('Code', `
class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}
export default LoadUser;`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
    expect(result.messages[0].message).toBe(
      'Rename the action `LoadUser` to `LoadUserAction`, with your IDE\'s rename refactoring, ' +
      'which also renames it in the other files. This project names actions like `LoadUserAction`.');
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('There is no suggestion when the new name is already used in the file.')
  .given('An action called LoadUser.')
  .and('The file already uses the name LoadUserAction.')
  .when('The code is linted.')
  .then('It is reported, but there is no suggestion, since renaming would clash with the other name.')
  .run(async (_) => {
    const code = `${prelude}
const LoadUserAction = 'load-user';

class LoadUser extends Action {
  reduce() { return new State(LoadUserAction, false); }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions in test files are also checked.')
  .given('An action called LoadUser, declared in a test file.')
  .when('The code is linted.')
  .then('It is reported.')
  .run(async (_) => {
    const code = `${prelude}
class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}
`;
    const result = lint(rule, code, {filename: '__tests__/user.test.ts'});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadUser']);
  });
