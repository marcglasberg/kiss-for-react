import { expect, jest, test } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, StoreException, UserException } from '../src';
import { delayMillis } from "../src/utils";

reporter(new FeatureFileReporter());

const feature = new Feature('Retry action');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('A SYNC action with retry fails, because only ASYNC actions can retry.')
  .given('A SYNC action that retries up to 10 times.')
  .and('The action fails with a user exception the first 4 times.')
  .when('The action is dispatched.')
  .then('It is not retried.')
  .and('It does not change the state, and fails with a StoreException saying retry needs an ASYNC reducer.')
  .run(async (_) => {

    let errorInErrorObserver: any;

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
      errorObserver: (error: any) => {
        errorInErrorObserver = error;
        return false;
      },
    });

    expect(store.state.count).toBe(1);
    const action = new SyncActionThatRetriesAndSucceeds();
    await store.dispatchAndWait(action);
    expect(action.attempts).toBe(0);
    expect(action.trace).toBe('0');

    // Should fail because the action is SYNC.
    // Only ASYNC actions can retry.
    expect(store.state.count).toBe(1);
    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(action.status.originalError.message).toContain('uses retry, but its reducer is SYNC');

    // Waits for the exception to be caught by the errorObserver.
    await delayMillis(1);
    expect(errorInErrorObserver).toBeInstanceOf(StoreException);
  });

Bdd(feature)
  .scenario('A SYNC action with retry, whose reducer always throws, fails right away with a StoreException.')
  .given('A SYNC action that retries up to 3 times.')
  .and('Its reducer always throws an error.')
  .when('The action is dispatched.')
  .then('The reducer runs only once, with no retry delays.')
  .and('It fails with a StoreException saying retry needs an ASYNC reducer, not with the original error.')
  .run(async (_) => {

    const store = new Store<State>({initialState: new State(1), logger: logger, errorObserver: () => false});

    // With fake timers, the action can only finish without advancing the time if it never
    // waits for a retry delay.
    const action = new SyncActionThatRetriesAndAlwaysFails();
    jest.useFakeTimers();
    try {
      const promise = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(0);
      expect(action.status.isCompleted).toBe(true);
      await promise;
    } finally {
      jest.useRealTimers();
    }

    expect(action.reduceCount).toBe(1);
    expect(store.state.count).toBe(1);
    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(action.status.originalError.message).toContain('uses retry, but its reducer is SYNC');
  });

Bdd(feature)
  .scenario('A SYNC action with retry fails, even if its reducer does not change the state.')
  .given('A SYNC action with retry.')
  .and('Its reducer returns null, or the unchanged state.')
  .when('The action is dispatched.')
  .then('The reducer runs only once.')
  .and('It fails with a StoreException saying retry needs an ASYNC reducer.')
  .run(async (_) => {

    for (const result of ['null', 'unchanged state']) {
      const store = new Store<State>({initialState: new State(1), logger: logger, errorObserver: () => false});

      const action = new SyncActionWithRetryThatDoesNotChangeTheState(result === 'null');
      await store.dispatchAndWait(action);

      expect(action.reduceCount).toBe(1);
      expect(store.state.count).toBe(1);
      expect(action.status.isCompletedOk).toBe(false);
      expect(action.status.originalError).toBeInstanceOf(StoreException);
      expect(action.status.originalError.message).toContain('uses retry, but its reducer is SYNC');
    }
  });

Bdd(feature)
  .scenario('Action retries a few times and succeeds.')
  .given('An action that retries up to 10 times.')
  .and('The action fails with a user exception the first 4 times.')
  .when('The action is dispatched.')
  .then('It does change the state.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    const action = new AsyncActionThatRetriesAndSucceeds();
    await store.dispatchAndWait(action);
    expect(action.attempts).toBe(5);
    expect(action.trace).toBe('012345');
    expect(store.state.count).toBe(2);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('Action retries unlimited tries until it succeeds.')
  .given('An action marked with "UnlimitedRetries".')
  .and('The action fails with a user exception the first 6 times.')
  .when('The action is dispatched.')
  .then('It does change the state.')
  .note('Without the "UnlimitedRetries" it would fail because the default is 3 retries.')
  .run(async (_) => {
    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    const action = new ActionThatRetriesUnlimitedAndFails();
    await store.dispatchAndWait(action);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
    expect(action.attempts).toBe(7);
    expect(action.trace).toBe('01234567');
  });

Bdd(feature)
  .scenario('Action retries a few times and fails.')
  .given('An action that retries up to 3 times.')
  .and('The action fails with a user exception the first 4 times.')
  .when('The action is dispatched.')
  .then('It does NOT change the state.')
  .run(async (_) => {
    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    const action = new ActionThatRetriesAndFails();
    await store.dispatchAndWait(action);
    expect(store.state.count).toBe(1);
    expect(action.attempts).toBe(4);
    expect(action.trace).toBe('0123');
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('An action with retry succeeds the first time, without retrying.')
  .given('An ASYNC action that retries up to 10 times.')
  .when('The action is dispatched and succeeds the first time.')
  .then('It changes the state, with no retry attempts.')
  .and('It cannot be dispatched with dispatchSync, since it is ASYNC.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    const action = new ActionThatRetriesButSucceedsTheFirstTry();
    await store.dispatchAndWait(action);
    expect(action.attempts).toBe(0);
    expect(action.trace).toBe('0');
    expect(store.state.count).toBe(2);
    expect(action.status.isCompletedOk).toBe(true);

    // A new action of the same type can't be dispatched SYNC.
    expect(() => store.dispatchSync(new ActionThatRetriesButSucceedsTheFirstTry()))
      .toThrow("but the action's 'reduce' method returned a Promise");
  });

Bdd(feature)
  .scenario('When the "before" method fails, the action is not retried.')
  .given('An action with retry, whose "before" method throws an error.')
  .when('The action is dispatched.')
  .then('The reducer never runs, and there are no retry attempts.')
  .and('The action fails with the error from "before".')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1), logger: logger });
    const action = new ActionWithRetryWhoseBeforeFails();
    await store.dispatchAndWait(action);

    expect(action.beforeCount).toBe(1);
    expect(action.reduceCount).toBe(0);
    expect(action.attempts).toBe(0);
    expect(action.status.originalError).toBe(action.beforeError);
  });

Bdd(feature)
  .scenario('When all attempts fail, only the last error is processed and shown.')
  .given('An action that retries up to 2 times.')
  .and('Each attempt fails with a different UserException.')
  .when('The action is dispatched.')
  .then('The action fails with the error of the last attempt.')
  .and('The errors of the previous attempts are ignored.')
  .and('The wrapError method, the state-observer and the dialog see only the last error.')
  .run(async (_) => {
    const shown: UserException[] = [];
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1), logger: logger,
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
      stateObserver: (_action, _prevState, _newState, error) => observed.push(error),
    });

    const action = new ActionThatFailsWithADifferentErrorEachTime();
    await store.dispatchAndWait(action);

    expect(action.errors.length).toBe(3);
    const lastError = action.errors[2];
    expect(action.status.originalError).toBe(lastError);
    expect(action.wrapped).toEqual([lastError]);
    expect(observed).toEqual([lastError]);
    expect(shown).toEqual([lastError]);
  });

Bdd(feature)
  .scenario('A non-reentrant action with retry is not dispatched again while it waits to retry.')
  .given('A non-reentrant action with retry, that fails the first 2 times.')
  .when('The action is dispatched.')
  .and('The same action is dispatched again, while the first one waits to retry.')
  .then('The second dispatch is aborted.')
  .and('The first action retries and succeeds.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = new Store<State>({ initialState: new State(1), logger: logger });
    const first = new NonReentrantActionThatFailsTwice();
    const second = new NonReentrantActionThatFailsTwice();
    try {
      store.dispatch(first);

      // The first attempt fails, and the action waits to retry.
      await jest.advanceTimersByTimeAsync(0);
      expect(first.trace).toBe('0');

      store.dispatch(second);
      expect(second.status.isDispatched).toBe(false);

      await jest.runAllTimersAsync();
    } finally {
      jest.useRealTimers();
    }

    expect(first.trace).toBe('012');
    expect(first.status.isCompletedOk).toBe(true);
    expect(second.trace).toBe('');
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('After retrying, the reducer result is applied to the current state.')
  .given('An action with retry, that fails the first time, and then increments the count.')
  .when('The action is dispatched.')
  .and('While it waits to retry, another action changes the count to 10.')
  .then('The final count is 11.')
  .note('The state is not reverted to what it was when the action was dispatched.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1), logger: logger });

    const action = new ActionThatFailsOnceThenIncrements(
      () => store.dispatch(new SetCount(10)));
    await store.dispatchAndWait(action);

    expect(action.attempts).toBe(1);
    expect(store.state.count).toBe(11);
  });

class State {
  count: number;

  constructor(count: number) {
    this.count = count;
  }

  toString(): string {
    return `State(${this.count})`;
  }
}

class SyncActionThatRetriesAndSucceeds extends KissAction<State> {

  trace: string = '';

  retry = {
    initialDelay: 10,
    maxRetries: 10,
  }

  reduce() {
    this.trace += this.attempts.toString();
    if (this.attempts <= 4) throw new UserException(`Failed: ${this.attempts}`);
    return new State(this.state.count + 1);
  }
}

class SyncActionThatRetriesAndAlwaysFails extends KissAction<State> {

  reduceCount = 0;

  retry = {
    initialDelay: 300,
    maxRetries: 3,
  }

  reduce(): State {
    this.reduceCount++;
    throw new Error('sync boom');
  }
}

class SyncActionWithRetryThatDoesNotChangeTheState extends KissAction<State> {

  reduceCount = 0;

  retry = {
    initialDelay: 10,
    maxRetries: 3,
  }

  constructor(readonly returnsNull: boolean) {
    super();
  }

  reduce(): State | null {
    this.reduceCount++;
    return this.returnsNull ? null : this.state;
  }
}

class AsyncActionThatRetriesAndSucceeds extends KissAction<State> {

  trace: string = '';

  retry = {
    initialDelay: 10,
    maxRetries: 10,
  }

  async reduce() {
    this.trace += this.attempts.toString();
    if (this.attempts <= 4) throw new UserException(`Failed: ${this.attempts}`);
    return (state: State) => new State(state.count + 1);
  }
}

class ActionThatRetriesAndFails extends KissAction<State> {
  trace: string = '';

  retry = {initialDelay: 10}

  async reduce() {
    this.trace += this.attempts.toString();
    if (this.attempts <= 4) throw new UserException(`Failed: ${this.attempts}`);
    return () => new State(this.state.count + 1);
  }
}

class ActionThatRetriesButSucceedsTheFirstTry extends KissAction<State> {

  trace: string = '';

  retry = {
    initialDelay: 10,
    maxRetries: 10,
  }

  async reduce() {
    this.trace += this.attempts.toString();
    return () => new State(this.state.count + 1);
  }
}

class ActionWithRetryWhoseBeforeFails extends KissAction<State> {
  beforeCount = 0;
  reduceCount = 0;
  readonly beforeError = new UserException('Before failed');

  retry = { initialDelay: 10 };

  async before() {
    this.beforeCount++;
    throw this.beforeError;
  }

  async reduce() {
    this.reduceCount++;
    return (state: State) => new State(state.count + 1);
  }
}

class ActionThatFailsWithADifferentErrorEachTime extends KissAction<State> {
  errors: UserException[] = [];
  wrapped: any[] = [];

  retry = { initialDelay: 10, maxRetries: 2 };

  async reduce(): Promise<(state: State) => State> {
    const error = new UserException(`Failed: ${this.attempts}`);
    this.errors.push(error);
    throw error;
  }

  wrapError(error: any) {
    this.wrapped.push(error);
    return error;
  }
}

class NonReentrantActionThatFailsTwice extends KissAction<State> {
  trace = '';

  nonReentrant = true;
  retry = { initialDelay: 20 };

  async reduce() {
    this.trace += this.attempts.toString();
    if (this.attempts < 2) throw new UserException(`Failed: ${this.attempts}`);
    return (state: State) => new State(state.count + 1);
  }
}

class ActionThatFailsOnceThenIncrements extends KissAction<State> {

  retry = { initialDelay: 10 };

  constructor(readonly onFirstFailure: () => void) {
    super();
  }

  async reduce() {
    if (this.attempts === 0) {
      this.onFirstFailure();
      throw new UserException('Failed');
    }
    return (state: State) => new State(state.count + 1);
  }
}

class SetCount extends KissAction<State> {
  constructor(readonly count: number) {
    super();
  }

  reduce() {
    return new State(this.count);
  }
}

class ActionThatRetriesUnlimitedAndFails extends KissAction<State> {

  trace: string = '';

  retry = {
    initialDelay: 10,
    maxRetries: -1,
  }

  async reduce() {
    this.trace += this.attempts.toString();
    if (this.attempts <= 6) throw new UserException(`Failed: ${this.attempts}`);
    return () => new State(this.state.count + 1);
  }
}
