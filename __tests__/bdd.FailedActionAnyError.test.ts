import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

/**
 * `isFailed` must be true when the action failed with ANY error, not only with a
 * `UserException`. Only `exceptionFor` is limited to `UserException`, because that's the
 * error type it returns.
 */
const feature = new Feature('Failed action with any error');

Bdd(feature)
  .scenario('A SYNC action that fails with an error which is not a UserException.')
  .given('A SYNC action that throws a plain Error (not a UserException).')
  .when('The action is dispatched, and the error is caught.')
  .then('`isFailed` is true for the action type.')
  .and('`exceptionFor` is null, since the error is not a UserException.')
  .and('Dispatching the action again, and succeeding, clears the failed state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    expect(store.isFailed(SyncAction)).toBe(false);

    try {
      store.dispatch(new SyncAction(new Error('Plain error')));
    } catch (_) { /* The error is thrown by dispatch, as expected. */ }

    expect(store.isFailed(SyncAction)).toBe(true);
    expect(store.exceptionFor(SyncAction)).toBe(null);

    store.dispatch(new SyncAction(null));
    expect(store.isFailed(SyncAction)).toBe(false);
    expect(store.exceptionFor(SyncAction)).toBe(null);
  });

Bdd(feature)
  .scenario('An ASYNC action that fails with an error which is not a UserException.')
  .given('An ASYNC action that throws a plain Error (not a UserException).')
  .when('The action is dispatched with `dispatchAndWait`, and the rejection is caught.')
  .then('`isFailed` is true for the action type.')
  .and('`exceptionFor` is null, since the error is not a UserException.')
  .and('Dispatching the action again, and succeeding, clears the failed state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    expect(store.isFailed(AsyncAction)).toBe(false);

    await expect(store.dispatchAndWait(new AsyncAction(new Error('Plain error'))))
      .rejects.toThrow('Plain error');

    expect(store.isFailed(AsyncAction)).toBe(true);
    expect(store.exceptionFor(AsyncAction)).toBe(null);

    await store.dispatchAndWait(new AsyncAction(null));
    expect(store.isFailed(AsyncAction)).toBe(false);
    expect(store.exceptionFor(AsyncAction)).toBe(null);
  });

Bdd(feature)
  .scenario('`clearExceptionFor` clears an action that failed with a plain error.')
  .given('An action that failed with a plain Error (not a UserException).')
  .when('We call `clearExceptionFor` for its type.')
  .then('`isFailed` is false.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });

    try {
      store.dispatch(new SyncAction(new Error('Plain error')));
    } catch (_) { /* Expected. */ }
    expect(store.isFailed(SyncAction)).toBe(true);

    store.clearExceptionFor(SyncAction);
    expect(store.isFailed(SyncAction)).toBe(false);
  });

Bdd(feature)
  .scenario('Both errors are reported: first a plain error, then a UserException.')
  .given('An action that failed with a plain Error.')
  .when('The same action type is dispatched again, and fails with a UserException.')
  .then('`isFailed` is true, and `exceptionFor` returns the UserException.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });

    try {
      store.dispatch(new SyncAction(new Error('Plain error')));
    } catch (_) { /* Expected. */ }
    expect(store.isFailed(SyncAction)).toBe(true);
    expect(store.exceptionFor(SyncAction)).toBe(null);

    store.dispatch(new SyncAction(new UserException('User error')));
    expect(store.isFailed(SyncAction)).toBe(true);
    expect(store.exceptionFor(SyncAction)).toEqual(new UserException('User error'));
  });

Bdd(feature)
  .scenario('An action whose error is swallowed by `wrapError` did not fail.')
  .given('An action that throws, but its `wrapError` returns null (swallows the error).')
  .when('The action is dispatched.')
  .then('`isFailed` is false, since the error was swallowed.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });

    store.dispatch(new SyncActionThatSwallows());

    expect(store.isFailed(SyncActionThatSwallows)).toBe(false);
    expect(store.exceptionFor(SyncActionThatSwallows)).toBe(null);
  });

Bdd(feature)
  .scenario('An action aborted with `AbortDispatchException` did not fail.')
  .given('An action that throws `AbortDispatchException`.')
  .when('The action is dispatched.')
  .then('`isFailed` is false, since the action was aborted, not failed.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });

    store.dispatch(new SyncAction(new AbortDispatchException()));

    expect(store.isFailed(SyncAction)).toBe(false);
    expect(store.exceptionFor(SyncAction)).toBe(null);
  });

Bdd(feature)
  .scenario('Inside an action, `isFailed` sees a failure with a plain error.')
  .given('An action that failed with a plain Error (not a UserException).')
  .when('Another action calls `this.isFailed` for that type, in its reducer.')
  .then('It gets true.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });

    try {
      store.dispatch(new SyncAction(new Error('Plain error')));
    } catch (_) { /* Expected. */ }

    const checker = new CheckIfFailed(SyncAction);
    store.dispatch(checker);
    expect(checker.result).toBe(true);
  });

class State {
  constructor(readonly count: number) {}
}

/** Throws `error` if it's not null. */
class SyncAction extends KissAction<State> {
  constructor(readonly error: unknown) { super(); }

  reduce() {
    if (this.error !== null) throw this.error;
    return null;
  }
}

/** Throws `error` if it's not null. */
class AsyncAction extends KissAction<State> {
  constructor(readonly error: unknown) { super(); }

  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, 1));
    if (this.error !== null) throw this.error;
    return null;
  }
}

class SyncActionThatSwallows extends KissAction<State> {
  reduce(): null {
    throw new Error('Swallowed');
  }

  wrapError(_error: unknown): any {
    return null;
  }
}

class CheckIfFailed extends KissAction<State> {
  result: boolean | null = null;

  constructor(readonly type: { new(...args: any[]): KissAction<State> }) { super(); }

  reduce() {
    this.result = this.isFailed(this.type);
    return null;
  }
}
