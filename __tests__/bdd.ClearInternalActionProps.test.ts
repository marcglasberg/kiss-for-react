import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Poll, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Clear internal action props');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action that adds `value` to the count, and keeps its data fresh for 5 seconds.
class LoadFresh extends KissAction<State> {
  fresh = 5000;

  constructor(readonly value: number, readonly trace: string[]) { super(); }

  reduce() {
    this.trace.push(`load ${this.value}`);
    return new State(this.state.count + this.value);
  }
}

// Clears the internal action props, and resets the count, like a logout would.
class Logout extends KissAction<State> {
  reduce() {
    this.store.clearInternalActionProps();
    return new State(0);
  }
}

Bdd(feature)
  .scenario('After clearing the internal action props, fresh actions run again.')
  .given('An action with fresh, that was dispatched, and whose data is still fresh.')
  .when('A logout action calls clearInternalActionProps.')
  .and('The action with fresh is dispatched again.')
  .then('It runs again, even though its fresh period has not ended.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new LoadFresh(1, log));
    store.dispatch(new LoadFresh(10, log)); // Aborted, since it's still fresh.
    expect(log).toEqual(['load 1']);

    store.dispatch(new Logout());
    expect(store.state.count).toBe(0);

    store.dispatch(new LoadFresh(100, log));
    expect(log).toEqual(['load 1', 'load 100']);
    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('After clearing the internal action props, throttled actions run again.')
  .given('An action with throttle, that was dispatched, and whose throttle period has not ended.')
  .when('clearInternalActionProps is called.')
  .and('The action with throttle is dispatched again.')
  .then('It runs again.')
  .run(async (_) => {
    class LoadThrottled extends KissAction<State> {
      throttle = 5000;

      constructor(readonly trace: string[]) { super(); }

      reduce() {
        this.trace.push('load');
        return null;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new LoadThrottled(log));
    store.dispatch(new LoadThrottled(log)); // Aborted, since it's throttled.
    expect(log).toEqual(['load']);

    store.clearInternalActionProps();

    store.dispatch(new LoadThrottled(log));
    expect(log).toEqual(['load', 'load']);
  });

Bdd(feature)
  .scenario('Clearing the internal action props stops the debounced actions that are waiting.')
  .given('An action with debounce, that was dispatched, and is waiting for its debounce period.')
  .when('clearInternalActionProps is called.')
  .then('The action finishes right away, without running its reducer.')
  .and('It does not fail.')
  .run(async (_) => {
    class SearchText extends KissAction<State> {
      debounce = 5000;

      constructor(readonly trace: string[]) { super(); }

      reduce() {
        this.trace.push('search');
        return new State(this.state.count + 1);
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const promise = store.dispatchAndWait(new SearchText(log));
    await delayMillis(10);
    expect(store.isWaiting(SearchText)).toBe(true);

    store.clearInternalActionProps();

    const status = await promise;
    expect(status.isCompletedOk).toBe(true);
    expect(store.isWaiting(SearchText)).toBe(false);
    expect(log).toEqual([]);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Clearing the internal action props stops all polling.')
  .given('An action that is polling.')
  .when('clearInternalActionProps is called.')
  .then('No more polling ticks are dispatched.')
  .run(async (_) => {
    class Count extends KissAction<State> {
      pollInterval = 30;

      constructor(readonly poll = Poll.once) { super(); }

      createPollingAction() { return new Count(); }

      reduce() {
        return new State(this.state.count + 1);
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Count(Poll.start));
    await delayMillis(100);
    expect(store.state.count).toBeGreaterThan(1);

    store.clearInternalActionProps();
    const count = store.state.count;

    await delayMillis(100);
    expect(store.state.count).toBe(count);
  });

Bdd(feature)
  .scenario('Clearing the internal action props discards the actions waiting in sequential queues.')
  .given('A sequential action that is running, and two sequential actions waiting behind it.')
  .when('clearInternalActionProps is called.')
  .then('The waiting actions are discarded, without running.')
  .and('The running action keeps running, and changes the state when it finishes.')
  .and('A sequential action dispatched after that runs right away, without waiting for the running action.')
  .run(async (_) => {
    class Add extends KissAction<State> {
      sequential = true;

      constructor(readonly value: number, readonly trace: string[], readonly millis = 10) { super(); }

      async reduce() {
        this.trace.push(`start ${this.value}`);
        await delayMillis(this.millis);
        this.trace.push(`end ${this.value}`);
        return (state: State) => new State(state.count + this.value);
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const running = new Add(1, log, 100);
    const waiting1 = new Add(10, log);
    const waiting2 = new Add(100, log);
    store.dispatch(running);
    const promise1 = store.dispatchAndWait(waiting1);
    const promise2 = store.dispatchAndWait(waiting2);

    store.clearInternalActionProps();

    const status1 = await promise1;
    const status2 = await promise2;
    expect(status1.isDispatchAborted).toBe(true);
    expect(status2.isDispatchAborted).toBe(true);
    expect(waiting1.wasDiscardedFromSequentialQueue).toBe(true);
    expect(waiting2.wasDiscardedFromSequentialQueue).toBe(true);

    // Dispatched after clearing, so it doesn't wait for the running action.
    await store.dispatchAndWait(new Add(1000, log));
    expect(running.status.isCompletedOk).toBe(false);

    await store.waitAllActions([]);
    expect(running.status.isCompletedOk).toBe(true);
    expect(log).toEqual(['start 1', 'start 1000', 'end 1000', 'end 1']);
    expect(store.state.count).toBe(1001);
  });

Bdd(feature)
  .scenario('Clearing the internal action props does not affect running nonReentrant actions.')
  .given('A nonReentrant action that is running.')
  .when('clearInternalActionProps is called.')
  .and('The same action is dispatched again, while the first is still running.')
  .then('The second dispatch is still aborted.')
  .run(async (_) => {
    class Save extends KissAction<State> {
      nonReentrant = true;

      constructor(readonly trace: string[]) { super(); }

      async reduce() {
        this.trace.push('save');
        await delayMillis(50);
        return null;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Save(log));
    store.clearInternalActionProps();
    store.dispatch(new Save(log));

    await store.waitAllActions([]);
    expect(log).toEqual(['save']);
  });

Bdd(feature)
  .scenario('Shutting down the store clears the internal action props.')
  .given('An action with fresh, that was dispatched, and whose data is still fresh.')
  .when('The store is shut down, and then turned back on.')
  .and('The action with fresh is dispatched again.')
  .then('It runs again, even though its fresh period has not ended.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new LoadFresh(1, log));

    store.setShutDown(true);
    store.setShutDown(false);

    store.dispatch(new LoadFresh(10, log));
    expect(log).toEqual(['load 1', 'load 10']);
  });

Bdd(feature)
  .scenario('Clearing the internal action props aborts an action that is waiting to retry.')
  .given('An action that keeps retrying, with {Feature}.')
  .and('It is waiting to retry, because {Reason}.')
  .when('clearInternalActionProps is called.')
  .then('The action stops retrying right away, without waiting for the retry delay.')
  .and('It is aborted: it does not count as failed, and its dispatchAndWait resolves.')
  .and('It is no longer in progress.')
  .example(val('Feature', 'retry = { maxRetries: -1 }'), val('Reason', 'it failed'))
  .example(val('Feature', 'retry = { maxRetries: 3 }'), val('Reason', 'it failed'))
  .example(val('Feature', 'unlimitedRetryCheckInternet = true'), val('Reason', 'it failed'))
  .example(val('Feature', 'unlimitedRetryCheckInternet = true'), val('Reason', 'there is no internet'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    try {
      const store = new Store<RetryState>({ initialState: new RetryState(0), logger: logger });
      store.isFailed(LoadValue); // So that the store keeps track of this failed action.
      const action = createRetryAction(ctx.example.val('Feature'), ctx.example.val('Reason'));
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(100);
      expect(store.isWaiting(LoadValue)).toBe(true);
      const runs = action.runs;

      store.clearInternalActionProps();
      const status = await promise;

      expect(status.isDispatchAborted).toBe(true);
      expect(store.isFailed(LoadValue)).toBe(false);
      expect(store.isWaiting(LoadValue)).toBe(false);

      // It doesn't run again.
      await jest.advanceTimersByTimeAsync(60000);
      expect(action.runs).toBe(runs);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('An attempt that is running when the internal action props are cleared is not retried if it fails.')
  .given('An action with "retry = { maxRetries: -1 }", that fails after 1000 millis.')
  .and('It is running an attempt.')
  .when('clearInternalActionProps is called, and then the attempt fails.')
  .then('The action is aborted, without retrying.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<RetryState>({ initialState: new RetryState(0), logger: logger });
      const action = new LoadValue({ failures: Infinity, reduceMillis: 1000 });
      action.retry = { maxRetries: -1 };
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(500);
      expect(action.runs).toBe(1);

      store.clearInternalActionProps();
      await jest.advanceTimersByTimeAsync(500);
      const status = await promise;

      expect(status.isDispatchAborted).toBe(true);
      expect(action.runs).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('An attempt that is running when the internal action props are cleared still changes the state if it succeeds.')
  .given('An action with "retry = { maxRetries: -1 }", that takes 1000 millis to succeed.')
  .and('It is running an attempt.')
  .when('clearInternalActionProps is called, and then the attempt succeeds.')
  .then('The action completes normally, and changes the state.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<RetryState>({ initialState: new RetryState(0), logger: logger });
      const action = new LoadValue({ failures: 0, reduceMillis: 1000 });
      action.retry = { maxRetries: -1 };
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(500);
      store.clearInternalActionProps();
      await jest.advanceTimersByTimeAsync(500);
      const status = await promise;

      expect(status.isCompletedOk).toBe(true);
      expect(store.state.value).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('After clearing the internal action props, an action that was blocked by a retrying action runs, and retries as usual.')
  .given('An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.')
  .and('While it retries, another dispatch of the same action is aborted, since it is non-reentrant.')
  .when('clearInternalActionProps is called.')
  .and('The same action is dispatched again.')
  .then('The new action runs, and retries as usual until there is internet.')
  .and('The old action does not run anymore.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<RetryState>({ initialState: new RetryState(0), logger: logger });
      const env = { internet: false };
      const oldAction = new LoadValue({ failures: 0, env });
      oldAction.unlimitedRetryCheckInternet = true;
      const oldPromise = store.dispatchAndWait(oldAction);
      await jest.advanceTimersByTimeAsync(3000);

      const blocked = new LoadValue({ failures: 0, env });
      blocked.unlimitedRetryCheckInternet = true;
      expect((await store.dispatchAndWait(blocked)).isDispatched).toBe(false);

      store.clearInternalActionProps();
      expect((await oldPromise).isDispatchAborted).toBe(true);

      const newAction = new LoadValue({ failures: 0, env });
      newAction.unlimitedRetryCheckInternet = true;
      const newPromise = store.dispatchAndWait(newAction);
      await jest.advanceTimersByTimeAsync(3000);
      expect(newAction.attempts).toBeGreaterThan(1);

      env.internet = true;
      await jest.advanceTimersByTimeAsync(1000);
      expect((await newPromise).isCompletedOk).toBe(true);
      expect(oldAction.runs).toBe(0);
      expect(store.state.value).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

function createRetryAction(feature: string, reason: string): LoadValue {
  const noInternet = reason === 'there is no internet';
  const action = new LoadValue({
    failures: noInternet ? 0 : Infinity,
    env: { internet: !noInternet },
  });
  if (feature === 'retry = { maxRetries: -1 }') action.retry = { maxRetries: -1 };
  else if (feature === 'retry = { maxRetries: 3 }') action.retry = { maxRetries: 3 };
  else action.unlimitedRetryCheckInternet = true;
  return action;
}

class RetryState {
  constructor(readonly value: number) {}
}

// Async action that fails its first `failures` runs, each after `reduceMillis`, and then adds 1
// to the value. Its internet connection is `env.internet`.
class LoadValue extends KissAction<RetryState> {
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

  async reduce(): Promise<(state: RetryState) => RetryState> {
    this.runs++;
    if (this.reduceMillis > 0) await new Promise(resolve => setTimeout(resolve, this.reduceMillis));
    if (this.runs <= this.failures) throw new UserException('Failed');
    return (state: RetryState) => new RetryState(state.value + 1);
  }
}
