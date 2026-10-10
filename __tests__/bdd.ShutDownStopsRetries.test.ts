import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Shutting down the store stops retries');

Bdd(feature)
  .scenario('Shutting down the store aborts an action that is waiting to retry.')
  .given('An action that keeps retrying, with {Feature}.')
  .and('It is waiting to retry, because {Reason}.')
  .when('The store is shut down.')
  .then('The action stops retrying right away, without waiting for the retry delay.')
  .and('It is aborted: it does not count as failed, and its dispatchAndWait resolves.')
  .and('It is no longer in progress.')
  .example(val('Feature', 'retry = { maxRetries: -1 }'), val('Reason', 'it failed'))
  .example(val('Feature', 'unlimitedRetryCheckInternet = true'), val('Reason', 'it failed'))
  .example(val('Feature', 'unlimitedRetryCheckInternet = true'), val('Reason', 'there is no internet'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0) });
      store.isFailed(LoadValue); // So that the store keeps track of this failed action.
      const action = createAction(ctx.example.val('Feature'), ctx.example.val('Reason'));
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(10000);
      const attempts = action.attempts;
      expect(attempts).toBeGreaterThan(1);
      expect(store.isWaiting(LoadValue)).toBe(true);

      store.setShutDown(true);
      const status = await promise;

      expect(status.isDispatchAborted).toBe(true);
      expect(store.isFailed(LoadValue)).toBe(false);
      expect(store.isWaiting(LoadValue)).toBe(false);

      // It doesn't run again.
      const runs = action.runs;
      await jest.advanceTimersByTimeAsync(60000);
      expect(action.runs).toBe(runs);
      expect(action.attempts).toBe(attempts);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('An attempt that is running when the store is shut down is not retried if it fails.')
  .given('An action with "retry = { maxRetries: -1 }", that fails after 1000 millis.')
  .and('It is running an attempt.')
  .when('The store is shut down, and then the attempt fails.')
  .then('The action is aborted, without retrying.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0) });
      const action = new LoadValue({ failures: Infinity, reduceMillis: 1000 });
      action.retry = { maxRetries: -1 };
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(500);
      expect(action.runs).toBe(1);

      store.setShutDown(true);
      await jest.advanceTimersByTimeAsync(500);
      const status = await promise;

      expect(status.isDispatchAborted).toBe(true);
      expect(action.runs).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('An attempt that is running when the store is shut down still changes the state if it succeeds.')
  .given('An action with "retry = { maxRetries: -1 }", that takes 1000 millis to succeed.')
  .and('It is running an attempt.')
  .when('The store is shut down, and then the attempt succeeds.')
  .then('The action completes normally, and changes the state.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0) });
      const action = new LoadValue({ failures: 0, reduceMillis: 1000 });
      action.retry = { maxRetries: -1 };
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(500);
      store.setShutDown(true);
      await jest.advanceTimersByTimeAsync(500);
      const status = await promise;

      expect(status.isCompletedOk).toBe(true);
      expect(store.state.value).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Turning the store back on does not resume the stopped retries.')
  .given('An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.')
  .when('The store is shut down, and right away turned back on.')
  .then('The action is still aborted, and does not retry anymore.')
  .and('New actions can be dispatched, and retry as usual.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0) });
      const env = { internet: false };
      const action = new LoadValue({ failures: 0, env });
      action.unlimitedRetryCheckInternet = true;
      const promise = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(3000);

      store.setShutDown(true);
      store.setShutDown(false);
      const status = await promise;
      expect(status.isDispatchAborted).toBe(true);

      const newAction = new LoadValue({ failures: 0, env });
      newAction.unlimitedRetryCheckInternet = true;
      const newPromise = store.dispatchAndWait(newAction);
      await jest.advanceTimersByTimeAsync(3000);
      expect(newAction.attempts).toBeGreaterThan(1);

      env.internet = true;
      await jest.advanceTimersByTimeAsync(1000);
      expect((await newPromise).isCompletedOk).toBe(true);
      expect(action.runs).toBe(0);
      expect(store.state.value).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('An action with limited retries that fails after the store is shut down is aborted.')
  .given('An action with "retry = { maxRetries: 3 }", that always fails.')
  .and('It is waiting to retry.')
  .when('The store is shut down.')
  .then('The action is aborted, instead of failing with its error.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0) });
      const action = new LoadValue({ failures: Infinity });
      action.retry = { maxRetries: 3 };
      const promise = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(100);
      expect(action.runs).toBe(1);

      store.setShutDown(true);
      const status = await promise;

      expect(status.isDispatchAborted).toBe(true);
      expect(action.runs).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

function createAction(feature: string, reason: string): LoadValue {
  const noInternet = reason === 'there is no internet';
  const action = new LoadValue({
    failures: noInternet ? 0 : Infinity,
    env: { internet: !noInternet },
  });
  if (feature.startsWith('retry')) action.retry = { maxRetries: -1 };
  else action.unlimitedRetryCheckInternet = true;
  return action;
}

class State {
  constructor(readonly value: number) {}
}

class LoadValue extends KissAction<State> {
  /** How many times the reducer ran. */
  runs = 0;

  readonly failures: number;
  readonly reduceMillis: number;
  readonly env: { internet: boolean };

  constructor({ failures, reduceMillis = 0, env = { internet: true } }: {
    failures: number,
    reduceMillis?: number,
    env?: { internet: boolean },
  }) {
    super();
    this.failures = failures;
    this.reduceMillis = reduceMillis;
    this.env = env;
  }

  protected hasInternet(): Promise<boolean> {
    return Promise.resolve(this.env.internet);
  }

  async reduce(): Promise<(state: State) => State> {
    this.runs++;
    if (this.reduceMillis > 0) await new Promise(resolve => setTimeout(resolve, this.reduceMillis));
    if (this.runs <= this.failures) throw new UserException('Failed');
    return (state: State) => new State(state.value + 1);
  }
}
