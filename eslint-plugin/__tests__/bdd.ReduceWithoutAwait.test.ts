import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/reduceWithoutAwait';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: reduce-without-await');

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number, readonly user: string | null = null) {}
  add(n: number): State { return new State(this.count + n, this.user); }
}

declare function load(): Promise<number>;
declare function loadReducer(): Promise<(state: State) => State>;
`;

Bdd(feature)
  .scenario('An async reduce without await is reported.')
  .given('An action whose reduce is async, but has no await.')
  .when('The code is linted.')
  .then('There is a warning in reduce.')
  .and('There is a suggestion to make reduce sync.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Increment extends KissAction<State> {
  async reduce() {
    return (state: State) => state.add(1);
  }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].message).toContain('This `reduce` is `async`, but has no `await`');
    expect(result.messages[0].suggestions).toEqual(['Make `reduce` sync.']);
  });

Bdd(feature)
  .scenario('The suggestion makes reduce sync, using this.state instead of the state parameter.')
  .given('An async reduce without await, which returns null, a function without parameters, and a function with a state parameter.')
  .when('The suggestion is applied.')
  .then('reduce is sync.')
  .and('It returns the values directly, with this.state instead of the state parameter.')
  .and('The code compiles.')
  .run(async (_) => {
    const code = `${prelude}
class Increment extends KissAction<State> {
  async reduce() {
    if (this.state.count > 10) return null;
    if (this.state.count > 5) return () => this.state.add(2);
    return (state: State) => state.add(state.count);
  }
}
`;
    const suggested = lint(rule, code).withSuggestion(0, 0);
    expect(suggested).toContain(`
  reduce() {
    if (this.state.count > 10) return null;
    if (this.state.count > 5) return this.state.add(2);
    return this.state.add(this.state.count);
  }`);
    const result = lint(rule, suggested);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('The suggestion is not offered when the returned function can\'t be inlined.')
  .given('An async reduce without await, which returns {Case}.')
  .when('The code is linted.')
  .then('There is a warning, but no suggestion.')
  .example(val('Case', 'a function with a block body'), val('Code', `
  async reduce() {
    return (state: State) => { const n = state.count; return state.add(n); };
  }`))
  .example(val('Case', 'a function, with a declared return type'), val('Code', `
  async reduce(): Promise<(state: State) => State> {
    return (state: State) => state.add(1);
  }`))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['reduce']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Async reducers that need to be async are not reported.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'an async reduce with await'), val('Code', `
  async reduce() {
    const n = await load();
    return (state: State) => state.add(n);
  }`))
  .example(val('Case', 'an async reduce with for await'), val('Code', `
  async reduce() {
    let n = 0;
    for await (const x of [load()]) n += x;
    return (state: State) => state.add(n);
  }`))
  .example(val('Case', 'an async reduce that returns a promise'), val('Code', `
  async reduce() {
    return loadReducer();
  }`))
  .example(val('Case', 'retry, which needs an async reduce'), val('Code', `
  retry = { on: true };
  async reduce() {
    return (state: State) => state.add(1);
  }`))
  .example(val('Case', 'checkInternet, which makes the action async anyway'), val('Code', `
  checkInternet = { dialog: true };
  async reduce() {
    return (state: State) => state.add(1);
  }`))
  .example(val('Case', 'an async before, which makes the action async anyway'), val('Code', `
  async before() { await load(); }
  async reduce() {
    return (state: State) => state.add(1);
  }`))
  .example(val('Case', 'a sync reduce'), val('Code', `
  reduce() {
    return this.state.add(1);
  }`))
  .example(val('Case', 'an await only inside a nested function, and a returned promise'), val('Code', `
  async reduce() {
    const loadTwice = async () => (await load()) + (await load());
    return loadTwice().then((n) => (state: State) => state.add(n));
  }`))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, an inherited async before or retry is also found.')
  .given('A base action, declared in another file, with {Case}.')
  .and('An action that extends it, with an async reduce without await.')
  .when('The code is linted with type information.')
  .then('There are no warnings.')
  .and('Without type information, the base action is not known, so it is reported.')
  .example(val('Case', 'checkInternet'), val('Base', 'checkInternet = { dialog: true };'))
  .example(val('Case', 'retry'), val('Base', 'retry = { on: true };'))
  .run(async (ctx) => {
    // TypeScript only finds imported virtual files in directories that exist.
    const filename = '../reduceWithoutAwait.ts';
    const files = {
      '../reduceWithoutAwaitBase.ts': `import { KissAction } from 'kiss-for-react';
export class State { constructor(readonly count: number) {} add(n: number) { return new State(this.count + n); } }
export abstract class Action extends KissAction<State> {
  ${ctx.example.val('Base')}
}
`,
    };
    const code = `import { Action, State } from './reduceWithoutAwaitBase';

class Increment extends Action {
  async reduce() {
    return (state: State) => state.add(1);
  }
}
`;
    const result = lint(rule, code, {filename, files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {filename, files, types: false}).messages.map((m) => m.text)).toEqual(['reduce']);
  });

Bdd(feature)
  .scenario('Classes that are not Kiss actions are not reported.')
  .given('A class that is not a Kiss action, with an async reduce without await.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `class Base { reduce(): unknown { return null; } }

class Reducer extends Base {
  async reduce() {
    return 1;
  }
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
