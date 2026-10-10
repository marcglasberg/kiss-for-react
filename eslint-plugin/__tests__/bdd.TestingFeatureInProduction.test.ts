import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/testingFeatureInProduction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: testing-feature-in-production');

const prelude = `import { createStore, KissAction, useStore } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

class Increment extends KissAction<State> {
  reduce() { return new State(this.state.count + 1); }
}

const store = createStore<State>({ initialState: new State(0) });
`;

Bdd(feature)
  .scenario('Mocks and record of the store are reported outside tests.')
  .given('A store created in the same file.')
  .when('The app code uses {Feature}.')
  .then('There is a warning, saying it is meant for tests.')
  .example(val('Feature', 'store.mocks'), val('Code', 'store.mocks.add(Increment, () => null);'), val('Message', '`mocks` is meant for tests'), val('Type information', true))
  .example(val('Feature', 'store.mocks'), val('Code', 'store.mocks.add(Increment, () => null);'), val('Message', '`mocks` is meant for tests'), val('Type information', false))
  .example(val('Feature', 'store.record'), val('Code', 'store.record.start();'), val('Message', '`record` is meant for tests'), val('Type information', true))
  .example(val('Feature', 'store.record'), val('Code', 'store.record.start();'), val('Message', '`record` is meant for tests'), val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
${ctx.example.val('Code')}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, filename: 'src/app.ts'});
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Feature')]);
    expect(result.messages[0].message).toContain(ctx.example.val('Message') as string);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The wait methods meant for tests are reported outside tests.')
  .given('A store created in the same file.')
  .when('The app code calls store.{Method}.')
  .then('There is a warning, saying it is meant for tests.')
  .example(val('Method', 'waitActionType'), val('Args', 'Increment'))
  .example(val('Method', 'waitAllActionTypes'), val('Args', '[Increment]'))
  .example(val('Method', 'waitAnyActionTypeFinishes'), val('Args', '[Increment]'))
  .example(val('Method', 'waitActionCondition'), val('Args', '(actions) => actions.size === 0'))
  .run(async (ctx) => {
    const method = ctx.example.val('Method') as string;
    const code = `${prelude}
export async function run() {
  await store.${method}(${ctx.example.val('Args')});
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages.map((m) => m.text)).toEqual([`store.${method}`]);
      expect(result.messages[0].message).toContain(`\`${method}\` is meant for tests`);
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('waitAllActions is reported only when it waits for all actions.')
  .given('A store created in the same file.')
  .when('The app code calls store.waitAllActions({Args}).')
  .then('There is a warning: {Reported}.')
  .example(val('Args', '[]'), val('Reported', true))
  .example(val('Args', 'null'), val('Reported', true))
  .example(val('Args', '[action]'), val('Reported', false))
  .run(async (ctx) => {
    const code = `${prelude}
export async function run() {
  const action = new Increment();
  store.dispatch(action);
  await store.waitAllActions(${ctx.example.val('Args')});
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      if (ctx.example.val('Reported')) {
        expect(result.messages.map((m) => m.text)).toEqual(['store.waitAllActions']);
        expect(result.messages[0].message).toContain('waits until no actions are running');
      } else {
        expect(result.messages).toEqual([]);
      }
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Nothing is reported in tests.')
  .given('Code that uses store.mocks, store.record and store.waitActionType.')
  .when('The code is in a test file.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
export async function run() {
  store.mocks.add(Increment, () => null);
  store.record.start();
  await store.waitActionType(Increment);
  await store.waitAllActions([]);
}
`;
    expect(lint(rule, code, {filename: '__tests__/app.test.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: 'src/app.spec.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: 'src/app.ts'}).messages.length).toBe(4);
  });

Bdd(feature)
  .scenario('The wait methods of actions and of useStore() are reported too.')
  .given('{Where}.')
  .when('It calls waitActionType.')
  .then('There is a warning.')
  .example(val('Where', 'A Kiss action'), val('Code', `
class WaitForIncrement extends KissAction<State> {
  async reduce() {
    await this.waitActionType(Increment);
    return null;
  }
}`), val('Text', 'this.waitActionType'))
  .example(val('Where', 'A component, with the store from useStore()'), val('Code', `
export function useWait() {
  const s = useStore();
  return () => s.waitActionType(Increment);
}`), val('Text', 's.waitActionType'))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Text')]);
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('With type information, a store from another file is reported too.')
  .given('A store imported from another file.')
  .when('The app code uses store.mocks.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since it is not known to be a Kiss store.')
  .run(async (_) => {
    const files = {
      'store.ts': `import { createStore } from 'kiss-for-react';
export const store = createStore<number>({ initialState: 0 });
`,
    };
    const code = `import { store } from './store';

store.mocks.clear();
`;
    const typed = lint(rule, code, {filename: 'app.ts', files});
    expect(typed.messages.map((m) => m.text)).toEqual(['store.mocks']);
    expect(typed.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false, filename: 'app.ts', files}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Other objects with the same names are not reported.')
  .given('An object that is not a Kiss store, with mocks, record and waitActionType.')
  .when('The app code uses them.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `
const api = {
  mocks: [] as string[],
  record: { start() {} },
  async waitActionType(name: string) { return name; },
};

export async function run() {
  api.mocks.push('a');
  api.record.start();
  await api.waitActionType('a');
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('The internet simulation of the store is reported outside tests.')
  .given('A store created in the same file.')
  .when('The app code sets store.forceInternetOnOffSimulation.')
  .then('There is a warning, saying it is meant for tests.')
  .and('There is no warning in tests.')
  .and('Reading store.forceInternetOnOffSimulation is not reported.')
  .run(async (_) => {
    const code = `${prelude}
store.forceInternetOnOffSimulation = () => false;
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages.map((m) => m.text)).toEqual(['store.forceInternetOnOffSimulation']);
      expect(result.messages[0].message).toContain('`forceInternetOnOffSimulation` is meant for tests');
      if (types) expect(result.typeErrors).toEqual([]);
    }
    expect(lint(rule, code, {filename: '__tests__/app.test.ts'}).messages).toEqual([]);

    const reads = `${prelude}
export const isSimulated = store.forceInternetOnOffSimulation() !== null;
`;
    expect(lint(rule, reads, {filename: 'src/app.ts'}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action that overrides internetOnOffSimulation to return true or false is reported.')
  .given('A Kiss action that overrides the internetOnOffSimulation getter.')
  .when('The getter returns {Returns}.')
  .then('There is a warning: {Reported}.')
  .example(val('Returns', 'false'), val('Reported', true))
  .example(val('Returns', 'true'), val('Reported', true))
  .example(val('Returns', 'null'), val('Reported', false))
  .example(val('Returns', 'this.store.forceInternetOnOffSimulation()'), val('Reported', false))
  .run(async (ctx) => {
    const returns = ctx.example.val('Returns') as string;
    const code = `${prelude}
export class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  get internetOnOffSimulation(): boolean | null { return ${returns}; }
  async reduce() { return null; }
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      if (ctx.example.val('Reported')) {
        expect(result.messages.map((m) => m.text)).toEqual([returns]);
        expect(result.messages[0].message).toContain(`returns \`${returns}\`, so the action ignores the real internet`);
      } else {
        expect(result.messages).toEqual([]);
      }
      if (types) expect(result.typeErrors).toEqual([]);
    }
    expect(lint(rule, code, {filename: '__tests__/app.test.ts'}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An internetOnOffSimulation getter in a class that is not an action is not reported.')
  .given('A class that is not a Kiss action, with an internetOnOffSimulation getter that returns false.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `
export class Settings {
  get internetOnOffSimulation() { return false; }
}
`;
    for (const types of [true, false]) {
      expect(lint(rule, code, {types, filename: 'src/app.ts'}).messages).toEqual([]);
    }
  });
