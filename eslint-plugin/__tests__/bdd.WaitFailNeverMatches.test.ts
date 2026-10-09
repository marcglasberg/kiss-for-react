import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/waitFailNeverMatches';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: wait-fail-never-matches');

const prelude = `import { KissAction, Store, useIsWaiting, useIsFailed } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  add(n: number): State { return new State(this.count + n); }
}

declare function load(): Promise<number>;

const store = new Store<State>({ initialState: new State(0) });

class Increment extends KissAction<State> {
  reduce() { return this.state.add(1); }
}

class LoadCount extends KissAction<State> {
  async reduce() {
    const n = await load();
    return (state: State) => state.add(n);
  }
}

class WithCheckInternet extends KissAction<State> {
  checkInternet = { dialog: true };
  reduce() { return this.state.add(1); }
}

abstract class BaseAction extends KissAction<State> {}
`;

Bdd(feature)
  .scenario('isWaiting or useIsWaiting with a sync action is a warning.')
  .given('A sync action.')
  .when('It is checked with {Call}.')
  .then('There is a warning in the action class, saying it\'s always false.')
  .example(val('Call', 'useIsWaiting(Increment)'), val('Type information', true))
  .example(val('Call', 'useIsWaiting(Increment)'), val('Type information', false))
  .example(val('Call', 'store.isWaiting(Increment)'), val('Type information', true))
  .example(val('Call', 'store.isWaiting(Increment)'), val('Type information', false))
  .run(async (ctx) => {
    const call = ctx.example.val('Call') as string;
    const code = `${prelude}
export function Counter() {
  const isWaiting = ${call};
  return isWaiting ? 'Loading' : 'Done';
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['Increment']);
    expect(result.messages[0].message).toContain(`\`Increment\` is sync, so \`${call.replace('store.', '')}\` is always \`false\``);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('isWaiting with an async action, an abstract class, or isFailed with a sync action, is fine.')
  .given('{Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'An action with an async reduce'), val('Call', 'useIsWaiting(LoadCount)'))
  .example(val('Case', 'An action with checkInternet, which makes it async'), val('Call', 'useIsWaiting(WithCheckInternet)'))
  .example(val('Case', 'An abstract class, which also matches its subclasses'), val('Call', 'useIsWaiting(BaseAction)'))
  .example(val('Case', 'isFailed with a sync action, since sync actions can fail'), val('Call', 'useIsFailed(Increment)'))
  .run(async (ctx) => {
    const code = `${prelude}
export function Counter() {
  return ${ctx.example.val('Call')};
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A sync action that may become async is not reported.')
  .given('A sync action that {Case}.')
  .when('It is checked with useIsWaiting.')
  .then('There are no warnings.')
  .example(val('Case', 'has an async subclass, which isWaiting also matches'), val('Code', `
class Sync extends KissAction<State> {
  reduce() { return this.state.add(1); }
}
class AsyncSubclass extends Sync {
  async before() { await load(); }
}`))
  .example(val('Case', 'overrides wrapReduce'), val('Code', `
class Sync extends KissAction<State> {
  wrapReduce(reduce: () => any) { return reduce; }
  reduce() { return this.state.add(1); }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}

export function Counter() {
  return useIsWaiting(Sync);
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, a sync action from another file is reported.')
  .given('A sync action declared in another file, and imported.')
  .when('It is checked with useIsWaiting.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since the action\'s class is unknown.')
  .run(async (_) => {
    // The files are in an existing directory, since TypeScript only finds imported virtual
    // files in directories that exist (the default virtual directory doesn't).
    const filename = '../counter.tsx';
    const files = {
      '../state.ts': `export class State { constructor(readonly count: number) {} }`,
      '../increment.ts': `import { KissAction } from 'kiss-for-react';
import { State } from './state';
export class Increment extends KissAction<State> {
  reduce() { return new State(this.state.count + 1); }
}`,
    };
    const code = `import { useIsWaiting } from 'kiss-for-react';
import { Increment } from './increment';

export function Counter() {
  return useIsWaiting(Increment);
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['Increment']);
    expect(lint(rule, code, {filename, files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('isWaiting in tests is not reported.')
  .given('A test that checks that a sync action is not waiting.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
store.dispatch(new Increment());
export const isWaiting = store.isWaiting(Increment);
`;
    expect(lint(rule, code, {filename: '__tests__/increment.test.ts'}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, a sync action with a subclass in another file is not reported.')
  .given('A sync action.')
  .and('Another file has an async subclass of it, which isWaiting also matches.')
  .when('The sync action is checked with useIsWaiting.')
  .then('There are no warnings.')
  .run(async (_) => {
    const filename = '../counter.tsx';
    const files = {
      '../load.ts': `import { Increment } from './counter';
declare function load(): Promise<number>;
export class LoadAndIncrement extends Increment {
  async before() { await load(); }
}`,
    };
    const code = `import { KissAction, useIsWaiting } from 'kiss-for-react';

export class State { constructor(readonly count: number) {} }

export class Increment extends KissAction<State> {
  reduce() { return new State(this.state.count + 1); }
}

export function Counter() {
  return useIsWaiting(Increment);
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });
