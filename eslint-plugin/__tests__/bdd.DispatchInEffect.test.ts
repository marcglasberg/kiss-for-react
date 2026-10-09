import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dispatchInEffect';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-in-effect');

const stateFile = `import { KissAction } from 'kiss-for-react';

export class State {
  constructor(readonly count: number) {}
  static initialState = new State(0);
}

export class FetchCards extends KissAction<State> {
  reduce() { return new State(1); }
}

export class StopListening extends KissAction<State> {
  reduce() { return new State(2); }
}

export class LoadUser extends KissAction<State> {
  constructor(readonly userId: string, readonly filter = '') { super(); }
  reduce() { return new State(3); }
}`;

// The store is created in another file, with a persistor.
const persistedStore = `import { createStore, Persistor } from 'kiss-for-react';
import { State } from './state';

declare const persistor: Persistor<State>;

export const store = createStore<State>({ initialState: State.initialState, persistor });`;

const files = {'state.ts': stateFile, 'store.ts': persistedStore};

const imports = `import React, { useEffect, useLayoutEffect } from 'react';
import { useDispatch, useDispatchAndWait, useDispatchWhen, useIsStoreReady, useStore } from 'kiss-for-react';
import { FetchCards, LoadUser, State, StopListening } from './state';
`;

/** Lints the code, with and without type information, and checks both give the same messages. */
function lintBoth(code: string, options: { files?: Record<string, string> } = {}) {
  const withTypes = lint(rule, code, {files: options.files ?? files});
  const withoutTypes = lint(rule, code, {types: false, files: options.files ?? files});
  expect(withTypes.typeErrors).toEqual([]);
  expect(withoutTypes.messages).toEqual(withTypes.messages);
  return withTypes;
}

Bdd(feature)
  .scenario('Dispatching in an effect when the component mounts is a warning, with a suggestion to use onMount.')
  .given('A store with a persistor, created in another file.')
  .and('A component that gets dispatch from useDispatch(), and dispatches in useEffect with empty deps.')
  .when('The code is linted.')
  .then('There is a warning in the dispatch, saying the store may not be ready.')
  .and('The suggestion replaces the effect with useDispatch({ onMount }), and removes the unused dispatch.')
  .and('The code with the suggestion compiles, and has no warnings.')
  .run(async (_) => {
    const code = `${imports}
export default function HomeScreen() {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(new FetchCards());
  }, []);

  return <p>Home</p>;
}
`;
    const result = lintBoth(code);
    expect(result.messages.map((m) => m.text)).toEqual(['dispatch']);
    expect(result.messages[0].message).toBe(
      '`dispatch` dispatches in an effect, when the component mounts. If the store has a persistor, it may not be ' +
      'ready yet, and dispatching throws a `StoreException`. Use the `onMount` option of `useDispatch`, which ' +
      'waits for the store to be ready.');
    expect(result.messages[0].suggestions).toEqual(['Replace the effect with `useDispatch({ onMount })`.']);

    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain(`export default function HomeScreen() {

  useDispatch({
    onMount: (store) => {
      store.dispatch(new FetchCards());
    },
  });

  return <p>Home</p>;
}`);
    const fixedResult = lint(rule, fixed, {files});
    expect(fixedResult.typeErrors).toEqual([]);
    expect(fixedResult.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('The dispatch functions of the component are recognized.')
  .given('A component that dispatches in {Effect}, with {Dispatch}.')
  .when('The code is linted.')
  .then('There is a warning in {Callee}.')
  .and('The suggestion dispatches with {Replacement}, and compiles.')
  .example(val('Effect', 'useEffect'), val('Dispatch', 'const dispatch = useDispatch()'),
    val('Callee', 'dispatch'), val('Replacement', 'store.dispatch'))
  .example(val('Effect', 'useLayoutEffect'), val('Dispatch', 'const dispatchAndWait = useDispatchAndWait()'),
    val('Callee', 'dispatchAndWait'), val('Replacement', 'store.dispatchAndWait'))
  .example(val('Effect', 'React.useEffect'), val('Dispatch', 'const store = useStore()'),
    val('Callee', 'store.dispatch'), val('Replacement', 'store.dispatch'))
  .example(val('Effect', 'useEffect'), val('Dispatch', 'const { dispatch } = useStore()'),
    val('Callee', 'dispatch'), val('Replacement', 'store.dispatch'))
  .example(val('Effect', 'useEffect'), val('Dispatch', 'const kiss = useStore()'),
    val('Callee', 'kiss.store.dispatch'), val('Replacement', 'store.dispatch'))
  .run(async (ctx) => {
    const callee = ctx.example.val('Callee') as string;
    const code = `${imports}
export function Cards() {
  ${ctx.example.val('Dispatch')};
  ${ctx.example.val('Effect')}(() => {
    ${callee}(new FetchCards());
  }, []);
  return <p>Cards</p>;
}
`;
    const result = lintBoth(code);
    expect(result.messages.map((m) => m.text)).toEqual([callee]);
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain(`    onMount: (store) => {\n      ${ctx.example.val('Replacement')}(new FetchCards());\n    },`);
    expect(lint(rule, fixed, {files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The deps of the effect become deps, onMount and onDepsChange.')
  .given('A component that dispatches in an effect with deps {Deps}.')
  .when('The code is linted.')
  .then('There is a warning.')
  .and('The suggestion is useDispatch({ {Options} }), with deps {NewDeps}.')
  .and('The code with the suggestion compiles.')
  .example(val('Deps', '[userId]'), val('Options', 'deps, onMount, onDepsChange'), val('NewDeps', 'userId'))
  .example(val('Deps', '[userId, filter]'), val('Options', 'deps, onMount, onDepsChange'), val('NewDeps', '[userId, filter]'))
  .example(val('Deps', '[dispatch, userId]'), val('Options', 'deps, onMount, onDepsChange'), val('NewDeps', 'userId'))
  .example(val('Deps', '[dispatch]'), val('Options', 'onMount'), val('NewDeps', '(none)'))
  .run(async (ctx) => {
    const code = `${imports}
export function User({ userId, filter }: { userId: string, filter: string }) {
  const dispatch = useDispatch();
  useEffect(() => dispatch(new LoadUser(userId, filter)), ${ctx.example.val('Deps')});
  return <button onClick={() => dispatch(new FetchCards())}>{userId}</button>;
}
`;
    const result = lintBoth(code);
    expect(result.messages.map((m) => m.text)).toEqual(['dispatch']);
    const options = ctx.example.val('Options') as string;
    expect(result.messages[0].suggestions).toEqual([`Replace the effect with \`useDispatch({ ${options} })\`.`]);

    const fixed = result.withSuggestion(0, 0);
    const newDeps = ctx.example.val('NewDeps') as string;
    const expected = newDeps === '(none)'
      ? `  useDispatch({
    onMount: (store) => store.dispatch(new LoadUser(userId, filter)),
  });`
      : `  useDispatch({
    deps: ${newDeps},
    onMount: (store) => store.dispatch(new LoadUser(userId, filter)),
    onDepsChange: (store) => store.dispatch(new LoadUser(userId, filter)),
  });`;
    expect(fixed).toContain(expected);
    // The dispatch is still used in the button, so it's kept.
    expect(fixed).toContain('const dispatch = useDispatch();');
    expect(lint(rule, fixed, {files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The cleanup function of the effect becomes onUnmount.')
  .given('A component that dispatches in an effect with empty deps, and a cleanup that dispatches too.')
  .when('The code is linted.')
  .then('There is a warning.')
  .and('The suggestion is useDispatch({ onMount, onUnmount }), and compiles.')
  .run(async (_) => {
    const code = `${imports}
export function Cards() {
  const dispatch = useDispatch();
  useEffect(() => {
    console.log('Mounted');
    dispatch(new FetchCards());
    return () => {
      dispatch(new StopListening());
    };
  }, []);
  return <p>Cards</p>;
}
`;
    const result = lintBoth(code);
    expect(result.messages[0].suggestions).toEqual(['Replace the effect with `useDispatch({ onMount, onUnmount })`.']);
    const fixed = result.withSuggestion(0, 0);
    expect(fixed).toContain(`export function Cards() {
  useDispatch({
    onMount: (store) => {
      console.log('Mounted');
      store.dispatch(new FetchCards());
    },
    onUnmount: (store) => {
      store.dispatch(new StopListening());
    },
  });
  return <p>Cards</p>;
}`);
    expect(lint(rule, fixed, {files}).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Effects that can\'t be converted are reported without a suggestion.')
  .given('A component that dispatches in an effect {Effect}.')
  .when('The code is linted.')
  .then('There is a warning, without a suggestion.')
  .example(val('Effect', 'with deps that change, and a cleanup'), val('Code', `
  useEffect(() => {
    dispatch(new LoadUser(userId));
    return () => dispatch(new StopListening());
  }, [userId]);`))
  .example(val('Effect', 'with a cleanup that uses a variable of the effect'), val('Code', `
  useEffect(() => {
    const timer = setInterval(() => {}, 1000);
    dispatch(new FetchCards());
    return () => clearInterval(timer);
  }, []);`))
  .example(val('Effect', 'that returns a cleanup in the middle'), val('Code', `
  useEffect(() => {
    dispatch(new FetchCards());
    if (userId === '') return () => dispatch(new StopListening());
    console.log(userId);
  }, []);`))
  .run(async (ctx) => {
    const code = `${imports}
export function User({ userId }: { userId: string }) {
  const dispatch = useDispatch();${ctx.example.val('Code')}
  return <p>{userId}</p>;
}
`;
    const result = lintBoth(code);
    expect(result.messages.map((m) => m.text)).toEqual(['dispatch']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('Effects that don\'t dispatch when the component mounts are fine.')
  .given('{Given}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Given', 'A dispatch in a callback inside the effect'), val('Code', `
  useEffect(() => {
    const timer = setTimeout(() => dispatch(new FetchCards()), 1000);
    return () => clearTimeout(timer);
  }, []);`))
  .example(val('Given', 'An effect without a deps array'), val('Code', `
  useEffect(() => dispatch(new FetchCards()));`))
  .example(val('Given', 'An effect that checks useIsStoreReady()'), val('Code', `
  const isReady = useIsStoreReady();
  useEffect(() => {
    if (isReady) dispatch(new FetchCards());
  }, [isReady]);`))
  .example(val('Given', 'An effect that waits for store.ready()'), val('Code', `
  const { store } = useStore();
  useEffect(() => {
    store.ready().then(() => store.dispatch(new FetchCards()));
  }, []);`))
  .example(val('Given', 'A dispatchWhen, which waits for its condition'), val('Code', `
  const dispatchWhen = useDispatchWhen();
  useEffect(() => {
    dispatchWhen(new FetchCards(), (state: State) => state.count > 0, { timeoutMillis: 0 });
  }, []);`))
  .example(val('Given', 'The onMount option of useDispatch'), val('Code', `
  useDispatch({ onMount: (store) => store.dispatch(new FetchCards()) });`))
  .run(async (ctx) => {
    const code = `${imports}
export function Cards() {
  const dispatch = useDispatch();${ctx.example.val('Code')}
  return <button onClick={() => dispatch(new FetchCards())}>Cards</button>;
}
`;
    const result = lintBoth(code);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Effects outside components and hooks, or not from React, are not reported.')
  .given('{Given}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Given', 'An effect in a function that is not a component or hook'), val('Code', `${imports}
export function setUp(dispatch: (action: FetchCards) => void) {
  useEffect(() => dispatch(new FetchCards()), []);
}
`))
  .example(val('Given', 'A useEffect function that is not from React'), val('Code', `import { useDispatch } from 'kiss-for-react';
import { FetchCards } from './state';

function useEffect(effect: () => void, _deps: unknown[]) { effect(); }

export function Cards() {
  const dispatch = useDispatch();
  useEffect(() => dispatch(new FetchCards()), []);
  return <p>Cards</p>;
}
`))
  .run(async (ctx) => {
    const result = lintBoth(ctx.example.val('Code') as string);
    expect(result.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, it\'s only reported if the project creates a store with a persistor.')
  .given('A component that dispatches in an effect with empty deps.')
  .and('The project {Persistor} a store with a persistor.')
  .when('The code is linted {Types} type information.')
  .then('There is a warning: {Reported}.')
  .example(val('Persistor', 'creates'), val('Types', 'with'), val('Reported', true))
  .example(val('Persistor', 'does not create'), val('Types', 'with'), val('Reported', false))
  .example(val('Persistor', 'does not create'), val('Types', 'without'), val('Reported', true))
  .run(async (ctx) => {
    const storeFile = ctx.example.val('Persistor') === 'creates'
      ? persistedStore
      : `import { createStore } from 'kiss-for-react';
import { State } from './state';

export const store = createStore<State>({ initialState: State.initialState });`;
    const code = `${imports}
export function Cards() {
  const dispatch = useDispatch();
  useEffect(() => dispatch(new FetchCards()), []);
  return <p>Cards</p>;
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Types') === 'with', files: {'state.ts': stateFile, 'store.ts': storeFile}});
    expect(result.messages.length).toBe(ctx.example.val('Reported') ? 1 : 0);
  });
