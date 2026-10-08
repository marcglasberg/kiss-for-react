import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait action condition on dispatch');

class State {
  constructor(readonly count: number) {
  }
}

class SlowAsyncAction extends KissAction<State> {
  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(state.count + 1);
  }
}

class OtherSlowAsyncAction extends KissAction<State> {
  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(state.count + 10);
  }
}

class SyncAction extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

Bdd(feature)
  .scenario('The condition is checked when an async action is dispatched.')
  .given('No actions are in progress.')
  .and('We wait for the condition "some action is in progress".')
  .when('An async action is dispatched.')
  .then('The wait resolves while the action is still in progress.')
  .and('The trigger action is the dispatched action.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    const promise = store.waitActionCondition(
      (actions) => actions.size > 0,
      {timeoutMillis: 1000},
    );

    const action = new SlowAsyncAction();
    store.dispatch(action);

    const {actions, triggerAction} = await promise;
    expect(triggerAction).toBe(action);
    expect(actions.has(action)).toBe(true);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('The condition is checked when a sync action is dispatched.')
  .given('No actions are in progress.')
  .and('We wait for the condition "a sync action is in progress".')
  .when('A sync action is dispatched.')
  .then('The wait resolves, with the sync action as the trigger action.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    const promise = store.waitActionCondition(
      (actions) => Array.from(actions).some(a => a instanceof SyncAction),
      {timeoutMillis: 1000},
    );

    const action = new SyncAction();
    store.dispatch(action);

    const {triggerAction} = await promise;
    expect(triggerAction).toBe(action);
  });

Bdd(feature)
  .scenario('The condition is checked again when a second action is dispatched.')
  .given('An async action is in progress.')
  .and('We wait for the condition "two actions are in progress".')
  .when('Another async action is dispatched.')
  .then('The wait resolves, with the second action as the trigger action.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});
    store.dispatch(new SlowAsyncAction());

    const promise = store.waitActionCondition(
      (actions) => actions.size === 2,
      {timeoutMillis: 1000},
    );

    const action = new OtherSlowAsyncAction();
    store.dispatch(action);

    const {actions, triggerAction} = await promise;
    expect(triggerAction).toBe(action);
    expect(actions.size).toBe(2);
  });

Bdd(feature)
  .scenario('Waiting for an action type to finish still ignores its dispatch.')
  .given('We wait for any action of a given type to finish.')
  .when('An action of that type is dispatched.')
  .then('The wait only resolves after the action finishes.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(0)});

    const promise = store.waitAnyActionTypeFinishes([SlowAsyncAction], {timeoutMillis: 1000});

    const action = new SlowAsyncAction();
    store.dispatch(action);

    const triggerAction = await promise;
    expect(triggerAction).toBe(action);
    expect(store.state.count).toBe(1);
  });
