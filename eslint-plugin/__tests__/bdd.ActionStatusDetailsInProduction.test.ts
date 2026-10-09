import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/actionStatusDetailsInProduction';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: action-status-details-in-production');

const prelude = `import { createStore, KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

class Increment extends KissAction<State> {
  reduce() { return new State(this.state.count + 1); }
}

const store = createStore<State>({ initialState: new State(0) });
`;

Bdd(feature)
  .scenario('The hasFinishedMethod details of an action status are reported outside tests.')
  .given('An action that was dispatched.')
  .when('The app code reads {Property} of its status.')
  .then('There is a warning, saying to use isCompleted, isCompletedOk or isCompletedFailed.')
  .example(val('Property', 'hasFinishedMethodBefore'), val('Type information', true))
  .example(val('Property', 'hasFinishedMethodBefore'), val('Type information', false))
  .example(val('Property', 'hasFinishedMethodReduce'), val('Type information', true))
  .example(val('Property', 'hasFinishedMethodReduce'), val('Type information', false))
  .run(async (ctx) => {
    const property = ctx.example.val('Property') as string;
    const code = `${prelude}
export async function run() {
  const action = new Increment();
  await store.dispatchAndWait(action);
  return action.status.${property};
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, filename: 'src/app.ts'});
    expect(result.messages.map((m) => m.text)).toEqual([property]);
    expect(result.messages[0].message).toBe(
      `\`${property}\` is meant for tests and debugging. In the app, use \`isCompleted\`, \`isCompletedOk\` or \`isCompletedFailed\`.`);
    expect(result.fixed).toBe(code);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('hasFinishedMethodAfter is automatically replaced with isCompleted.')
  .given('The status returned by dispatchAndWait.')
  .when('The app code reads its hasFinishedMethodAfter.')
  .then('There is a warning.')
  .and('The automatic fix replaces it with isCompleted, which has the same value.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
export async function run() {
  const status = await store.dispatchAndWait(new Increment());
  return status.hasFinishedMethodAfter;
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, filename: 'src/app.ts'});
    expect(result.messages.map((m) => m.text)).toEqual(['hasFinishedMethodAfter']);
    expect(result.messages[0].message).toContain('use `isCompleted` (it has the same value)');
    expect(result.fixed).toContain('return status.isCompleted;');
    expect(lint(rule, result.fixed, {filename: 'src/app.ts'}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Destructuring the details is reported too.')
  .given('An action that was dispatched.')
  .when('The app code destructures hasFinishedMethodReduce from its status.')
  .then('There is a warning.')
  .run(async (_) => {
    const code = `${prelude}
export function run(action: Increment) {
  const { hasFinishedMethodReduce, isCompletedOk } = action.status;
  return hasFinishedMethodReduce && isCompletedOk;
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'src/app.ts'});
      expect(result.messages.map((m) => m.text)).toEqual(['hasFinishedMethodReduce']);
    }
  });

Bdd(feature)
  .scenario('With type information, any ActionStatus is reported.')
  .given('A function that gets an ActionStatus as a parameter.')
  .when('It reads hasFinishedMethodReduce.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since it is not known to be an action status.')
  .run(async (_) => {
    const code = `import { ActionStatus } from 'kiss-for-react';

export function hasReduced(s: ActionStatus) {
  return s.hasFinishedMethodReduce;
}
`;
    const typed = lint(rule, code, {filename: 'src/app.ts'});
    expect(typed.messages.map((m) => m.text)).toEqual(['hasFinishedMethodReduce']);
    expect(typed.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false, filename: 'src/app.ts'}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Nothing is reported in tests, or for the isCompleted properties.')
  .given('Code that reads hasFinishedMethodReduce, and isCompletedOk, of an action status.')
  .when('The code is linted.')
  .then('In a test file, there are no warnings.')
  .and('Outside tests, only hasFinishedMethodReduce is reported.')
  .run(async (_) => {
    const code = `${prelude}
export async function run() {
  const action = new Increment();
  await store.dispatchAndWait(action);
  return [action.status.hasFinishedMethodReduce, action.status.isCompletedOk];
}
`;
    expect(lint(rule, code, {filename: '__tests__/app.test.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: 'src/app.ts'}).messages.map((m) => m.text)).toEqual(['hasFinishedMethodReduce']);
  });

Bdd(feature)
  .scenario('With type information, other objects with the same property names are not reported.')
  .given('An object that is not an action status, with a hasFinishedMethodReduce property, kept in a status property.')
  .when('The app code reads it.')
  .then('With type information, there is no warning.')
  .run(async (_) => {
    const code = `
const job = { status: { hasFinishedMethodReduce: true } };
export const done = job.status.hasFinishedMethodReduce;
`;
    expect(lint(rule, code, {filename: 'src/app.ts'}).messages).toEqual([]);
  });
