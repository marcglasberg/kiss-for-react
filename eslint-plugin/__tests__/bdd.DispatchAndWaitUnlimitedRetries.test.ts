import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dispatchAndWaitUnlimitedRetries';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-and-wait-unlimited-retries');

const prelude = `import { KissAction, Retry, Store, useDispatchAndWait, useDispatchAndWaitAll } from 'kiss-for-react';

class State {
  constructor(readonly text: string) {}
}

declare function loadText(): Promise<string>;

const store = new Store<State>({ initialState: new State('') });

class LoadForever extends KissAction<State> {
  retry = { maxRetries: -1 };
  nonReentrant = true;
  async reduce() { const text = await loadText(); return () => new State(text); }
}

class LoadUnlimited extends KissAction<State> {
  retry = { unlimitedRetries: true };
  async reduce() { const text = await loadText(); return () => new State(text); }
}

class LoadFewTimes extends KissAction<State> {
  retry = { maxRetries: 3 };
  async reduce() { const text = await loadText(); return () => new State(text); }
}

abstract class RetryForever extends KissAction<State> {
  retry: Retry = { maxRetries: -1 };
}

class LoadInherited extends RetryForever {
  async reduce() { const text = await loadText(); return () => new State(text); }
}

class LoadTurnedOff extends RetryForever {
  retry = { on: false };
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;

Bdd(feature)
  .scenario('dispatchAndWait of an action that retries forever is a warning.')
  .given('An action with {Retry}.')
  .when('It is dispatched with store.dispatchAndWait.')
  .then('There is a warning in the action, saying it retries forever.')
  .example(val('Retry', 'retry = { maxRetries: -1 }'), val('Action', 'LoadForever'), val('Option', 'maxRetries: -1'), val('Type information', true))
  .example(val('Retry', 'retry = { maxRetries: -1 }'), val('Action', 'LoadForever'), val('Option', 'maxRetries: -1'), val('Type information', false))
  .example(val('Retry', 'retry = { unlimitedRetries: true }'), val('Action', 'LoadUnlimited'), val('Option', 'unlimitedRetries: true'), val('Type information', true))
  .example(val('Retry', 'retry = { unlimitedRetries: true }'), val('Action', 'LoadUnlimited'), val('Option', 'unlimitedRetries: true'), val('Type information', false))
  .example(val('Retry', 'retry = { maxRetries: -1 } in its superclass'), val('Action', 'LoadInherited'), val('Option', 'maxRetries: -1'), val('Type information', true))
  .example(val('Retry', 'retry = { maxRetries: -1 } in its superclass'), val('Action', 'LoadInherited'), val('Option', 'maxRetries: -1'), val('Type information', false))
  .run(async (ctx) => {
    const action = ctx.example.val('Action') as string;
    const code = `${prelude}
export async function run() {
  await store.dispatchAndWait(new ${action}());
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([`new ${action}()`]);
    expect(result.messages[0].message).toBe(
      `\`${action}\` retries forever (\`${ctx.example.val('Option')}\`), so the promise of \`dispatchAndWait\` ` +
      'never resolves while the action keeps failing. Use `dispatch`, or limit the retries.');
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The hooks, dispatchAndWaitAll, and actions in variables are checked too.')
  .given('An action that retries forever.')
  .when('It is dispatched {How}.')
  .then('There is a warning.')
  .example(val('How', 'with the function from useDispatchAndWait'), val('Code', `
export function Button() {
  const dispatchAndWait = useDispatchAndWait();
  return () => dispatchAndWait(new LoadForever());
}`))
  .example(val('How', 'with the function from useDispatchAndWaitAll'), val('Code', `
export function Button() {
  const dispatchAndWaitAll = useDispatchAndWaitAll();
  return () => dispatchAndWaitAll([new LoadFewTimes(), new LoadForever()]);
}`))
  .example(val('How', 'with store.dispatchAndWaitAll'), val('Code', `
export const promise = store.dispatchAndWaitAll([new LoadForever(), new LoadFewTimes()]);`))
  .example(val('How', 'from a const variable'), val('Code', `
const action = new LoadForever();
export const promise = store.dispatchAndWait(action);`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toContain('`LoadForever` retries forever');
    expect(lint(rule, code, {types: false}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('Actions that don\'t retry forever, or dispatch without waiting, are fine.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'An action with limited retries, with dispatchAndWait'), val('Code', 'store.dispatchAndWait(new LoadFewTimes());'))
  .example(val('Case', 'An action that turns off the retry of its superclass, with dispatchAndWait'), val('Code', 'store.dispatchAndWait(new LoadTurnedOff());'))
  .example(val('Case', 'An action that retries forever, with dispatch'), val('Code', 'store.dispatch(new LoadForever());'))
  .run(async (ctx) => {
    const code = `${prelude}
export const result = ${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, the action\'s type is enough.')
  .given('A function that gets an action typed as an action class that retries forever.')
  .when('It dispatches it with dispatchAndWait.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since the action\'s class is unknown.')
  .run(async (_) => {
    const code = `${prelude}
export function run(action: LoadForever) {
  return store.dispatchAndWait(action);
}
`;
    expect(lint(rule, code).messages.length).toBe(1);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('dispatchAndWait of an action that retries forever is not reported in tests.')
  .given('A test file that dispatches an action that retries forever with dispatchAndWait.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
export const promise = store.dispatchAndWait(new LoadForever());
`;
    expect(lint(rule, code, {filename: '__tests__/load.test.ts'}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('dispatchAndWait of an action with unlimitedRetryCheckInternet is a warning.')
  .given('An action with unlimitedRetryCheckInternet = {Value} {Where}.')
  .when('It is dispatched with store.dispatchAndWait.')
  .then('There is a warning in the action, saying it retries forever, even while there is no internet.')
  .example(val('Value', 'true'), val('Where', 'in the action'), val('Type information', true))
  .example(val('Value', 'true'), val('Where', 'in the action'), val('Type information', false))
  .example(val('Value', '{ maxDelay: 1000 }'), val('Where', 'in the action'), val('Type information', true))
  .example(val('Value', '{ maxDelay: 1000 }'), val('Where', 'in the action'), val('Type information', false))
  .example(val('Value', 'true'), val('Where', 'in its superclass'), val('Type information', true))
  .example(val('Value', 'true'), val('Where', 'in its superclass'), val('Type information', false))
  .run(async (ctx) => {
    const value = ctx.example.val('Value') as string;
    const inSuperclass = ctx.example.val('Where') === 'in its superclass';
    const code = `${prelude}
abstract class OnlineAction extends KissAction<State> {
  ${inSuperclass ? `unlimitedRetryCheckInternet = ${value};` : ''}
}

class LoadOnline extends OnlineAction {
  ${inSuperclass ? '' : `unlimitedRetryCheckInternet = ${value};`}
  async reduce() { const text = await loadText(); return () => new State(text); }
}

export async function run() {
  await store.dispatchAndWait(new LoadOnline());
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['new LoadOnline()']);
    expect(result.messages[0].message).toBe(
      '`LoadOnline` uses `unlimitedRetryCheckInternet`, so it retries forever, and the promise of ' +
      '`dispatchAndWait` never resolves while there is no internet, or while the action keeps failing. ' +
      'Use `dispatch`.');
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('dispatchAndWait of an action with unlimitedRetryCheckInternet turned off is fine.')
  .given('An action with unlimitedRetryCheckInternet = false, in a subclass of one that turns it on.')
  .when('It is dispatched with store.dispatchAndWait.')
  .then('There are no warnings.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class OnlineAction extends KissAction<State> {
  unlimitedRetryCheckInternet = true;
}

class LoadOffline extends OnlineAction {
  unlimitedRetryCheckInternet = false;
  async reduce() { const text = await loadText(); return () => new State(text); }
}

export async function run() {
  await store.dispatchAndWait(new LoadOffline());
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });
