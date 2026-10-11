import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import plugin from '../src/index';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: lifecycle-method-call');

const prelude = `import { KissAction, OptimisticCommand } from 'kiss-for-react';

class State {
  constructor(readonly name: string) {}
}

class LoadUser extends KissAction<State> {
  before() {}
  reduce() { return new State('Mary'); }
  after() {}
  wrapError(error: any) { return error; }
}

class SaveName extends OptimisticCommand<State, string> {
  optimisticValue() { return 'Mary'; }
  getValueFromState(state: State) { return state.name; }
  applyValueToState(state: State, name: string) { return new State(name); }
  async sendCommandToServer(name: string) { return name; }
}
`;

Bdd(feature)
  .scenario('Calling a lifecycle method of an action is reported.')
  .given('An action.')
  .and('Code outside the action that calls its {Method} method: {Code}')
  .when('The code is linted, with type information: {Type information}.')
  .then('There is a warning in {Method}, which says to dispatch the action instead.')
  .example(val('Method', 'reduce'), val('Code', 'new LoadUser().reduce();'), val('Type information', true))
  .example(val('Method', 'reduce'), val('Code', 'new LoadUser().reduce();'), val('Type information', false))
  .example(val('Method', 'before'), val('Code', 'const action = new LoadUser(); action.before();'), val('Type information', true))
  .example(val('Method', 'before'), val('Code', 'const action = new LoadUser(); action.before();'), val('Type information', false))
  .example(val('Method', 'after'), val('Code', 'const action = new LoadUser(); action.after();'), val('Type information', true))
  .example(val('Method', 'wrapError'), val('Code', `new LoadUser().wrapError(new Error('boom'));`), val('Type information', true))
  .example(val('Method', 'abortDispatch'), val('Code', 'new LoadUser().abortDispatch();'), val('Type information', true))
  .example(val('Method', 'computeFreshKey'), val('Code', 'new LoadUser().computeFreshKey();'), val('Type information', true))
  .example(val('Method', 'sendCommandToServer'), val('Code', `new SaveName().sendCommandToServer('Mary');`), val('Type information', true))
  .example(val('Method', 'sendCommandToServer'), val('Code', `new SaveName().sendCommandToServer('Mary');`), val('Type information', false))
  .run(async (ctx) => {
    const method = ctx.example.val('Method') as string;
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
export function run() {
  ${ctx.example.val('Code')}
}
`;
    const result = lint('lifecycle-method-call', code, {types});
    expect(result.messages.map((m) => m.text)).toEqual([method]);
    expect(result.messages[0].message).toContain(`\`${method}\``);
    expect(result.messages[0].message).toContain('dispatch the action');
  });

Bdd(feature)
  .scenario('Calling a lifecycle method of an action in a test is also reported.')
  .given('A test that creates an action, and calls its reduce method, to check the new state.')
  .when('The code is linted.')
  .then('There is a warning in reduce.')
  .run(async (_) => {
    const code = `${prelude}
test('Loads the user', () => {
  expect(new LoadUser().reduce().name).toBe('Mary');
});
`;
    for (const types of [true, false]) {
      const result = lint('lifecycle-method-call', code, {types, filename: '__tests__/user.test.ts'});
      expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    }
  });

Bdd(feature)
  .scenario('Calls that are not to the lifecycle methods of another action are not reported.')
  .given('{Case}.')
  .when('The code is linted, with and without type information.')
  .then('There are no warnings.')
  .example(val('Case', 'An action that calls super in its override'), val('Code', `
class LoadAdmin extends LoadUser {
  before() { super.before(); }
  reduce() { return new State('Admin'); }
}`))
  .example(val('Case', 'An action that calls its own method with this'), val('Code', `
class LoadAdmin extends LoadUser {
  reduce() { this.after(); return new State('Admin'); }
}`))
  .example(val('Case', 'An array reduce'), val('Code', `
export const total = [1, 2, 3].reduce((sum, value) => sum + value, 0);`))
  .example(val('Case', 'A method with the same name, in a class that is not an action'), val('Code', `
class Job {
  before() {}
  reduce() { return 1; }
}
export function run() { const job = new Job(); job.before(); return job.reduce(); }`))
  .example(val('Case', 'An action method that is not a lifecycle method'), val('Code', `
export function run() { const action = new LoadUser(); action.removeFreshKey(); return action.toString(); }`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      const result = lint('lifecycle-method-call', code, {types});
      expect(result.messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('With type information, a call through a variable typed as an action is reported.')
  .given('A function that gets an action typed as KissAction, and calls its reduce method.')
  .when('The code is linted with type information.')
  .then('There is a warning in reduce.')
  .and('TypeScript also reports an error, since reduce is protected in KissAction.')
  .run(async (_) => {
    const code = `${prelude}
export function run(action: KissAction<State>) {
  return action.reduce();
}
`;
    const result = lint('lifecycle-method-call', code);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.typeErrors.join('\n')).toContain(`Property 'reduce' is protected`);
  });

Bdd(feature)
  .scenario('The rule is in the recommended config, as an error.')
  .given('The recommended config of the plugin.')
  .when('Its rules are read.')
  .then('The lifecycle-method-call rule is turned on, as an error.')
  .run(async (_) => {
    expect(plugin.configs.recommended.rules?.['kiss-for-react/lifecycle-method-call']).toBe('error');
  });
