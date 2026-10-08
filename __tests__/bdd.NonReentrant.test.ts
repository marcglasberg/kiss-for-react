import { expect, test } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from "../src/utils";

reporter(new FeatureFileReporter());

const feature = new Feature('Non reentrant actions');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('Sync action non-reentrant does not call itself.')
  .given('A SYNC action that calls itself.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    store.dispatch(new NonReentrantSyncActionCallsItself());
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('Async action non-reentrant does not call itself.')
  .given('An ASYNC action that calls itself.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    store.dispatch(new NonReentrantAsyncActionCallsItself());
    expect(store.state.count).toBe(2);
  });


Bdd(feature)
  .scenario('Async action non-reentrant does start before an action of the same type finished.')
  .given('An ASYNC action takes some time to finish.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .and('Another action of the same type is dispatched before the previous one finished.')
  .then('It runs only once.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    // We start with count 1.
    expect(store.state.count).toBe(1);
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(false);

    // We dispatch an action that will wait for 100 millis and increment 10.
    store.dispatch(new NonReentrantAsyncAction(10, 100));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    // So far, we still have count 1.
    expect(store.state.count).toBe(1);

    // We wait a little bit and dispatch ANOTHER action that will wait for 10 millis and increment 50.
    await delayMillis(10);
    store.dispatch(new NonReentrantAsyncAction(50, 10));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    // We wait for all actions to finish dispatching.
    await store.waitAllActions([]);
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(false);

    // The only action that ran was the first one, which incremented by 10 (1+10 = 11).
    // The second action was aborted.
    expect(store.state.count).toBe(11);
  });

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

class NonReentrantSyncActionCallsItself extends KissAction<State> {

  nonReentrant = true;

  reduce() {
    this.dispatch(new NonReentrantSyncActionCallsItself());
    return new State(this.state.count + 1);
  }
}

class NonReentrantAsyncActionCallsItself extends KissAction<State> {

  nonReentrant = true;

  async reduce() {
    this.dispatch(new NonReentrantSyncActionCallsItself());
    return (state: State) => new State(state.count + 1);
  }
}

class NonReentrantAsyncAction extends KissAction<State> {

  constructor(
    public increment: number,
    public delayMillis: number,
  ) {
    super();
  }

  nonReentrant = true;

  async reduce() {
    await delayMillis(this.delayMillis);
    return (state: State) => new State(state.count + this.increment);
  }
}

Bdd(feature)
  .scenario('dispatchAndWait does not start a non-reentrant action while one of the same type is running.')
  .given('An ASYNC action takes some time to finish.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .and('Two other actions of the same type are dispatched with dispatchAndWait before the first one finished.')
  .then('The reducer runs only once.')
  .and('The dispatchAndWait calls resolve, with a status saying the action was not dispatched.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    store.dispatch(new NonReentrantAsyncAction(10, 100));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    const status1 = await store.dispatchAndWait(new NonReentrantAsyncAction(50, 10));
    const status2 = await store.dispatchAndWait(new NonReentrantAsyncAction(500, 10));
    expect(status1.isDispatched).toBe(false);
    expect(status2.isDispatched).toBe(false);

    await store.waitAllActions([]);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('dispatchSync does not start a non-reentrant action while one of the same type is running.')
  .given('A SYNC action that calls itself with dispatchSync.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched with dispatchSync.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    store.dispatchSync(new NonReentrantSyncActionCallsItselfWithDispatchSync());
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('An action calling dispatchAndWait on itself does not start a non-reentrant action twice.')
  .given('An ASYNC action that calls itself with dispatchAndWait.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('It finishes, instead of waiting for itself forever.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    const status = await store.dispatchAndWait(new NonReentrantAsyncActionCallsItselfWithDispatchAndWait());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });

class NonReentrantSyncActionCallsItselfWithDispatchSync extends KissAction<State> {

  nonReentrant = true;

  reduce() {
    this.dispatchSync(new NonReentrantSyncActionCallsItselfWithDispatchSync());
    return new State(this.state.count + 1);
  }
}

class NonReentrantAsyncActionCallsItselfWithDispatchAndWait extends KissAction<State> {

  nonReentrant = true;

  async reduce() {
    await this.dispatchAndWait(new NonReentrantAsyncActionCallsItselfWithDispatchAndWait());
    return (state: State) => new State(state.count + 1);
  }
}

