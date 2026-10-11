import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('The actions in progress can\'t be modified');

class State {
  constructor(readonly count: number) {
  }
}

class Slow extends KissAction<State> {
  async reduce() {
    await delayMillis(30);
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('The set of actions in progress can\'t be modified through the set given by its forEach.')
  .given('An async action is in progress.')
  .when('We try to delete it from the actions in progress, through the set given by forEach.')
  .then('It throws an error.')
  .and('The action is still in progress.')
  .and('Waiting for the action still completes when it finishes.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger: () => {}});
    const action = new Slow();
    store.dispatch(action);

    // When / Then
    expect(() => store.actionsInProgress().forEach((x, _y, set) => set.delete(x)))
      .toThrow('Cannot modify the set');
    expect(store.isWaiting(Slow)).toBe(true);
    expect(store.actionsInProgress().has(action)).toBe(true);

    await store.waitAllActions([action], {timeoutMillis: 1000});
    expect(store.isWaiting(Slow)).toBe(false);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('The set given by forEach is the same unmodifiable set.')
  .given('An async action is in progress.')
  .when('We iterate the actions in progress with forEach.')
  .then('The set given to the callback is the set we called forEach on.')
  .and('The callback is called with the given `this`.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger: () => {}});
    const action = new Slow();
    store.dispatch(action);

    // When
    const actions = store.actionsInProgress();
    const thisArg = {};
    const calls: { value: unknown, value2: unknown, set: unknown, self: unknown }[] = [];
    actions.forEach(function (this: unknown, value, value2, set) {
      calls.push({value, value2, set, self: this});
    }, thisArg);

    // Then
    expect(calls.length).toBe(1);
    expect(calls[0].value).toBe(action);
    expect(calls[0].value2).toBe(action);
    expect(calls[0].set).toBe(actions);
    expect(calls[0].self).toBe(thisArg);

    await store.waitAllActions([action], {timeoutMillis: 1000});
  });
