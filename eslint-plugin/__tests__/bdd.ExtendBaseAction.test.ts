import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/extendBaseAction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: extend-base-action');

const stateFile = `export class State {
  constructor(readonly user: string) {}
}
`;

const baseActionFile = `import { KissAction } from 'kiss-for-react';
import { State } from '../state';

export abstract class Action extends KissAction<State> {}
`;

Bdd(feature)
  .scenario('An action that extends KissAction directly is a warning, when there is a base action in the same file.')
  .given('A base action, and an action that extends KissAction<State> directly, in the same file.')
  .when('The code is linted.')
  .then('There is a warning in KissAction<State>, that names the base action.')
  .and('The suggestion extends the base action, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}

class LoadUser extends KissAction<State> {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['KissAction<State>']);
    expect(result.messages[0].message).toContain('`LoadUser` extends `KissAction` directly. Extend your base action instead (`Action`)');
    expect(result.messages[0].suggestions).toEqual(['Extend `Action`.']);
    expect(result.fixed).toBe(code);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('class LoadUser extends Action {');
    expect(suggested).toContain('import { KissAction } from \'kiss-for-react\';');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, the base action can be in another file.')
  .given('A base action in another file.')
  .and('An action that extends KissAction<State> directly, and uses KissAction only there.')
  .when('The suggestion is applied.')
  .then('The action extends the base action.')
  .and('The import of KissAction is replaced with the import of the base action.')
  .and('The code compiles.')
  .run(async (_) => {
    const filename = 'actions/LoadUser.ts';
    const files = {'state.ts': stateFile, 'infra/Action.ts': baseActionFile};
    const code = `import { KissAction } from 'kiss-for-react';
import { State } from '../state';

export class LoadUser extends KissAction<State> {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.messages.map((m) => m.text)).toEqual(['KissAction<State>']);
    expect(result.messages[0].suggestions).toEqual(['Extend `Action`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toBe(`import { Action } from '../infra/Action';
import { State } from '../state';

export class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
`);
    expect(lint(rule, suggested, {filename, files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The suggestion keeps the other imports from Kiss, and adds the import after the last one.')
  .given('An action that extends KissAction<State> directly, in a file that also imports Store from Kiss.')
  .and('A base action in another file.')
  .when('The suggestion is applied.')
  .then('KissAction is removed from the import, and the base action is imported after the last import.')
  .and('The code compiles.')
  .run(async (_) => {
    const filename = 'actions/LoadUser.ts';
    const files = {'state.ts': stateFile, 'actions/Action.ts': baseActionFile};
    const code = `import { KissAction, Store } from 'kiss-for-react';
import { State } from '../state';

export class LoadUser extends KissAction<State> {
  reduce() { return new State('Mary'); }
}

export const store = new Store<State>({ initialState: new State('') });
`;
    const suggested = lint(rule, code, {filename, files}).withSuggestion(0, 0);
    expect(suggested).toBe(`import { Store } from 'kiss-for-react';
import { State } from '../state';
import { Action } from './Action';

export class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}

export const store = new Store<State>({ initialState: new State('') });
`);
    expect(lint(rule, suggested, {filename, files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Without a base action, the warning says to create one, with no suggestion.')
  .given('An action that extends KissAction<State> directly.')
  .and('{Case}.')
  .when('The code is linted.')
  .then('There is a warning that says to create a base action.')
  .and('There is no suggestion.')
  .example(val('Case', 'There is no base action in the project'), val('Files', 'none'), val('Type information', true))
  .example(val('Case', 'There is no base action in the file'), val('Files', 'none'), val('Type information', false))
  .example(val('Case', 'The base action is in another file, but there is no type information'), val('Files', 'base action'), val('Type information', false))
  .example(val('Case', 'The only abstract action of the project has another state'), val('Files', 'other state'), val('Type information', true))
  .run(async (ctx) => {
    const filename = 'actions/LoadUser.ts';
    const files: Record<string, string> = {'state.ts': stateFile};
    if (ctx.example.val('Files') === 'base action') files['infra/Action.ts'] = baseActionFile;
    if (ctx.example.val('Files') === 'other state') {
      files['infra/Action.ts'] = `import { KissAction } from 'kiss-for-react';
export abstract class OtherAction extends KissAction<number> {}
`;
    }
    const code = `import { KissAction } from 'kiss-for-react';
import { State } from '../state';

export class LoadUser extends KissAction<State> {
  reduce() { return new State('Mary'); }
}
`;
    const result = lint(rule, code, {filename, files, types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['KissAction<State>']);
    expect(result.messages[0].message).toContain(
      'Create a base action, like `abstract class Action extends KissAction<State> {}`, and extend it instead');
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('A base action declared after the action, in the same file, is not suggested.')
  .given('An action that extends KissAction<State> directly.')
  .and('A base action declared after it, in the same file.')
  .when('The code is linted.')
  .then('There is a warning, without suggestions, since a class can\'t be used before its declaration.')
  .run(async (_) => {
    const code = `import { KissAction } from 'kiss-for-react';

class State {}

class LoadUser extends KissAction<State> {
  reduce() { return new State(); }
}

abstract class Action extends KissAction<State> {}
`;
    expect(lint(rule, code).messages[0].suggestions).toEqual([]);
    expect(lint(rule, code, {types: false}).messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Classes that are not reported.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'An action that extends the base action'), val('Code', `
abstract class Action extends KissAction<State> {}
class LoadUser extends Action {
  reduce() { return new State(); }
}`))
  .example(val('Case', 'An abstract class that extends KissAction'), val('Code', `
abstract class Action extends KissAction<State> {}`))
  .example(val('Case', 'An action with a generic state'), val('Code', `
class Reset<St> extends KissAction<St> {
  constructor(readonly initial: St) { super(); }
  reduce() { return this.initial; }
}`))
  .run(async (ctx) => {
    const code = `import { KissAction } from 'kiss-for-react';

class State {}
${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions that extend KissAction directly are not reported in tests.')
  .given('A test file with an action that extends KissAction<State> directly.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `import { KissAction } from 'kiss-for-react';

class State {}

class LoadUser extends KissAction<State> {
  reduce() { return new State(); }
}
`;
    expect(lint(rule, code, {filename: '__tests__/loadUser.test.ts'}).messages).toEqual([]);
  });
