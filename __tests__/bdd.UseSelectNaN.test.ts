import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useDispatch, useSelect, useSelector } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useSelect with a selector that returns NaN');

class State {
  constructor(readonly a: number, readonly b: number) {}
}

class IncB extends KissAction<State> {
  reduce() {
    return new State(this.state.a, this.state.b + 1);
  }
}

class SetA extends KissAction<State> {
  constructor(readonly a: number) {
    super();
  }

  reduce() {
    return new State(this.a, this.state.b);
  }
}

const hooks: Record<string, (selector: (state: State) => number) => number> = { useSelect, useSelector };

// Renders a component that selects `a` with the given hook, and counts its renders.
// Returns the number of renders so far, and what the component shows.
function renderSelectingA(store: Store<State>, hook: string, child?: React.FC) {
  const result = { renders: 0, shown: [] as number[] };
  const Component: React.FC = () => {
    const a = hooks[hook]((s: State) => s.a);
    result.renders++;
    result.shown.push(a);
    return child ? React.createElement(child) : null;
  };
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Component) }));
  });
  return result;
}

Bdd(feature)
  .scenario('A selector that returns NaN does not re-render the component when other parts of the state change.')
  .given('The state has `a` equal to NaN.')
  .and('A component selects `a`.')
  .when('Two actions change other parts of the state, but not `a`.')
  .then('The component is not rendered again.')
  .example(val('Hook', 'useSelect'))
  .example(val('Hook', 'useSelector'))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State(NaN, 0), logger: () => {} });
    const result = renderSelectingA(store, ctx.example.val('Hook'));
    expect(result.renders).toBe(1);

    act(() => store.dispatch(new IncB()));
    act(() => store.dispatch(new IncB()));

    expect(store.state.b).toBe(2);
    expect(result.renders).toBe(1);
  });

Bdd(feature)
  .scenario('A selector that returns NaN does not re-render the component when the state changes before it subscribes.')
  .given('The state has `a` equal to NaN.')
  .and('A component selects `a`.')
  .and('Its child changes another part of the state when it mounts, before the component subscribes to the store.')
  .when('The component is rendered.')
  .then('The component is rendered only once.')
  .run(async (_) => {
    const ChildThatIncrementsBOnMount: React.FC = () => {
      const dispatch = useDispatch();
      useEffect(() => {
        dispatch(new IncB());
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    };

    const store = new Store<State>({ initialState: new State(NaN, 0), logger: () => {} });
    const result = renderSelectingA(store, 'useSelect', ChildThatIncrementsBOnMount);

    expect(store.state.b).toBe(1);
    expect(result.renders).toBe(1);
  });

Bdd(feature)
  .scenario('A selector re-renders the component when the selected value changes to NaN.')
  .given('The state has `a` equal to 1.')
  .and('A component selects `a`.')
  .when('An action changes `a` to NaN.')
  .then('The component is rendered again, and shows NaN.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1, 0), logger: () => {} });
    const result = renderSelectingA(store, 'useSelect');
    expect(result.renders).toBe(1);

    act(() => store.dispatch(new SetA(NaN)));
    expect(result.renders).toBe(2);
    expect(result.shown[1]).toBeNaN();
  });

Bdd(feature)
  .scenario('A selector re-renders the component when the selected value changes from NaN.')
  .given('The state has `a` equal to NaN.')
  .and('A component selects `a`.')
  .when('An action changes `a` to 1.')
  .then('The component is rendered again, and shows 1.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(NaN, 0), logger: () => {} });
    const result = renderSelectingA(store, 'useSelect');
    expect(result.renders).toBe(1);

    act(() => store.dispatch(new SetA(1)));
    expect(result.renders).toBe(2);
    expect(result.shown[1]).toBe(1);
  });

Bdd(feature)
  .scenario('Selected values are compared like React compares them, so 0 and -0 are different values.')
  .given('The state has `a` equal to 0.')
  .and('A component selects `a`.')
  .when('An action changes `a` to -0.')
  .then('The component is rendered again, and shows -0.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0, 0), logger: () => {} });
    const result = renderSelectingA(store, 'useSelect');
    expect(result.renders).toBe(1);

    act(() => store.dispatch(new SetA(-0)));
    expect(result.renders).toBe(2);
    expect(Object.is(result.shown[1], -0)).toBe(true);
  });
