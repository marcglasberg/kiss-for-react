import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('The actions in progress the developer gets are copies');

class State {
  constructor(readonly count: number) {
  }
}

class Slow extends KissAction<State> {
  constructor(readonly millis: number) {
    super();
  }

  async reduce() {
    await delayMillis(this.millis);
    return (state: State) => new State(state.count + 1);
  }
}

function createStore() {
  return new Store<State>({initialState: new State(0), logger: () => {}});
}

Bdd(feature)
  .scenario('Getting the actions in progress gives a copy, not a live view.')
  .given('An async action is in progress.')
  .when('We get the actions in progress.')
  .and('Then another action is dispatched, and the first action finishes.')
  .then('The set we got still has the first action.')
  .and('It doesn\'t have the second action.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action1 = new Slow(10);
    store.dispatch(action1);

    // When
    const actions = store.actionsInProgress();
    const action2 = new Slow(100);
    store.dispatch(action2);
    await store.waitAllActions([action1], {timeoutMillis: 1000});
    expect(store.actionsInProgress().has(action1)).toBe(false);

    // Then
    expect(actions.size).toBe(1);
    expect(actions.has(action1)).toBe(true);
    expect(actions.has(action2)).toBe(false);

    await store.waitAllActions([action2], {timeoutMillis: 1000});
  });

Bdd(feature)
  .scenario('Getting the actions in progress twice gives two separate copies.')
  .given('An async action is in progress.')
  .when('We get the actions in progress twice.')
  .and('We change the first set we got.')
  .then('The two sets are different objects.')
  .and('The second set is not changed.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action = new Slow(30);
    store.dispatch(action);

    // When
    const actions1 = store.actionsInProgress();
    const actions2 = store.actionsInProgress();
    const other = new Slow(30);
    actions1.delete(action);
    actions1.add(other);

    // Then
    expect(actions1).not.toBe(actions2);
    expect(Array.from(actions1)).toEqual([other]);
    expect(Array.from(actions2)).toEqual([action]);

    await store.waitAllActions([action], {timeoutMillis: 1000});
  });

Bdd(feature)
  .scenario('Changing the actions in progress we got doesn\'t affect the store.')
  .given('An async action is in progress.')
  .when('We get the actions in progress, and change that set with <Change>.')
  .then('It doesn\'t throw an error.')
  .and('The action is still in progress in the store, and no other action is.')
  .and('Waiting for the action still completes when it finishes.')
  .example(val('Change', 'delete'))
  .example(val('Change', 'clear'))
  .example(val('Change', 'add'))
  .run(async (ctx) => {
    // Given
    const store = createStore();
    const action = new Slow(30);
    store.dispatch(action);

    // When
    const actions = store.actionsInProgress();
    const other = new Slow(30);
    const change = ctx.example.val('Change');
    const changeIt = () => {
      if (change === 'delete') actions.delete(action);
      else if (change === 'clear') actions.clear();
      else actions.add(other);
    };

    // Then
    expect(changeIt).not.toThrow();
    expect(store.isWaiting(Slow)).toBe(true);
    expect(Array.from(store.actionsInProgress())).toEqual([action]);

    await store.waitAllActions([action], {timeoutMillis: 1000});
    expect(store.isWaiting(Slow)).toBe(false);
    expect(store.actionsInProgress().size).toBe(0);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('The actions in progress are a real Set.')
  .given('Two async actions are in progress.')
  .when('We get the actions in progress.')
  .then('It is a Set, with all the Set methods.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action1 = new Slow(30);
    const action2 = new Slow(30);
    store.dispatch(action1);
    store.dispatch(action2);

    // When
    const actions: any = store.actionsInProgress();

    // Then
    expect(actions).toBeInstanceOf(Set);
    expect(Array.from(actions.union(new Set(['x'])))).toEqual([action1, action2, 'x']);
    expect(Array.from(actions.intersection(new Set([action2])))).toEqual([action2]);
    expect(Array.from(actions.difference(new Set([action2])))).toEqual([action1]);
    expect(actions.isSupersetOf(new Set([action1]))).toBe(true);

    await store.waitAllActions([action1, action2], {timeoutMillis: 1000});
  });

Bdd(feature)
  .scenario('The actions in progress can be printed for debugging.')
  .given('Two async actions are in progress.')
  .when('We turn the actions in progress into a string.')
  .then('We get the description of each action.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action1 = new Slow(30);
    const action2 = new Slow(40);
    store.dispatch(action1);
    store.dispatch(action2);

    // When
    const text = store.actionsInProgress().toString();

    // Then
    expect(text).toBe('Slow(millis:30),Slow(millis:40)');

    await store.waitAllActions([action1, action2], {timeoutMillis: 1000});
  });

Bdd(feature)
  .scenario('The condition of waitActionCondition gets a copy of the actions in progress.')
  .given('An async action is in progress.')
  .when('We wait for a condition that keeps the sets of actions it gets.')
  .and('The action finishes.')
  .then('The condition got a different set each time.')
  .and('The first set it got still has the action, because it\'s a copy, not a live view.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action = new Slow(30);
    store.dispatch(action);

    // When
    const received: Set<KissAction<State>>[] = [];
    const result = await store.waitActionCondition((actions) => {
      received.push(actions);
      return !actions.has(action);
    }, {timeoutMillis: 1000});

    // Then
    expect(result.triggerAction).toBe(action);
    expect(received.length).toBeGreaterThanOrEqual(2);
    expect(new Set(received).size).toBe(received.length);
    expect(received[0].has(action)).toBe(true);
    expect(received[received.length - 1].has(action)).toBe(false);
  });

Bdd(feature)
  .scenario('Changing the set the condition of waitActionCondition gets doesn\'t affect the store.')
  .given('An async action is in progress.')
  .when('We wait for a condition that clears the set of actions it gets.')
  .then('The wait doesn\'t fail.')
  .and('The action is still in progress in the store.')
  .and('The wait completes when the action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const action = new Slow(30);
    store.dispatch(action);

    // When
    const promise = store.waitActionCondition((actions) => {
      const isInProgress = actions.has(action);
      actions.clear();
      return !isInProgress;
    }, {timeoutMillis: 1000});

    // Then
    expect(store.isWaiting(Slow)).toBe(true);
    expect(store.actionsInProgress().has(action)).toBe(true);

    const result = await promise;
    expect(result.triggerAction).toBe(action);
    expect(store.isWaiting(Slow)).toBe(false);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Two waits that complete together get separate copies of the actions in progress.')
  .given('Two async actions are in progress, a fast one and a slow one.')
  .and('Two waits are waiting for the fast action to finish.')
  .when('The fast action finishes.')
  .and('We change the set of actions returned by the first wait.')
  .then('Both waits got a set with the slow action, but the sets are different objects.')
  .and('The set returned by the second wait is not changed.')
  .and('The slow action is still in progress in the store.')
  .and('Waiting for the slow action still completes when it finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const fast = new Slow(10);
    const slow = new Slow(80);
    store.dispatch(fast);
    store.dispatch(slow);
    const condition = (actions: Set<KissAction<State>>) => !actions.has(fast);
    const wait1 = store.waitActionCondition(condition, {timeoutMillis: 1000});
    const wait2 = store.waitActionCondition(condition, {timeoutMillis: 1000});

    // When
    const [result1, result2] = await Promise.all([wait1, wait2]);
    expect(() => result1.actions.delete(slow)).not.toThrow();

    // Then
    expect(result1.actions).not.toBe(result2.actions);
    expect(result1.actions.size).toBe(0);
    expect(Array.from(result2.actions)).toEqual([slow]);
    expect(store.actionsInProgress().has(slow)).toBe(true);

    await store.waitAllActions([slow], {timeoutMillis: 1000});
    expect(store.state.count).toBe(2);
  });
