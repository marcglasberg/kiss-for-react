import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ActionStatus, KissAction, Store, StoreProvider, useStore } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Destructuring useStore');

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

/**
 * Renders a component that destructures the methods of `useStore()`,
 * as in `const { dispatch } = useStore()`, and returns them.
 */
function renderAndDestructure(store: Store<State>): Record<string, (...args: any[]) => any> {
  let methods!: Record<string, (...args: any[]) => any>;
  const Comp: React.FC = () => {
    const {
      dispatch,
      dispatchSync,
      dispatchAndWait,
      dispatchWhen,
      dispatchAll,
      dispatchAndWaitAll,
      waitCondition,
      waitActionCondition,
      waitAllActions,
      waitActionType,
      waitAllActionTypes,
      waitAnyActionTypeFinishes,
    } = useStore();
    methods = {
      dispatch,
      dispatchSync,
      dispatchAndWait,
      dispatchWhen,
      dispatchAll,
      dispatchAndWaitAll,
      waitCondition,
      waitActionCondition,
      waitAllActions,
      waitActionType,
      waitAllActionTypes,
      waitAnyActionTypeFinishes,
    };
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
  });
  return methods;
}

/** For each method, calls it (detached from the object), and checks it did its job. */
const callAndCheck: Record<string, (method: (...args: any[]) => any, store: Store<State>) => Promise<void>> = {
  dispatch: async (dispatch, store) => {
    dispatch(new Inc());
    expect(store.state.count).toBe(1);
  },
  dispatchSync: async (dispatchSync, store) => {
    dispatchSync(new Inc());
    expect(store.state.count).toBe(1);
  },
  dispatchAndWait: async (dispatchAndWait, store) => {
    const status: ActionStatus = await dispatchAndWait(new Inc());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  },
  dispatchWhen: async (dispatchWhen, store) => {
    dispatchWhen(new Inc(), (state: State) => state.count === 0, { timeoutMillis: 0 });
    await store.waitCondition((state) => state.count === 1, { timeoutMillis: 1000 });
    expect(store.state.count).toBe(1);
  },
  dispatchAll: async (dispatchAll, store) => {
    const actions = [new Inc(), new Inc()];
    expect(dispatchAll(actions)).toBe(actions);
    expect(store.state.count).toBe(2);
  },
  dispatchAndWaitAll: async (dispatchAndWaitAll, store) => {
    const actions = [new Inc(), new Inc()];
    expect(await dispatchAndWaitAll(actions)).toBe(actions);
    expect(store.state.count).toBe(2);
  },
  waitCondition: async (waitCondition, store) => {
    const promise = waitCondition((state: State) => state.count === 1, { timeoutMillis: 1000 });
    store.dispatch(new Inc());
    const action = await promise;
    expect(action).toBeInstanceOf(Inc);
  },
  waitActionCondition: async (waitActionCondition) => {
    const result = await waitActionCondition(
      (actions: Set<KissAction<State>>) => actions.size === 0,
      { completeImmediately: true, timeoutMillis: 1000 });
    expect(result.actions.size).toBe(0);
  },
  waitAllActions: async (waitAllActions) => {
    const result = await waitAllActions(null, { completeImmediately: true, timeoutMillis: 1000 });
    expect(result.actions.size).toBe(0);
  },
  waitActionType: async (waitActionType) => {
    const action = await waitActionType(Inc, { completeImmediately: true, timeoutMillis: 1000 });
    expect(action).toBeNull();
  },
  waitAllActionTypes: async (waitAllActionTypes) => {
    await expect(waitAllActionTypes([Inc], { completeImmediately: true, timeoutMillis: 1000 }))
      .resolves.toBeUndefined();
  },
  waitAnyActionTypeFinishes: async (waitAnyActionTypeFinishes, store) => {
    const promise = waitAnyActionTypeFinishes([Inc], { timeoutMillis: 1000 });
    store.dispatch(new Inc());
    const action = await promise;
    expect(action).toBeInstanceOf(Inc);
  },
};

Bdd(feature)
  .scenario('The methods of useStore work when destructured.')
  .given('A component that destructures a method of useStore, as in `const { dispatch } = useStore()`.')
  .when('The destructured method is called.')
  .then('It works the same as calling it on the object returned by useStore.')
  .example(val('Method', 'dispatch'))
  .example(val('Method', 'dispatchSync'))
  .example(val('Method', 'dispatchAndWait'))
  .example(val('Method', 'dispatchWhen'))
  .example(val('Method', 'dispatchAll'))
  .example(val('Method', 'dispatchAndWaitAll'))
  .example(val('Method', 'waitCondition'))
  .example(val('Method', 'waitActionCondition'))
  .example(val('Method', 'waitAllActions'))
  .example(val('Method', 'waitActionType'))
  .example(val('Method', 'waitAllActionTypes'))
  .example(val('Method', 'waitAnyActionTypeFinishes'))
  .run(async (ctx) => {
    // Given: a component that destructures the methods of useStore.
    const methodName: string = ctx.example.val('Method');
    const store = createStore();
    const methods = renderAndDestructure(store);

    // When/Then: the destructured method is called, and does its job.
    await act(async () => {
      await callAndCheck[methodName](methods[methodName], store);
    });
  });
