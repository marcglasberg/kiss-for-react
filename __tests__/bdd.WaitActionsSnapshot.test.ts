import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait actions snapshot');

class State {
  constructor(readonly count: number) {
  }
}

class SlowAction extends KissAction<State> {
  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(state.count + 1);
  }
}

class FastAction extends KissAction<State> {
  async reduce() {
    await delayMillis(10);
    return (state: State) => new State(state.count + 10);
  }
}

Bdd(feature)
  .scenario('The actions returned by waitActionCondition don\'t change after the wait resolves.')
  .given('We wait for the condition "some action is in progress".')
  .and('An async action is dispatched, which resolves the wait.')
  .when('The action finishes.')
  .then('The actions returned by the wait still contain the action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0)});
    const promise = store.waitActionCondition((actions) => actions.size > 0, {timeoutMillis: 1000});
    const action = new SlowAction();
    store.dispatch(action);
    const {actions} = await promise;

    // When
    await store.waitAllActions([action], {timeoutMillis: 1000});

    // Then
    expect(store.actionsInProgress().size).toBe(0);
    expect(actions.size).toBe(1);
    expect(actions.has(action)).toBe(true);
  });

Bdd(feature)
  .scenario('The actions returned by waitActionCondition when it completes immediately don\'t change later.')
  .given('An async action is in progress.')
  .and('We wait for the condition "some action is in progress", completing immediately.')
  .when('The action finishes.')
  .then('The actions returned by the wait still contain the action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0)});
    const action = new SlowAction();
    store.dispatch(action);
    const {actions} = await store.waitActionCondition(
      (actions) => actions.size > 0,
      {completeImmediately: true},
    );

    // When
    await store.waitAllActions([action], {timeoutMillis: 1000});

    // Then
    expect(store.actionsInProgress().size).toBe(0);
    expect(actions.size).toBe(1);
    expect(actions.has(action)).toBe(true);
  });

Bdd(feature)
  .scenario('The actions returned by waitActionCondition when it times out don\'t change later.')
  .given('An async action is in progress.')
  .and('We wait for a condition that is never met, with a timeout and an onTimeout callback.')
  .and('The wait times out while the action is still in progress.')
  .when('The action finishes.')
  .then('The actions returned by the wait still contain the action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0)});
    const action = new SlowAction();
    store.dispatch(action);
    const {actions, triggerAction} = await store.waitActionCondition(
      (_actions) => false,
      {timeoutMillis: 10, onTimeout: () => {}},
    );
    expect(triggerAction).toBeNull();

    // When
    await store.waitAllActions([action], {timeoutMillis: 1000});

    // Then
    expect(store.actionsInProgress().size).toBe(0);
    expect(actions.size).toBe(1);
    expect(actions.has(action)).toBe(true);
  });

Bdd(feature)
  .scenario('The actions returned by waitAllActions don\'t change after the wait resolves.')
  .given('A slow action and a fast action are in progress.')
  .and('We wait for the fast action to finish.')
  .and('The wait resolves while the slow action is still in progress.')
  .when('The slow action finishes.')
  .then('The actions returned by the wait still contain the slow action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0)});
    const slowAction = new SlowAction();
    const fastAction = new FastAction();
    store.dispatch(slowAction);
    store.dispatch(fastAction);
    const {actions} = await store.waitAllActions([fastAction], {timeoutMillis: 1000});

    // When
    await store.waitAllActions([slowAction], {timeoutMillis: 1000});

    // Then
    expect(store.actionsInProgress().size).toBe(0);
    expect(actions.size).toBe(1);
    expect(actions.has(slowAction)).toBe(true);
    expect(actions.has(fastAction)).toBe(false);
  });
