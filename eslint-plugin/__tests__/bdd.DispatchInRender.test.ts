import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/dispatchInRender';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: dispatch-in-render');

const prelude = `import { createStore, KissAction, useDispatch, useDispatchAndWait, useStore } from 'kiss-for-react';
import { memo, useEffect, useReducer } from 'react';

class State {
  constructor(readonly count: number) {}
}

class LoadUser extends KissAction<State> {
  reduce() { return null; }
}

const store = createStore<State>({ initialState: new State(0) });
`;

Bdd(feature)
  .scenario('Dispatching while a component renders is a warning.')
  .given('A component that dispatches {How}, in its body.')
  .when('The code is linted.')
  .then('There is a warning in the dispatch.')
  .example(val('How', 'with the function from useDispatch'), val('Code', 'const dispatch = useDispatch();\n  dispatch(new LoadUser());'), val('Callee', 'dispatch'))
  .example(val('How', 'with the function from useDispatchAndWait'), val('Code', 'const dispatchAndWait = useDispatchAndWait();\n  void dispatchAndWait(new LoadUser());'), val('Callee', 'dispatchAndWait'))
  .example(val('How', 'with useStore'), val('Code', 'const kiss = useStore();\n  kiss.dispatch(new LoadUser());'), val('Callee', 'kiss.dispatch'))
  .example(val('How', 'with useStore directly'), val('Code', 'useStore().dispatch(new LoadUser());'), val('Callee', 'useStore().dispatch'))
  .example(val('How', 'with a store created in the same file'), val('Code', 'store.dispatch(new LoadUser());'), val('Callee', 'store.dispatch'))
  .example(val('How', 'inside an if'), val('Code', 'const dispatch = useDispatch();\n  if (props.id) dispatch(new LoadUser());'), val('Callee', 'dispatch'))
  .example(val('How', 'in a JSX attribute, instead of an event handler'), val('Code', 'const dispatch = useDispatch();\n  return <button onClick={dispatch(new LoadUser())} />;'), val('Callee', 'dispatch'))
  .example(val('How', 'in a function called right away'), val('Code', 'const dispatch = useDispatch();\n  (() => dispatch(new LoadUser()))();'), val('Callee', 'dispatch'))
  .run(async (ctx) => {
    const code = `${prelude}
export function User(props: { id?: string }) {
  ${ctx.example.val('Code')}
  return <p>{props.id}</p>;
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Callee')]);
      expect(result.messages[0].message).toContain('dispatches while the component renders');
    }
  });

Bdd(feature)
  .scenario('Arrow function components, memo components and custom hooks are checked too.')
  .given('A {Kind} that dispatches in its body.')
  .when('The code is linted.')
  .then('There is a warning.')
  .example(val('Kind', 'arrow function component'), val('Code', `
export const User = () => {
  const dispatch = useDispatch();
  dispatch(new LoadUser());
  return <p />;
};`))
  .example(val('Kind', 'component wrapped in memo'), val('Code', `
export const User = memo(function () {
  store.dispatch(new LoadUser());
  return <p />;
});`))
  .example(val('Kind', 'custom hook'), val('Code', `
export function useUser() {
  const dispatch = useDispatch();
  dispatch(new LoadUser());
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    expect(lint(rule, code).messages.length).toBe(1);
  });

Bdd(feature)
  .scenario('Dispatches in event handlers, effects, useDispatch options and other closures are fine.')
  .given('A component that dispatches in an event handler, an effect, the onMount option of useDispatch, and a callback.')
  .and('It also uses the dispatch of React\'s useReducer in its body.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .and('The code compiles.')
  .run(async (_) => {
    const code = `${prelude}
export function User() {
  const dispatch = useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) });
  const [count, increment] = useReducer((n: number) => n + 1, 0);
  if (count === 0) increment();
  useEffect(() => { dispatch(new LoadUser()); }, [dispatch]);
  function reload() { store.dispatch(new LoadUser()); }
  setTimeout(() => reload(), 1000);
  return <button onClick={() => dispatch(new LoadUser())}>{count}</button>;
}
`;
    const result = lint(rule, code);
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Functions that are not components are not checked.')
  .given('A function with a lowercase name that dispatches, and does not return JSX.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
export function initApp() {
  store.dispatch(new LoadUser());
}
`;
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A store imported from another file is only recognized with type information.')
  .given('A component that dispatches in its body, with a store imported from another file.')
  .when('The code is linted.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since the store is not known.')
  .run(async (_) => {
    const files = {
      'store.ts': `import { createStore } from 'kiss-for-react';
export const store = createStore<number>({ initialState: 0 });`,
    };
    const code = `import { KissAction } from 'kiss-for-react';
import { store } from './store';

class Increment extends KissAction<number> {
  reduce() { return this.state + 1; }
}

export function Counter() {
  store.dispatch(new Increment());
  return <p />;
}
`;
    const result = lint(rule, code, {files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['store.dispatch']);
    expect(lint(rule, code, {types: false, files}).messages).toEqual([]);
  });
