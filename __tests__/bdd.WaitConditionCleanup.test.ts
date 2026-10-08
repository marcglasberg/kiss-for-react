import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, TimeoutException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait condition cleanup');

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
    await new Promise(resolve => setTimeout(resolve, 10));
    return null;
  }
}

function createStore() {
  return new Store<State>({initialState: new State(0), logger: () => {}, logStateChanges: false});
}

const pendingWaitConditions = (store: Store<State>) => (store as any)._waitConditions.length;
const pendingWaitActionConditions = (store: Store<State>) => (store as any)._waitActionConditions.length;

afterEach(() => {
  jest.useRealTimers();
});

Bdd(feature)
  .scenario('The timeout timer of a state condition is cleared when the condition is met.')
  .given('We wait for a state condition, with a timeout.')
  .when('The state changes so that the condition is met.')
  .then('The wait resolves.')
  .and('No timer is left running.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = createStore();
    const promise = store.waitCondition(state => state.count === 1, {timeoutMillis: 60_000});
    expect(jest.getTimerCount()).toBe(1);

    store.dispatch(new Increment());

    await expect(promise).resolves.toBeInstanceOf(Increment);
    expect(jest.getTimerCount()).toBe(0);
  });

Bdd(feature)
  .scenario('A state condition is removed when its timeout expires.')
  .given('We wait for a state condition, with a short timeout.')
  .when('The timeout expires before the condition is met.')
  .then('The wait fails with a timeout.')
  .and('The condition is no longer checked on later state changes.')
  .run(async (_) => {
    const store = createStore();
    const promise = store.waitCondition(state => state.count === 100, {timeoutMillis: 10});

    await expect(promise).rejects.toThrow('Timeout exceeded: 10 milliseconds.');
    expect(pendingWaitConditions(store)).toBe(0);
  });

Bdd(feature)
  .scenario('The timeout timer of an action condition is cleared when the condition is met.')
  .given('We wait for an action condition, with a timeout.')
  .when('An action is dispatched so that the condition is met.')
  .then('The wait resolves.')
  .and('No timer is left running for the wait.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = createStore();
    const promise = store.waitActionCondition(actions => actions.size > 0, {timeoutMillis: 60_000});
    expect(jest.getTimerCount()).toBe(1);

    store.dispatch(new SlowAction());
    await expect(promise).resolves.toBeDefined();

    // Only the timer inside SlowAction is left.
    expect(jest.getTimerCount()).toBe(1);
    await jest.runAllTimersAsync();
  });

Bdd(feature)
  .scenario('An action condition is removed when its timeout expires.')
  .given('We wait for an action condition, with a short timeout.')
  .when('The timeout expires before the condition is met.')
  .then('The wait fails with a timeout.')
  .and('The condition is no longer checked on later dispatches.')
  .run(async (_) => {
    const store = createStore();
    const promise = store.waitActionCondition(actions => actions.size > 5, {timeoutMillis: 10});

    await expect(promise).rejects.toThrow('Timeout exceeded: 10 milliseconds.');
    expect(pendingWaitActionConditions(store)).toBe(0);
  });

Bdd(feature)
  .scenario('A state condition with the timeout disabled starts no timer.')
  .given('We wait for a state condition, with timeout 0.')
  .when('The state changes so that the condition is met.')
  .then('No timer was ever started, and the wait resolves.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = createStore();
    const promise = store.waitCondition(state => state.count === 1, {timeoutMillis: 0});
    expect(jest.getTimerCount()).toBe(0);

    store.dispatch(new Increment());

    await expect(promise).resolves.toBeInstanceOf(Increment);
    expect(pendingWaitConditions(store)).toBe(0);
  });

Bdd(feature)
  .scenario('A state condition times out with a TimeoutException.')
  .given('We wait for a state condition, with a short timeout.')
  .when('The timeout expires before the condition is met.')
  .then('The error is a TimeoutException, which the caller can catch.')
  .run(async (_) => {
    const store = createStore();

    let caught: unknown = null;
    try {
      await store.waitCondition(state => state.count === 100, {timeoutMillis: 10});
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(TimeoutException);
  });
