import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dispatchSameActionTwice';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-same-action-twice');

const prelude = `import { createStore, KissAction, useDispatch } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

class LoadUser extends KissAction<State> {
  constructor(readonly name: string) { super(); }
  async reduce() { return () => new State(this.name); }
}

const store = createStore<State>({ initialState: new State('') });
`;

Bdd(feature)
  .scenario('Dispatching the same action object twice is an error.')
  .given('An action kept in a const.')
  .when('It is dispatched twice, {How}.')
  .then('There is an error on the second dispatch, saying the action was already dispatched.')
  .and('The suggestion dispatches a new action instead.')
  .example(val('How', 'with store.dispatch'), val('Code', `
export function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  store.dispatch(action);
}`), val('Fixed', 'store.dispatch(new LoadUser(\'Mary\'));'))
  .example(val('How', 'with dispatch and dispatchAndWait'), val('Code', `
export async function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  await store.dispatchAndWait(action);
}`), val('Fixed', 'await store.dispatchAndWait(new LoadUser(\'Mary\'));'))
  .example(val('How', 'with dispatchAll'), val('Code', `
export function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  store.dispatchAll([action, new LoadUser('Bill')]);
}`), val('Fixed', 'store.dispatchAll([new LoadUser(\'Mary\'), new LoadUser(\'Bill\')]);'))
  .example(val('How', 'with the function returned by useDispatch'), val('Code', `
export function useLoad() {
  const dispatch = useDispatch();
  return () => {
    const action = new LoadUser('Mary');
    dispatch(action);
    dispatch(action);
  };
}`), val('Fixed', '    dispatch(new LoadUser(\'Mary\'));'))
  .example(val('How', 'inside an action, with this.dispatch'), val('Code', `
class LoadTwice extends KissAction<State> {
  reduce() {
    const action = new LoadUser('Mary');
    this.dispatch(action);
    this.dispatch(action);
    return null;
  }
}`), val('Fixed', 'this.dispatch(new LoadUser(\'Mary\'));'))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual(['action']);
      expect(result.messages[0].message).toMatch(/^`action` was already dispatched in line \d+\. An action can only be dispatched once/);
      expect(result.messages[0].suggestions).toEqual(['Dispatch a new action: `new LoadUser(\'Mary\')`.']);
      const fixed = result.withSuggestion(0, 0);
      expect(fixed).toContain(ctx.example.val('Fixed') as string);
      if (types) {
        expect(result.typeErrors).toEqual([]);
        expect(lint(rule, fixed).typeErrors).toEqual([]);
      }
    }
  });

Bdd(feature)
  .scenario('Dispatches that can\'t both run are not reported.')
  .given('An action kept in a const.')
  .when('It is dispatched twice, but {Why}.')
  .then('There are no errors.')
  .example(val('Why', 'in the two branches of an if'), val('Code', `
  if (fast) store.dispatch(action);
  else store.dispatch(action);`))
  .example(val('Why', 'in the two branches of a ?:'), val('Code', `
  fast ? store.dispatch(action) : store.dispatch(action);`))
  .example(val('Why', 'in two cases of a switch'), val('Code', `
  switch (fast) {
    case true: store.dispatch(action); break;
    default: store.dispatch(action);
  }`))
  .example(val('Why', 'in a try and its catch'), val('Code', `
  try { store.dispatch(action); }
  catch { store.dispatch(action); }`))
  .example(val('Why', 'the first one returns'), val('Code', `
  if (fast) {
    store.dispatch(action);
    return;
  }
  store.dispatch(action);`))
  .run(async (ctx) => {
    const code = `${prelude}
export function run(fast: boolean) {
  const action = new LoadUser('Mary');${ctx.example.val('Code')}
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toEqual([]);
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Dispatches in different functions, or of new actions, are not reported.')
  .given('{Given}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Given', 'An action in a const, dispatched once in each of two functions'), val('Code', `
const action = new LoadUser('Mary');
export const first = () => store.dispatch(action);
export const second = () => store.dispatch(action);`))
  .example(val('Given', 'A new action created for each dispatch'), val('Code', `
export function run() {
  store.dispatch(new LoadUser('Mary'));
  store.dispatch(new LoadUser('Mary'));
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      expect(lint(rule, code, {types}).messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('There is no suggestion when the new action would use other variables.')
  .given('An action created with a variable, and a different variable with the same name where it is dispatched again.')
  .when('It is dispatched twice.')
  .then('There is an error, but no suggestion.')
  .run(async (_) => {
    const code = `${prelude}
export function run() {
  const name = 'Mary';
  const action = new LoadUser(name);
  store.dispatch(action);
  {
    const name = 'Bill';
    store.dispatch(action);
    return name;
  }
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['action']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, objects that are not Kiss actions are not reported.')
  .given('An event bus that dispatches its own event objects.')
  .when('The same event is dispatched twice.')
  .then('With type information, there are no errors.')
  .run(async (_) => {
    const code = `
class Saved {}
const bus = { dispatch(event: Saved) { return event; } };

export function run() {
  const event = new Saved();
  bus.dispatch(event);
  bus.dispatch(event);
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
