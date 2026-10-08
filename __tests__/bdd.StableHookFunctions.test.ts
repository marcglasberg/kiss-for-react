import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  KissAction,
  Store,
  StoreProvider,
  useClearExceptionFor,
  useDispatch,
  useDispatchAll,
  useDispatchAndWait,
  useDispatchAndWaitAll,
  useDispatcher,
  useDispatchSync,
  useDispatchWhen,
  useSelect,
  useStore,
} from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Hooks return stable functions');

class State {
  constructor(readonly count: number) {}
}

class Inc extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

function createStore() {
  return new Store<State>({ initialState: new State(0), logger: () => {} });
}

const hooks: Record<string, () => any> = {
  useDispatch,
  useDispatcher,
  useDispatchAndWait,
  useDispatchAndWaitAll,
  useDispatchAll,
  useDispatchSync,
  useDispatchWhen,
  useClearExceptionFor,
  useStore,
};

/** Renders a component that calls `hook` and records what it returns on every render. */
function renderRecording(hookName: string, store: Store<State>) {
  const results: any[] = [];
  const Comp: React.FC = () => {
    results.push(hooks[hookName]());
    return React.createElement(React.Fragment, null, String(useSelect((s: State) => s.count)));
  };
  const element = React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) });
  act(() => {
    TestRenderer.create(element);
  });
  return results;
}

Bdd(feature)
  .scenario('Hooks that return functions return the same function on every render.')
  .given('A component that calls a hook that returns a function (or the dispatchers).')
  .when('The component re-renders because the state changed.')
  .then('The hook returns the same value it returned in the first render.')
  .example(val('Hook', 'useDispatch'))
  .example(val('Hook', 'useDispatcher'))
  .example(val('Hook', 'useDispatchAndWait'))
  .example(val('Hook', 'useDispatchAndWaitAll'))
  .example(val('Hook', 'useDispatchAll'))
  .example(val('Hook', 'useDispatchSync'))
  .example(val('Hook', 'useDispatchWhen'))
  .example(val('Hook', 'useClearExceptionFor'))
  .example(val('Hook', 'useStore'))
  .run(async (ctx) => {
    const store = createStore();
    const results = renderRecording(ctx.example.val('Hook'), store);

    act(() => store.dispatch(new Inc()));
    act(() => store.dispatch(new Inc()));

    expect(results.length).toBe(3);
    expect(results[1]).toBe(results[0]);
    expect(results[2]).toBe(results[0]);
  });

Bdd(feature)
  .scenario('An effect that depends on the dispatch function runs only once.')
  .given('A component that dispatches an action in an effect.')
  .and('The effect lists the dispatch function as a dependency.')
  .and('The component selects the state the action changes.')
  .when('The component is rendered.')
  .then('The effect runs once, and the action is dispatched once.')
  .run(async (_) => {
    const store = createStore();
    let effectRuns = 0;
    const Comp: React.FC = () => {
      const dispatch = useDispatch();
      const count = useSelect((s: State) => s.count);
      useEffect(() => {
        effectRuns++;
        if (effectRuns < 50) dispatch(new Inc());
      }, [dispatch]);
      return React.createElement(React.Fragment, null, String(count));
    };

    act(() => {
      TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
    });

    expect(effectRuns).toBe(1);
    expect(store.state.count).toBe(1);
  });
