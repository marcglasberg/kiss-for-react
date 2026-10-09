import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/expectWithoutWaiting';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: expect-without-waiting');

const jestGlobals = `
declare function test(name: string, fn: () => void | Promise<void>): void;
declare function expect(value: unknown): { toBe(expected: unknown): void };
`;

const prelude = `import { createStore, KissAction } from 'kiss-for-react';
${jestGlobals}
class State {
  constructor(readonly user: string) {}
}

declare function loadUser(): Promise<string>;

class LoadUser extends KissAction<State> {
  async reduce() {
    const user = await loadUser();
    return () => new State(user);
  }
}

class SetUser extends KissAction<State> {
  constructor(readonly user: string) { super(); }
  reduce() { return new State(this.user); }
}

const store = createStore<State>({ initialState: new State('') });
`;

Bdd(feature)
  .scenario('Checking the state right after dispatching an async action is reported in tests.')
  .given('A test that dispatches an async action with store.dispatch.')
  .when('Right after, it checks store.state with expect, without waiting.')
  .then('There is a warning on the dispatch.')
  .and('The automatic fix uses "await store.dispatchAndWait", and makes the test function async.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
test('loads the user', () => {
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('Mary');
});
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean, filename: 'user.test.ts'});
    expect(result.messages.map((m) => m.text)).toEqual(['store.dispatch(new LoadUser())']);
    expect(result.messages[0].message).toMatch(
      /^`LoadUser` is async, so the `expect` in line \d+ checks `store.state` before the action finishes\. Use `await store.dispatchAndWait\(...\)`/);
    expect(result.fixed).toContain(`test('loads the user', async () => {
  await store.dispatchAndWait(new LoadUser());
  expect(store.state.user).toBe('Mary');`);
    const fixed = lint(rule, result.fixed, {filename: 'user.test.ts'});
    expect(fixed.typeErrors).toEqual([]);
    expect(fixed.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('The fix keeps an async function as it is.')
  .given('An async test that dispatches an async action kept in a const.')
  .when('Right after, it checks store.state with expect, without waiting.')
  .then('There is a warning.')
  .and('The automatic fix only changes the dispatch.')
  .run(async (_) => {
    const code = `${prelude}
test('loads the user', async () => {
  const action = new LoadUser();
  store.dispatch(action);
  expect(store.state.user).toBe('Mary');
});
`;
    const result = lint(rule, code, {filename: 'user.test.ts'});
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toContain(`test('loads the user', async () => {
  const action = new LoadUser();
  await store.dispatchAndWait(action);`);
  });

Bdd(feature)
  .scenario('Waiting, or a sync action, is fine.')
  .given('A test that {Given}.')
  .when('Then it checks store.state with expect.')
  .then('There are no warnings.')
  .example(val('Given', 'awaits dispatchAndWait of an async action'), val('Code', `
  await store.dispatchAndWait(new LoadUser());
  expect(store.state.user).toBe('Mary');`))
  .example(val('Given', 'dispatches an async action, and awaits waitCondition before the expect'), val('Code', `
  store.dispatch(new LoadUser());
  await store.waitCondition((state) => state.user !== '', { timeoutMillis: 1000 });
  expect(store.state.user).toBe('Mary');`))
  .example(val('Given', 'dispatches a sync action'), val('Code', `
  store.dispatch(new SetUser('Mary'));
  expect(store.state.user).toBe('Mary');`))
  .example(val('Given', 'dispatches an async action, checks the state while it runs, and checks it again after waiting'), val('Code', `
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('');
  await store.waitCondition((state) => state.user !== '', { timeoutMillis: 1000 });
  expect(store.state.user).toBe('Mary');`))
  .example(val('Given', 'dispatches an async action, and has an expect that doesn\'t read the state'), val('Code', `
  store.dispatch(new LoadUser());
  expect(store.dispatchCount).toBe(1);`))
  .run(async (ctx) => {
    const code = `${prelude}
test('loads the user', async () => {${ctx.example.val('Code')}
});
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types, filename: 'user.test.ts'});
      expect(result.messages).toEqual([]);
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Code that is not a test is not reported.')
  .given('Code that dispatches an async action, and checks store.state with expect, without waiting.')
  .when('The code is not in a test file.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
test('loads the user', () => {
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('Mary');
});
`;
    expect(lint(rule, code, {filename: 'user.ts'}).messages).toEqual([]);
    expect(lint(rule, code, {filename: '__tests__/user.ts'}).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('There is no automatic fix when the function can\'t be made async.')
  .given('A helper function, with a void return type, that dispatches an async action and checks store.state right after.')
  .when('The code is linted.')
  .then('There is a warning, but no automatic fix.')
  .run(async (_) => {
    const code = `${prelude}
function loadAndCheck(): void {
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('Mary');
}

test('loads the user', () => loadAndCheck());
`;
    const result = lint(rule, code, {filename: 'user.test.ts'});
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('With type information, async actions from other files are reported.')
  .given('An async action declared in another file.')
  .when('A test dispatches it, and checks store.state right after, without waiting.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since the action is not known to be async.')
  .run(async (_) => {
    const files = {
      'state.ts': `import { createStore, KissAction } from 'kiss-for-react';
export class State {
  constructor(readonly user: string) {}
}
export class LoadUser extends KissAction<State> {
  async reduce() { return () => new State('Mary'); }
}
export const store = createStore<State>({ initialState: new State('') });
`,
    };
    const code = `import { LoadUser, store } from './state';
${jestGlobals}
test('loads the user', () => {
  store.dispatch(new LoadUser());
  expect(store.state.user).toBe('Mary');
});
`;
    const typed = lint(rule, code, {filename: 'user.test.ts', files});
    expect(typed.typeErrors).toEqual([]);
    expect(typed.messages.length).toBe(1);
    expect(lint(rule, code, {types: false, filename: 'user.test.ts', files}).messages).toEqual([]);
  });
