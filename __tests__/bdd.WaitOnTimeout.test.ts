import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useDispatchWhen, useStore } from '../src';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

reporter(new FeatureFileReporter());

const feature = new Feature('Wait onTimeout');

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class SlowAction extends KissAction<State> {
  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 200));
    return null;
  }
}

class OtherAction extends KissAction<State> {
  reduce() {
    return null;
  }
}

function createStore(logs: string[] = []) {
  return new Store<State>({
    initialState: new State(0),
    logger: (obj: any) => logs.push(String(obj)),
    logStateChanges: false,
  });
}

const pendingWaitConditions = (store: Store<State>) => (store as any)._waitConditions.length;

const delay = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));

Bdd(feature)
  .scenario('With onTimeout, a state condition that times out calls onTimeout and resolves with null.')
  .given('We wait for a state condition, with a short timeout and an onTimeout callback.')
  .when('The timeout expires before the condition is met.')
  .then('onTimeout is called once.')
  .and('The wait resolves with null, instead of failing.')
  .and('The condition is no longer checked.')
  .run(async (_) => {
    const store = createStore();
    let calls = 0;

    const result = await store.waitCondition(
      state => state.count === 100,
      {timeoutMillis: 10, onTimeout: () => calls++});

    expect(calls).toBe(1);
    expect(result).toBeNull();
    expect(pendingWaitConditions(store)).toBe(0);
  });

Bdd(feature)
  .scenario('onTimeout is not called when the condition is met in time.')
  .given('We wait for a state condition, with a timeout and an onTimeout callback.')
  .when('The state changes so that the condition is met before the timeout.')
  .then('The wait resolves with the action that met the condition.')
  .and('onTimeout is never called.')
  .run(async (_) => {
    const store = createStore();
    let calls = 0;

    const promise = store.waitCondition(
      state => state.count === 1,
      {timeoutMillis: 30, onTimeout: () => calls++});
    store.dispatch(new Increment());

    expect(await promise).toBeInstanceOf(Increment);
    await delay(60);
    expect(calls).toBe(0);
  });

Bdd(feature)
  .scenario('If onTimeout throws, the wait fails with that error.')
  .given('We wait for a state condition, with an onTimeout callback that throws.')
  .when('The timeout expires.')
  .then('The wait fails with the error thrown by onTimeout.')
  .run(async (_) => {
    const store = createStore();

    const promise = store.waitCondition(
      state => state.count === 100,
      {timeoutMillis: 10, onTimeout: () => { throw new Error('Gave up'); }});

    await expect(promise).rejects.toThrow('Gave up');
  });

Bdd(feature)
  .scenario('With onTimeout, an action condition that times out calls onTimeout and resolves.')
  .given('We wait for an action condition, with a short timeout and an onTimeout callback.')
  .when('The timeout expires before the condition is met.')
  .then('onTimeout is called once.')
  .and('The wait resolves with no trigger action, instead of failing.')
  .run(async (_) => {
    const store = createStore();
    let calls = 0;

    const result = await store.waitActionCondition(
      actions => actions.size > 5,
      {timeoutMillis: 10, onTimeout: () => calls++});

    expect(calls).toBe(1);
    expect(result.triggerAction).toBeNull();
  });

Bdd(feature)
  .scenario('The other wait methods also accept onTimeout.')
  .given('An action that takes a long time is in progress.')
  .when('We wait for it with each wait method, with a short timeout and an onTimeout callback.')
  .then('Each wait calls its onTimeout, and resolves instead of failing.')
  .run(async (_) => {
    const store = createStore();
    const action = new SlowAction();
    store.dispatch(action);
    let calls = 0;
    const options = {timeoutMillis: 10, onTimeout: () => calls++};

    expect((await store.waitAllActions([action], options)).triggerAction).toBeNull();
    expect(await store.waitActionType(SlowAction, options)).toBeNull();
    await store.waitAllActionTypes([SlowAction], options);
    expect(await store.waitAnyActionTypeFinishes([OtherAction], options)).toBeNull();

    expect(calls).toBe(4);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('dispatchWhen dispatches the action when the condition is met.')
  .given('We call dispatchWhen with an action and a state condition.')
  .when('The state changes so that the condition is met.')
  .then('The action is dispatched.')
  .run(async (_) => {
    const store = createStore();

    store.dispatchWhen(new Increment(), state => state.count === 1, {timeoutMillis: 1000});
    store.dispatch(new Increment());
    await delay(0);

    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('dispatchWhen does not fail with an unhandled error when it times out.')
  .given('We call dispatchWhen with a short timeout, and no onTimeout callback.')
  .when('The timeout expires before the condition is met.')
  .then('The action is not dispatched.')
  .and('There is no unhandled promise rejection.')
  .and('The timeout is logged.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = createStore(logs);
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', listener);

    try {
      store.dispatchWhen(new Increment(), state => state.count === 100, {timeoutMillis: 10});
      await delay(50);
    } finally {
      process.off('unhandledRejection', listener);
    }

    expect(store.state.count).toBe(0);
    expect(unhandled).toEqual([]);
    expect(logs.some(log => log.includes('dispatchWhen'))).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchWhen calls onTimeout when it times out.')
  .given('We call dispatchWhen with a short timeout and an onTimeout callback.')
  .when('The timeout expires before the condition is met.')
  .then('onTimeout is called once.')
  .and('The action is not dispatched.')
  .run(async (_) => {
    const store = createStore();
    let calls = 0;

    store.dispatchWhen(new Increment(), state => state.count === 100,
      {timeoutMillis: 10, onTimeout: () => calls++});
    await delay(50);

    expect(calls).toBe(1);
    expect(store.state.count).toBe(0);
  });

class IncrementWhenCountIs3 extends KissAction<State> {
  reduce() {
    this.dispatchWhen(new Increment(), state => state.count === 3, {timeoutMillis: 1000});
    return null;
  }
}

Bdd(feature)
  .scenario('An action can use dispatchWhen.')
  .given('An action calls this.dispatchWhen, to increment the count when it reaches 3.')
  .when('The count reaches 3.')
  .then('The action given to dispatchWhen is dispatched.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new IncrementWhenCountIs3());

    store.dispatch(new Increment());
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    await delay(0);

    expect(store.state.count).toBe(4);
  });

Bdd(feature)
  .scenario('A component can use dispatchWhen, with useDispatchWhen or useStore.')
  .given('A component gets dispatchWhen from a hook.')
  .and('It calls it to increment the count when it reaches 1.')
  .when('The count reaches 1.')
  .then('The action given to dispatchWhen is dispatched.')
  .example(val('Hook', 'useDispatchWhen'))
  .example(val('Hook', 'useStore'))
  .run(async (ctx) => {
    const store = createStore();
    let dispatchWhen: (action: KissAction<State>, condition: (state: State) => boolean, options: { timeoutMillis: number }) => void = () => {};

    const Comp: React.FC = () => {
      const fromDispatchWhen = useDispatchWhen();
      const fromStore = useStore();
      dispatchWhen = (ctx.example.val('Hook') === 'useDispatchWhen')
        ? fromDispatchWhen
        : fromStore.dispatchWhen.bind(fromStore);
      return null;
    };
    act(() => {
      TestRenderer.create(React.createElement(StoreProvider<State>, {store, children: React.createElement(Comp)}));
    });

    dispatchWhen(new Increment(), state => state.count === 1, {timeoutMillis: 1000});
    store.dispatch(new Increment());
    await delay(0);

    expect(store.state.count).toBe(2);
  });
