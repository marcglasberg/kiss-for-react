import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useStore } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('dispatchAll and dispatchAndWaitAll in useStore');

class State {
  constructor(readonly log: string[]) {}
}

/** A SYNC action that adds its name to the log. */
class SyncAction extends KissAction<State> {
  constructor(readonly name: string) { super(); }

  reduce() {
    return new State([...this.state.log, this.name]);
  }
}

/** An ASYNC action that waits a bit, and then adds its name to the log. */
class AsyncAction extends KissAction<State> {
  constructor(readonly name: string, readonly millis = 10) { super(); }

  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, this.millis));
    return (state: State) => new State([...state.log, this.name]);
  }
}

/** An ASYNC action that waits a bit, and then fails. */
class AsyncFail extends KissAction<State> {
  constructor(readonly name: string, readonly millis = 10) { super(); }

  async reduce(): Promise<null> {
    await new Promise((resolve) => setTimeout(resolve, this.millis));
    throw new Error('Failed: ' + this.name);
  }
}

function createStore() {
  return new Store<State>({ initialState: new State([]), logger: () => {} });
}

/** Renders a component that gets the store with `useStore()`, and returns what it got. */
function renderAndUseStore(store: Store<State>): ReturnType<typeof useStore> {
  let dispatchers!: ReturnType<typeof useStore>;
  const Comp: React.FC = () => {
    dispatchers = useStore();
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
  });
  return dispatchers;
}

Bdd(feature)
  .scenario('The store from useStore can dispatch all given actions with dispatchAll.')
  .given('A component that gets the store with useStore.')
  .and('Two SYNC actions and one ASYNC action.')
  .when('The component dispatches the three actions with dispatchAll.')
  .then('All three actions are dispatched.')
  .and('The SYNC actions changed the state right away.')
  .and('It returns the same list of actions.')
  .and('The ASYNC action changes the state when it finishes.')
  .run(async (_) => {
    // Given: a component that gets the store with useStore, and three actions.
    const store = createStore();
    const dispatchers = renderAndUseStore(store);
    const actions = [new SyncAction('A'), new AsyncAction('B'), new SyncAction('C')];

    // When: the component dispatches them with dispatchAll.
    const result = dispatchers.dispatchAll(actions);

    // Then: all were dispatched, the SYNC ones already changed the state, and it returns them.
    for (const action of actions) expect(action.status.isDispatched).toBe(true);
    expect(store.state.log).toEqual(['A', 'C']);
    expect(result).toBe(actions);

    // And: the ASYNC action changes the state when it finishes.
    await store.waitAllActions(actions, { completeImmediately: true, timeoutMillis: 1000 });
    expect(store.state.log).toEqual(['A', 'C', 'B']);
  });

Bdd(feature)
  .scenario('The store from useStore can dispatch all given actions, and wait for them, with dispatchAndWaitAll.')
  .given('A component that gets the store with useStore.')
  .and('A SYNC action and two ASYNC actions, which take different times to finish.')
  .when('The component dispatches the three actions with dispatchAndWaitAll.')
  .then('All three actions are dispatched right away.')
  .and('The Promise resolves only after all three actions finished.')
  .and('It resolves with the same list of actions.')
  .run(async (_) => {
    // Given: a component that gets the store with useStore, and three actions.
    const store = createStore();
    const dispatchers = renderAndUseStore(store);
    const actions = [new AsyncAction('Slow', 30), new SyncAction('Sync'), new AsyncAction('Fast', 5)];

    // When: the component dispatches them with dispatchAndWaitAll.
    const promise = dispatchers.dispatchAndWaitAll(actions);

    // Then: all were dispatched right away.
    for (const action of actions) expect(action.status.isDispatched).toBe(true);

    // And: the Promise resolves, with the same list, only after all of them finished.
    const result = await promise;
    expect(result).toBe(actions);
    for (const action of actions) expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.log).toEqual(['Sync', 'Fast', 'Slow']);
  });

Bdd(feature)
  .scenario('With useStore, dispatchAndWaitAll rejects with the error of the first failed action, after all actions finish.')
  .given('A component that gets the store with useStore.')
  .and('Two ASYNC actions that fail, and an ASYNC action that succeeds and takes longer to finish.')
  .when('The component dispatches the three actions with dispatchAndWaitAll.')
  .then('The Promise rejects only after all three actions finished.')
  .and('It rejects with the error of the first failed action in the list.')
  .run(async (_) => {
    // Given: a component that gets the store with useStore, and three actions.
    const store = createStore();
    const dispatchers = renderAndUseStore(store);
    const fail1 = new AsyncFail('First', 10);
    const fail2 = new AsyncFail('Second', 5);
    const slowOk = new AsyncAction('Slow', 30);

    // When: the component dispatches them with dispatchAndWaitAll.
    let error: unknown;
    await dispatchers.dispatchAndWaitAll([slowOk, fail1, fail2]).catch((e) => { error = e; });

    // Then: it rejected only after all of them finished.
    expect(slowOk.status.isCompletedOk).toBe(true);
    expect(fail1.status.isCompletedFailed).toBe(true);
    expect(fail2.status.isCompletedFailed).toBe(true);
    expect(store.state.log).toEqual(['Slow']);

    // And: with the error of the first failed action in the list (not the first that failed in time).
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Failed: First');
  });
