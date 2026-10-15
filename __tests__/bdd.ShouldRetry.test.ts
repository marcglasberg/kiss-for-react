import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, OptimisticCommand, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Retry predicate (shouldRetry)');

// ----------------------------------------------------------------------------
// Plain `retry`

Bdd(feature)
  .scenario('By default, an action with retry retries every error, including a UserException.')
  .given('An action with retry on, that does not override "shouldRetry".')
  .and('Its reducer fails with a UserException twice, then succeeds.')
  .when('The action is dispatched.')
  .then('The reducer runs 3 times, and the action completes OK.')
  .note('This is the same as the Retry mixin of Async Redux, which retries every error.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const action = new LoadText({ errors: [new UserException('Failed'), new UserException('Failed')] });
    await dispatchWithFakeTimers(store, action);

    expect(action.reduceCount).toBe(2 + 1);
    expect(action.attempts).toBe(2);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('When "shouldRetry" returns false, the action fails right away with that error, without retrying.')
  .given('An action with retry on, and up to 3 retries.')
  .and('Its "shouldRetry" returns false for a NotFoundError.')
  .and('Its reducer always fails with a NotFoundError.')
  .when('The action is dispatched.')
  .then('The reducer runs only once, and there is no retry delay.')
  .and('The action fails with the NotFoundError.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const error = new NotFoundError();
    const action = new LoadText({ errors: [error, error, error, error], shouldRetry: (e) => !(e instanceof NotFoundError) });

    // With fake timers, the action can only finish without advancing the time if it never
    // waits for a retry delay.
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
    expect(action.attempts).toBe(1);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(store.state.text).toBe('');
  });

Bdd(feature)
  .scenario('"shouldRetry" gets the error and the attempt number, and the action retries while it returns true.')
  .given('An action with retry on, and up to 10 retries.')
  .and('Its reducer always fails, with a different error each time.')
  .and('Its "shouldRetry" returns true for the first 2 attempts, and false for the 3rd.')
  .when('The action is dispatched.')
  .then('"shouldRetry" is called 3 times, with the error of each failed attempt, and the attempt numbers 1, 2 and 3.')
  .and('The reducer runs 3 times, and the action fails with the error of the 3rd attempt.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const errors = [new Error('1'), new Error('2'), new Error('3'), new Error('4')];
    const action = new LoadText({
      retry: { on: true, initialDelay: 1, maxRetries: 10 },
      errors,
      shouldRetry: (_error, attempt) => attempt < 3,
    });
    await dispatchWithFakeTimers(store, action);

    expect(action.shouldRetryCalls).toEqual([[errors[0], 1], [errors[1], 2], [errors[2], 3]]);
    expect(action.reduceCount).toBe(3);
    expect(action.attempts).toBe(3);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(errors[2]);
  });

Bdd(feature)
  .scenario('"shouldRetry" is not called when the retries ran out.')
  .given('An action with retry on, and up to 2 retries.')
  .and('Its reducer always fails.')
  .and('Its "shouldRetry" always returns true.')
  .when('The action is dispatched.')
  .then('The reducer runs 3 times, and the action fails with the last error.')
  .and('"shouldRetry" is called only twice, for attempts 1 and 2, since after the 3rd failure the action fails anyway.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const errors = [new Error('1'), new Error('2'), new Error('3'), new Error('4')];
    const action = new LoadText({ retry: { on: true, initialDelay: 1, maxRetries: 2 }, errors, shouldRetry: () => true });
    await dispatchWithFakeTimers(store, action);

    expect(action.reduceCount).toBe(3);
    expect(action.attempts).toBe(3);
    expect(action.shouldRetryCalls.map(([, attempt]) => attempt)).toEqual([1, 2]);
    expect(action.status.originalError).toBe(errors[2]);
  });

Bdd(feature)
  .scenario('An aborted action is not retried, and "shouldRetry" is not called.')
  .given('An action with retry on, whose "shouldRetry" always returns true.')
  .and('Its reducer throws an AbortDispatchException.')
  .when('The action is dispatched.')
  .then('The reducer runs only once, and the action is aborted, not failed.')
  .and('"shouldRetry" is not called.')
  .run(async (_) => {
    // Note: an aborted action is silent, so the store needs no errorObserver here.
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText({ errors: [new AbortDispatchException('Aborted')], shouldRetry: () => true });
    await dispatchWithFakeTimers(store, action);

    expect(action.reduceCount).toBe(1);
    expect(action.attempts).toBe(0);
    expect(action.shouldRetryCalls).toEqual([]);
    expect(action.status.isDispatchAborted).toBe(true);
    expect(action.status.wrappedError).toBeNull();
  });

Bdd(feature)
  .scenario('If "shouldRetry" itself throws, the action fails with that error.')
  .given('An action with retry on, whose "shouldRetry" throws an error.')
  .and('Its reducer fails with a UserException.')
  .when('The action is dispatched.')
  .then('The reducer runs only once.')
  .and('The action fails with the error thrown by "shouldRetry", not with the UserException.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const predicateError = new Error('shouldRetry failed');
    const action = new LoadText({
      errors: [new UserException('Failed')],
      shouldRetry: () => { throw predicateError; },
    });
    await dispatchWithFakeTimers(store, action);

    expect(action.reduceCount).toBe(1);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(predicateError);
  });

// ----------------------------------------------------------------------------
// `unlimitedRetryCheckInternet`

Bdd(feature)
  .scenario('With unlimitedRetryCheckInternet, "shouldRetry" returning false stops the unlimited retries.')
  .given('An action with "unlimitedRetryCheckInternet = true", and there is internet.')
  .and('Its reducer fails with a UserException twice, then always fails with a NotFoundError.')
  .and('Its "shouldRetry" returns false for a NotFoundError.')
  .when('The action is dispatched.')
  .then('The UserExceptions are retried, but the NotFoundError is not.')
  .and('The reducer runs 3 times, and the action fails with the NotFoundError.')
  .note('Without "shouldRetry", the action would retry the NotFoundError forever.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const notFound = new NotFoundError();
    const action = new LoadTextUnlimited({
      errors: [new UserException('Failed'), new UserException('Failed'), notFound, notFound, notFound],
      shouldRetry: (e) => !(e instanceof NotFoundError),
    }, [true]);
    await dispatchWithFakeTimers(store, action);

    expect(action.reduceCount).toBe(3);
    expect(action.shouldRetryCalls.map(([, attempt]) => attempt)).toEqual([1, 2, 3]);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(notFound);
    expect(store.state.text).toBe('');
  });

Bdd(feature)
  .scenario('With unlimitedRetryCheckInternet, "shouldRetry" is not called while there is no internet.')
  .given('An action with "unlimitedRetryCheckInternet = true", whose "shouldRetry" always returns false.')
  .and('There is no internet for the first 3 checks, and then there is.')
  .and('Its reducer always succeeds.')
  .when('The action is dispatched.')
  .then('The action keeps waiting for the internet, since "shouldRetry" is not called for the no-internet case.')
  .and('When the internet comes back, the reducer runs, and the action completes OK.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const action = new LoadTextUnlimited({ errors: [], shouldRetry: () => false }, [false, false, false, true]);
    await dispatchWithFakeTimers(store, action);

    expect(action.checks).toBe(4);
    expect(action.shouldRetryCalls).toEqual([]);
    expect(action.reduceCount).toBe(1);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('With unlimitedRetryCheckInternet, the attempt number given to "shouldRetry" also counts the no-internet attempts.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet for the first 2 checks, and then there is.')
  .and('Its reducer fails once with a UserException, then succeeds.')
  .when('The action is dispatched.')
  .then('"shouldRetry" is called once, with attempt number 3: two attempts aborted for no internet, plus the one that failed.')
  .and('This is the same number as "action.attempts".')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(''), errorObserver: () => null });
    const error = new UserException('Failed');
    const action = new LoadTextUnlimited({ errors: [error], shouldRetry: () => true }, [false, false, true]);
    await dispatchWithFakeTimers(store, action);

    expect(action.shouldRetryCalls).toEqual([[error, 3]]);
    expect(action.attempts).toBe(3);
    expect(action.status.isCompletedOk).toBe(true);
  });

// ----------------------------------------------------------------------------
// `OptimisticCommand` with `retry`

Bdd(feature)
  .scenario('An optimistic command with retry retries every error by default, including a UserException.')
  .given('An optimistic command with retry on, that does not override "shouldRetry".')
  .and('Its server call fails with a UserException twice, then succeeds.')
  .when('The command is dispatched.')
  .then('The server call runs 3 times, the optimistic value stays, and the command completes OK.')
  .run(async (_) => {
    const changes: string[] = [];
    const store = new Store<State>({
      initialState: new State('old'), errorObserver: () => null,
      stateObserver: (_action: KissAction<State>, prevState: State, newState: State) => {
        if (prevState !== newState) changes.push(newState.text);
      },
    });
    const action = new SaveText({ errors: [new UserException('Failed'), new UserException('Failed')] });
    await dispatchWithFakeTimers(store, action);

    expect(action.sendCount).toBe(3);
    expect(action.attempts).toBe(2);
    expect(changes).toEqual(['new']);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('new');
  });

Bdd(feature)
  .scenario('An optimistic command with retry gives up right away when "shouldRetry" returns false: it rolls back and fails.')
  .given('An optimistic command with retry on, and up to 3 retries.')
  .and('Its "shouldRetry" returns false for a NotFoundError.')
  .and('Its server call always fails with a NotFoundError.')
  .when('The command is dispatched.')
  .then('The server call runs only once.')
  .and('The optimistic value is applied, and then rolled back.')
  .and('The command fails with the NotFoundError.')
  .run(async (_) => {
    const changes: string[] = [];
    const store = new Store<State>({
      initialState: new State('old'), errorObserver: () => null,
      stateObserver: (_action: KissAction<State>, prevState: State, newState: State) => {
        if (prevState !== newState) changes.push(newState.text);
      },
    });
    const error = new NotFoundError();
    const action = new SaveText({ errors: [error, error, error, error], shouldRetry: (e) => !(e instanceof NotFoundError) });
    await dispatchWithFakeTimers(store, action);

    expect(action.sendCount).toBe(1);
    expect(action.attempts).toBe(1);
    expect(action.shouldRetryCalls).toEqual([[error, 1]]);
    expect(changes).toEqual(['new', 'old']);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(store.state.text).toBe('old');
  });

Bdd(feature)
  .scenario('An optimistic command with retry calls "shouldRetry" with the error and the attempt number of each failed server call.')
  .given('An optimistic command with retry on, and up to 10 retries.')
  .and('Its server call always fails, with a different error each time.')
  .and('Its "shouldRetry" returns true for the first 2 attempts, and false for the 3rd.')
  .when('The command is dispatched.')
  .then('"shouldRetry" is called 3 times, with the error of each failed call, and the attempt numbers 1, 2 and 3.')
  .and('The server call runs 3 times, and the command fails with the error of the 3rd call.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('old'), errorObserver: () => null });
    const errors = [new Error('1'), new Error('2'), new Error('3'), new Error('4')];
    const action = new SaveText({
      retry: { on: true, initialDelay: 1, maxRetries: 10 },
      errors,
      shouldRetry: (_error, attempt) => attempt < 3,
    });
    await dispatchWithFakeTimers(store, action);

    expect(action.shouldRetryCalls).toEqual([[errors[0], 1], [errors[1], 2], [errors[2], 3]]);
    expect(action.sendCount).toBe(3);
    expect(action.status.originalError).toBe(errors[2]);
    expect(store.state.text).toBe('old');
  });

// ----------------------------------------------------------------------------

async function dispatchWithFakeTimers(store: Store<State>, action: KissAction<State>) {
  jest.useFakeTimers();
  try {
    const promise = store.dispatchAndWait(action);
    await jest.runAllTimersAsync();
    await promise;
  } finally {
    jest.useRealTimers();
  }
}

class State {
  constructor(readonly text: string) {}
}

/** An error that is permanent: retrying it would fail again. */
class NotFoundError extends Error {
  constructor() {
    super('Not found');
  }
}

type Opts = {
  /** The retry options. Default: `{ on: true, initialDelay: 1 }`. */
  retry?: KissAction<State>['retry'];
  /** The error of each attempt. After the last one, the attempts succeed. */
  errors: unknown[];
  /** The `shouldRetry` override. When not given, the default `shouldRetry` is used. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
};

/** Records the calls to `shouldRetry`, as `[error, attempt]` pairs. */
class LoadText extends KissAction<State> {
  reduceCount = 0;
  shouldRetryCalls: [unknown, number][] = [];

  constructor(readonly opts: Opts, useRetry: boolean = true) {
    super();
    if (useRetry) this.retry = opts.retry ?? { on: true, initialDelay: 1 };
  }

  protected shouldRetry(error: unknown, attempt: number): boolean {
    this.shouldRetryCalls.push([error, attempt]);
    return this.opts.shouldRetry ? this.opts.shouldRetry(error, attempt) : super.shouldRetry(error, attempt);
  }

  async reduce(): Promise<(state: State) => State> {
    const error = this.opts.errors[this.reduceCount++];
    if (error !== undefined) throw error;
    return (state: State) => new State(state.text + 'A');
  }
}

/** With `unlimitedRetryCheckInternet`. The `internet` list is the status of each check. After the last one, the last status is repeated. */
class LoadTextUnlimited extends LoadText {
  unlimitedRetryCheckInternet = true;
  checks = 0;

  constructor(opts: Opts, readonly internet: boolean[]) {
    super(opts, false);
  }

  protected hasInternet(): Promise<boolean> {
    const isOnline = this.internet[Math.min(this.checks++, this.internet.length - 1)];
    return Promise.resolve(isOnline);
  }
}

class SaveText extends OptimisticCommand<State, string> {
  sendCount = 0;
  shouldRetryCalls: [unknown, number][] = [];

  constructor(readonly opts: Opts) {
    super();
    this.retry = opts.retry ?? { on: true, initialDelay: 1 };
  }

  protected shouldRetry(error: unknown, attempt: number): boolean {
    this.shouldRetryCalls.push([error, attempt]);
    return this.opts.shouldRetry ? this.opts.shouldRetry(error, attempt) : super.shouldRetry(error, attempt);
  }

  optimisticValue() {
    return 'new';
  }

  getValueFromState(state: State) {
    return state.text;
  }

  applyValueToState(state: State, value: string) {
    return new State(value);
  }

  async sendCommandToServer(_value: string) {
    const error = this.opts.errors[this.sendCount++];
    if (error !== undefined) throw error;
  }
}
