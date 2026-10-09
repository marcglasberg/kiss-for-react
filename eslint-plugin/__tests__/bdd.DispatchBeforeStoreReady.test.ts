import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dispatchBeforeStoreReady';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-before-store-ready');

const prelude = `import { createStore, KissAction, Persistor, Store } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  static initialState = new State(0);
}

class InitApp extends KissAction<State> {
  reduce() { return new State(1); }
}

declare const persistor: Persistor<State>;
`;

Bdd(feature)
  .scenario('Dispatching right after creating a store with a persistor is an error.')
  .given('A store created with {Creation}, with a persistor, at the top level of a module.')
  .when('An action is dispatched with {Method}, without waiting for store.ready().')
  .then('There is an error, saying to wait for store.ready().')
  .and('The suggestion adds "await store.ready();" before the dispatch.')
  .example(val('Creation', 'createStore'), val('Method', 'dispatch'))
  .example(val('Creation', 'new Store'), val('Method', 'dispatchSync'))
  .example(val('Creation', 'createStore'), val('Method', 'dispatchAndWait'))
  .run(async (ctx) => {
    const creation = ctx.example.val('Creation') === 'createStore' ? 'createStore<State>' : 'new Store<State>';
    const method = ctx.example.val('Method') as string;
    const code = `${prelude}
const store = ${creation}({ initialState: State.initialState, persistor });
store.${method}(new InitApp());
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual([`store.${method}`]);
      expect(result.messages[0].message).toBe(
        '`store` has a persistor, and is not ready until it reads the persisted state. Dispatching before ' +
        'that throws a `StoreException`. Wait for `store.ready()` first.');
      expect(result.messages[0].suggestions).toEqual(['Add `await store.ready();` before the dispatch.']);
      const fixed = result.withSuggestion(0, 0);
      expect(fixed).toContain(`await store.ready();\nstore.${method}(new InitApp());`);
      if (types) {
        expect(result.typeErrors).toEqual([]);
        expect(lint(rule, fixed).typeErrors).toEqual([]);
        expect(lint(rule, fixed).messages).toEqual([]);
      }
    }
  });

Bdd(feature)
  .scenario('Inside a function, the suggestion is only offered when the function is async.')
  .given('A function that creates a store with a persistor, and dispatches right away.')
  .when('The function is {Kind}.')
  .then('There is an error.')
  .and('There is a suggestion: {Suggestion}.')
  .example(val('Kind', 'async'), val('Suggestion', true))
  .example(val('Kind', 'not async'), val('Suggestion', false))
  .run(async (ctx) => {
    const isAsync = ctx.example.val('Kind') === 'async';
    const code = `${prelude}
export ${isAsync ? 'async ' : ''}function start() {
  const store = createStore<State>({ initialState: State.initialState, persistor });
  store.dispatch(new InitApp());
  return store;
}
`;
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual(['store.dispatch']);
    if (ctx.example.val('Suggestion')) {
      const fixed = result.withSuggestion(0, 0);
      expect(fixed).toContain('  await store.ready();\n  store.dispatch(new InitApp());');
      expect(lint(rule, fixed).typeErrors).toEqual([]);
    } else {
      expect(result.messages[0].suggestions).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Dispatching after waiting for the store, or without a persistor, is fine.')
  .given('{Given}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Given', 'A dispatch after await store.ready()'), val('Code', `
const store = createStore<State>({ initialState: State.initialState, persistor });
await store.ready();
store.dispatch(new InitApp());`))
  .example(val('Given', 'A dispatch after awaiting a Promise.all with store.ready()'), val('Code', `
const store = createStore<State>({ initialState: State.initialState, persistor });
await Promise.all([store.ready(), Promise.resolve()]);
store.dispatch(new InitApp());`))
  .example(val('Given', 'A dispatch in a callback of store.ready()'), val('Code', `
const store = createStore<State>({ initialState: State.initialState, persistor });
store.ready().then(() => store.dispatch(new InitApp()));`))
  .example(val('Given', 'A store without a persistor'), val('Code', `
const store = createStore<State>({ initialState: State.initialState });
store.dispatch(new InitApp());`))
  .example(val('Given', 'A store with an undefined persistor'), val('Code', `
const store = createStore<State>({ initialState: State.initialState, persistor: undefined });
store.dispatch(new InitApp());`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toEqual([]);
      if (types) expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('Only dispatches before the first wait for store.ready() are reported.')
  .given('A store with a persistor, dispatched once before and once after await store.ready().')
  .when('The code is linted.')
  .then('Only the first dispatch is reported.')
  .run(async (_) => {
    const code = `${prelude}
export async function start() {
  const store = createStore<State>({ initialState: State.initialState, persistor });
  store.dispatch(new InitApp());
  await store.ready();
  store.dispatch(new InitApp());
}
`;
    const result = lint(rule, code, {types: false});
    const firstDispatchLine = code.split('\n').indexOf('  store.dispatch(new InitApp());') + 1;
    expect(result.messages.map((m) => m.line)).toEqual([firstDispatchLine]);
  });

Bdd(feature)
  .scenario('Stores that are not Kiss stores are not reported.')
  .given('A function called createStore that is not imported from Kiss.')
  .when('It creates a store with a persistor, and dispatches right away.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `
declare function createStore(options: { persistor: unknown }): { dispatch(action: unknown): void };

const store = createStore({ persistor: {} });
store.dispatch({ type: 'init' });
`;
    expect(lint(rule, code).messages).toEqual([]);
  });
