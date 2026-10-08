import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Dispatch errors');

const logger = (_: string) => {};

class State {
  constructor(readonly count: number) {
  }
}

class SyncFails extends KissAction<State> {
  constructor(readonly error: any) {
    super();
  }

  reduce(): State {
    throw this.error;
  }
}

class AsyncFails extends KissAction<State> {
  constructor(readonly error: any) {
    super();
  }

  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw this.error;
    return (state: State) => state;
  }
}

class AsyncBeforeFails extends KissAction<State> {
  constructor(readonly error: any) {
    super();
  }

  async before() {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw this.error;
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

class AsyncIncrement extends KissAction<State> {
  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 30));
    return (state: State) => new State(state.count + 1);
  }
}

function createAction(kind: string, error: any): KissAction<State> {
  if (kind === 'sync') return new SyncFails(error);
  if (kind === 'async reduce') return new AsyncFails(error);
  return new AsyncBeforeFails(error);
}

Bdd(feature)
  .scenario('Waiting for an action that fails with an error that is not swallowed gives that error to the caller.')
  .given('An action that throws an error which is not a UserException.')
  .and('There is no errorObserver.')
  .when('The action is dispatched with dispatchAndWait, and awaited.')
  .then('The awaited call throws the error.')
  .and('The after method of the action still runs.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async reduce'))
  .example(val('Action', 'async before'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(1), logger});
    const error = new Error('Custom error');
    const action = createAction(ctx.example.val('Action'), error);

    // When
    let caught: any = null;
    try {
      await store.dispatchAndWait(action);
    } catch (e) {
      caught = e;
    }

    // Then
    expect(caught).toBe(error);
    expect(action.status.hasFinishedMethodAfter).toBe(true);
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('The promise of dispatchAndWait rejects with the error, so .catch() also receives it.')
  .given('An action that throws an error which is not a UserException.')
  .and('There is no errorObserver.')
  .when('The action is dispatched with dispatchAndWait, using .catch().')
  .then('The .catch() receives the error.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async reduce'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(1), logger});
    const error = new Error('Custom error');
    const action = createAction(ctx.example.val('Action'), error);

    // When
    const caught = await store.dispatchAndWait(action).then(() => null, (e) => e);

    // Then
    expect(caught).toBe(error);
  });

Bdd(feature)
  .scenario('Waiting for an action that fails with a UserException does not throw.')
  .given('An action that throws a UserException.')
  .and('There is no errorObserver.')
  .when('The action is dispatched with dispatchAndWait, and awaited.')
  .then('The awaited call does not throw, and returns the status with the error.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async reduce'))
  .example(val('Action', 'async before'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(1), logger});
    const error = new UserException('User error');
    const action = createAction(ctx.example.val('Action'), error);

    // When
    const status = await store.dispatchAndWait(action);

    // Then
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('The errorObserver decides if waiting for a failed action throws.')
  .given('An action that throws an error which is not a UserException.')
  .and('An errorObserver that returns true or false.')
  .when('The action is dispatched with dispatchAndWait, and awaited.')
  .then('The awaited call throws only if the errorObserver returned true.')
  .example(val('Action', 'sync'), val('Observer returns', true))
  .example(val('Action', 'sync'), val('Observer returns', false))
  .example(val('Action', 'async reduce'), val('Observer returns', true))
  .example(val('Action', 'async reduce'), val('Observer returns', false))
  .run(async (ctx) => {
    // Given
    const observerReturns: boolean = ctx.example.val('Observer returns');
    const store = new Store<State>({
      initialState: new State(1),
      logger,
      errorObserver: () => observerReturns,
    });
    const error = new Error('Custom error');
    const action = createAction(ctx.example.val('Action'), error);

    // When
    let caught: any = null;
    try {
      await store.dispatchAndWait(action);
    } catch (e) {
      caught = e;
    }

    // Then
    expect(caught).toBe(observerReturns ? error : null);
  });

Bdd(feature)
  .scenario('Dispatching a sync action that fails with an error that is not swallowed throws.')
  .given('A sync action that throws an error which is not a UserException.')
  .when('The action is dispatched with dispatch.')
  .then('The dispatch throws the error.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(1), logger});
    const error = new Error('Custom error');

    // When / Then
    expect(() => store.dispatch(new SyncFails(error))).toThrow(error);
  });

Bdd(feature)
  .scenario('Dispatching an action that fails with a UserException does not throw.')
  .given('An action that throws a UserException.')
  .when('The action is dispatched with dispatch.')
  .then('The dispatch does not throw.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async reduce'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(1), logger});
    const action = createAction(ctx.example.val('Action'), new UserException('User error'));

    // When
    expect(() => store.dispatch(action)).not.toThrow();
    await store.waitAllActions([], {completeImmediately: true});

    // Then
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('When one of the actions of dispatchAndWaitAll fails, all actions still run, and then it throws.')
  .given('A list of actions where one throws an error which is not a UserException.')
  .and('The others succeed.')
  .when('The actions are dispatched with dispatchAndWaitAll, and awaited.')
  .then('All actions are dispatched and finish.')
  .and('The awaited call throws the error, only after all of them finish.')
  .example(val('Failing action', 'sync'))
  .example(val('Failing action', 'async reduce'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const error = new Error('Custom error');
    const failing = createAction(ctx.example.val('Failing action'), error);
    const ok1 = new AsyncIncrement();
    const ok2 = new AsyncIncrement();

    // When
    let caught: any = null;
    try {
      await store.dispatchAndWaitAll([failing, ok1, ok2]);
    } catch (e) {
      caught = e;
    }

    // Then
    expect(caught).toBe(error);
    expect(ok1.status.isCompletedOk).toBe(true);
    expect(ok2.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });
