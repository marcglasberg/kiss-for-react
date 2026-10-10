import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, row, val } from 'easy-bdd-tool-jest';
import {
  AbortDispatchException,
  KissAction,
  OptimisticCommand,
  Poll,
  Store,
  StoreException,
  UnlimitedRetryCheckInternet,
  UserException,
} from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Unlimited retry check internet');

Bdd(feature)
  .scenario('When there is no internet, the action waits and retries until there is internet.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The reducer does not run while there is no internet.')
  .and('The action keeps checking the internet, and is still in progress.')
  .and('When the internet comes back, the reducer runs, and the action succeeds.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State('') });
      const env = new Env([false]);
      const action = new LoadText(env);
      const promise = store.dispatchAndWait(action);

      await jest.advanceTimersByTimeAsync(10000);
      expect(action.times.length).toBe(0);
      expect(action.checks.length).toBeGreaterThan(5);
      expect(store.isWaiting(LoadText)).toBe(true);
      expect(action.status.isCompleted).toBe(false);

      // The internet comes back.
      env.internet = [true];
      await jest.advanceTimersByTimeAsync(1000);
      await promise;

      expect(action.times.length).toBe(1);
      expect(store.state.text).toBe('A');
      expect(action.status.isCompletedOk).toBe(true);
      expect(store.isWaiting(LoadText)).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('When there is internet but the action fails, it retries unlimited times until it succeeds.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is internet, but the action fails the first 10 times.')
  .when('The action is dispatched.')
  .then('It keeps retrying, and succeeds on the 11th attempt.')
  .note('A plain retry would give up after 3 retries.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([true], 10));
    await dispatchWithFakeTimers(store, action);

    expect(action.times.length).toBe(11);
    expect(action.attempts).toBe(10);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('When there is no internet, the delay between retries is at most 1 second, by default.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet for the first 4 checks.')
  .when('The action is dispatched.')
  .then('It checks the internet again after 350, 700, 1000 and 1000 millis.')
  .and('Then the reducer runs once, and the action succeeds.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([false, false, false, false, true]));
    await dispatchWithFakeTimers(store, action);

    expect(gaps(action.checks)).toEqual([350, 700, 1000, 1000]);
    expect(action.times.length).toBe(1);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('When there is internet but the action fails, the delay between retries is at most 5 seconds, by default.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is internet, but the action fails the first 6 times.')
  .when('The action is dispatched.')
  .then('It retries after 350, 700, 1400, 2800, 5000 and 5000 millis.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([true], 6));
    await dispatchWithFakeTimers(store, action);

    expect(gaps(action.times)).toEqual([350, 700, 1400, 2800, 5000, 5000]);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('The delay keeps growing across attempts with and without internet.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet for the first 3 checks.')
  .and('Then there is internet, but the action fails the first time it runs.')
  .when('The action is dispatched.')
  .then('It checks the internet again after 350, 700 and 1000 millis (capped by the no-internet maximum).')
  .and('Then it retries after 2000 millis (the delay doubled, capped by the maximum delay).')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([false, false, false, true], 1));
    await dispatchWithFakeTimers(store, action);

    expect(gaps(action.checks)).toEqual([350, 700, 1000, 2000]);
    expect(action.times.length).toBe(2);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('The retry delays can be configured.')
  .given('An action with these "unlimitedRetryCheckInternet" options:')
  .table('Options',
    row(val('initialDelay', 100), val('multiplier', 3), val('maxDelay', 2000), val('maxDelayNoInternet', 500)),
  )
  .and('There is no internet for the first 3 checks.')
  .and('Then there is internet, but the action fails the first 3 times it runs.')
  .when('The action is dispatched.')
  .then('Without internet, it waits 100, 300 and 500 millis.')
  .and('With internet, it waits 1500, 2000 and 2000 millis.')
  .run(async (ctx) => {
    const r = ctx.table('Options').rows[0];
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([false, false, false, true], 3));
    action.unlimitedRetryCheckInternet = {
      initialDelay: r.val('initialDelay'),
      multiplier: r.val('multiplier'),
      maxDelay: r.val('maxDelay'),
      maxDelayNoInternet: r.val('maxDelayNoInternet'),
    };
    await dispatchWithFakeTimers(store, action);

    expect(gaps(action.checks)).toEqual([100, 300, 500, 1500, 2000, 2000]);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('The action is non-reentrant for the whole time until it succeeds.')
  .given('An action with "unlimitedRetryCheckInternet = true", dispatched while there is no internet.')
  .when('Another action of the same class is dispatched while the first one is waiting to retry.')
  .then('The second action is aborted silently.')
  .and('After the first action succeeds, a new action of the same class runs normally.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State('') });
      const env = new Env([false]);
      const first = new LoadText(env, 'A');
      const promise = store.dispatchAndWait(first);
      await jest.advanceTimersByTimeAsync(3000);

      const second = new LoadText(env, 'B');
      const secondStatus = await store.dispatchAndWait(second);
      expect(secondStatus.isDispatchAborted).toBe(true);
      expect(second.checks.length).toBe(0);

      env.internet = [true];
      await jest.advanceTimersByTimeAsync(1000);
      await promise;
      expect(store.state.text).toBe('A');

      const third = new LoadText(env, 'C');
      const thirdStatus = await store.dispatchAndWait(third);
      expect(thirdStatus.isCompletedOk).toBe(true);
      expect(store.state.text).toBe('AC');
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Actions of the same class with different non-reentrant key params do not block each other.')
  .given('An action with "unlimitedRetryCheckInternet = true" that overrides "nonReentrantKeyParams()".')
  .and('There is no internet.')
  .when('Two actions with different params are dispatched, and then one with the same params as the first.')
  .then('The actions with different params both run when the internet comes back.')
  .and('The action with the same params as the first is aborted.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State('') });
      const env = new Env([false]);
      const a = new LoadTextWithKey(env, 'A');
      const b = new LoadTextWithKey(env, 'B');
      const a2 = new LoadTextWithKey(env, 'A');

      const promiseA = store.dispatchAndWait(a);
      const promiseB = store.dispatchAndWait(b);
      const statusA2 = await store.dispatchAndWait(a2);
      expect(statusA2.isDispatchAborted).toBe(true);

      env.internet = [true];
      await jest.advanceTimersByTimeAsync(2000);
      await Promise.all([promiseA, promiseB]);

      expect(a.status.isCompletedOk).toBe(true);
      expect(b.status.isCompletedOk).toBe(true);
      expect(store.state.text).toBe('AB');
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('The non-reentrant key is shared with "nonReentrant" actions.')
  .given('An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.')
  .and('A "nonReentrant" action of another class, with the same "computeNonReentrantKey()".')
  .when('The "nonReentrant" action is dispatched.')
  .then('It is aborted.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State('') });
      const env = new Env([false]);
      const action = new LoadTextSharedKey(env);
      const promise = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(1000);

      const status = await store.dispatchAndWait(new SaveTextSharedKey());
      expect(status.isDispatchAborted).toBe(true);

      env.internet = [true];
      await jest.advanceTimersByTimeAsync(1000);
      await promise;
      expect(action.status.isCompletedOk).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('The attempts count both the attempts without internet and the failed ones.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet for the first 2 checks.')
  .and('Then there is internet, but the action fails the first 3 times it runs.')
  .when('The action is dispatched.')
  .then('The action succeeds with 5 attempts.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([false, false, true], 3));
    await dispatchWithFakeTimers(store, action);

    expect(action.attempts).toBe(5);
    expect(action.checks.length).toBe(6);
    expect(action.times.length).toBe(4);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('If checking the internet throws an error, it counts as a failed attempt, and it retries.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('Its internet check throws an error the first 2 times.')
  .when('The action is dispatched.')
  .then('It retries, and the action succeeds when the internet check works.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadTextWithThrowingCheck(new Env([true]), 2);
    await dispatchWithFakeTimers(store, action);

    expect(action.attempts).toBe(2);
    expect(action.times.length).toBe(1);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('An action that aborts itself is not retried.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is internet, but its reducer throws an AbortDispatchException.')
  .when('The action is dispatched.')
  .then('It is not retried, and the dispatch is aborted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadTextThatAborts(new Env([true]));
    await dispatchWithFakeTimers(store, action);

    expect(action.times.length).toBe(1);
    expect(action.attempts).toBe(0);
    expect(action.status.isDispatchAborted).toBe(true);
  });

Bdd(feature)
  .scenario('If the "before" method throws an error, the action is not retried.')
  .given('An action with "unlimitedRetryCheckInternet = true", whose "before" method throws an error.')
  .when('The action is dispatched.')
  .then('It fails without checking the internet, and without running the reducer.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadTextWithFailingBefore(new Env([true]));
    await dispatchWithFakeTimers(store, action);

    expect(action.checks.length).toBe(0);
    expect(action.times.length).toBe(0);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('It can be turned off with "false".')
  .given('An action with "unlimitedRetryCheckInternet = false", that always fails.')
  .when('The action is dispatched.')
  .then('It runs once, without checking the internet, and fails without retrying.')
  .note('This lets a subclass turn off what a base class turned on.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([false], 100));
    action.unlimitedRetryCheckInternet = false;
    await store.dispatchAndWait(action);

    expect(action.checks.length).toBe(0);
    expect(action.times.length).toBe(1);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('The retries are logged.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('There is no internet for the first check, and then the action fails once.')
  .when('The action is dispatched.')
  .then('Each attempt is logged, saying if it was aborted because of no internet.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(''), logger: (obj) => logs.push(String(obj)) });
    const action = new LoadText(new Env([false, true], 1));
    await dispatchWithFakeTimers(store, action);

    // Note the action description changes between attempts, since it shows its fields.
    const retryLogs = logs.filter(log => log.startsWith('Trying') || log.startsWith('Retrying'));
    expect(retryLogs.length).toBe(3);
    expect(retryLogs[0]).toMatch(/^Trying LoadText\(.*\); aborted because of no internet\.$/);
    expect(retryLogs[1]).toMatch(/^Retrying LoadText\(.*\) \(attempt 1\)\.$/);
    expect(retryLogs[2]).toMatch(/^Retrying LoadText\(.*\) \(attempt 2\)\.$/);
  });

Bdd(feature)
  .scenario('It needs an ASYNC reducer.')
  .given('An action with "unlimitedRetryCheckInternet = true", with a SYNC reducer.')
  .when('The action is dispatched.')
  .then('The action fails with a StoreException that explains the problem.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new SyncLoadText();
    await store.dispatchAndWait(action).catch(() => {});

    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(action.status.originalError.message).toContain('uses unlimitedRetryCheckInternet, but its reducer is SYNC');
  });

Bdd(feature)
  .scenario('It can not be combined with some other features.')
  .given('An action with "unlimitedRetryCheckInternet = true".')
  .and('The action also uses another feature that can not be combined with it.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException that names both features.')
  .and('The reducer does not run.')
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'checkInternet'))
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'debounce'))
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .example(val('Feature', 'sequential'))
  .example(val('Feature', 'polling'))
  .run(async (ctx) => {
    const feature: string = ctx.example.val('Feature');
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadTextWithPolling(new Env([true]));
    const setters: Record<string, () => void> = {
      retry: () => action.retry = { on: true },
      checkInternet: () => action.checkInternet = { dialog: false },
      nonReentrant: () => action.nonReentrant = true,
      debounce: () => action.debounce = 300,
      throttle: () => action.throttle = 1000,
      fresh: () => action.fresh = 1000,
      sequential: () => action.sequential = true,
      polling: () => action.poll = Poll.start,
    };
    setters[feature]();

    let error: any;
    try {
      store.dispatch(action);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(StoreException);
    expect(error.message).toContain('LoadTextWithPolling');
    expect(error.message).toContain(`uses both unlimitedRetryCheckInternet and ${feature}`);
    expect(action.times.length).toBe(0);
  });

Bdd(feature)
  .scenario('It can not be used in an OptimisticCommand.')
  .given('An OptimisticCommand with "unlimitedRetryCheckInternet = true".')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('') });

    let error: any;
    try {
      store.dispatch(new SaveTextCommand());
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(StoreException);
    expect(error.message).toContain("is an OptimisticCommand, which can't use unlimitedRetryCheckInternet");
  });

Bdd(feature)
  .scenario('An invalid value makes the dispatch throw a descriptive error.')
  .given('An action with an invalid "unlimitedRetryCheckInternet" value.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException that names the action, the problem and the value.')
  .and('The reducer does not run.')
  .example(val('Value', 'yes'), val('Message', 'it must be a boolean, or an object'))
  .example(val('Value', 1), val('Message', 'it must be a boolean, or an object'))
  .example(val('Value', { multiplier: 0.5 }), val('Message', 'unlimitedRetryCheckInternet.multiplier must be a number >= 1'))
  .example(val('Value', { initialDelay: -1 }), val('Message', 'unlimitedRetryCheckInternet.initialDelay must be a number >= 0'))
  .example(val('Value', { maxDelay: NaN }), val('Message', 'unlimitedRetryCheckInternet.maxDelay must be a number >= 0'))
  .example(val('Value', { maxDelayNoInternet: -5 }), val('Message', 'unlimitedRetryCheckInternet.maxDelayNoInternet must be a number >= 0'))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State('') });
    const action = new LoadText(new Env([true]));
    action.unlimitedRetryCheckInternet = ctx.example.val('Value');

    let error: any;
    try {
      store.dispatch(action);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(StoreException);
    expect(error.message).toContain('LoadText');
    expect(error.message).toContain(ctx.example.val('Message'));
    expect(action.times.length).toBe(0);
  });

/**
 * Dispatches the action with fake timers, and runs all timers until the action finishes.
 * Since `Date.now()` is also faked, the measured gaps are exact, and the test doesn't
 * actually wait for the delays.
 */
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

/** The gaps between consecutive times. */
function gaps(times: number[]): number[] {
  return times.slice(1).map((t, i) => t - times[i]);
}

class State {
  constructor(readonly text: string) {}
}

/** The environment of the action: the internet status, and how many times the reducer fails. */
class Env {
  /**
   * @param internet The internet status of each check. After the last one, the last status
   * is repeated.
   * @param failures How many times the reducer fails before it succeeds.
   */
  constructor(public internet: boolean[], readonly failures: number = 0) {}

  isOnline(check: number): boolean {
    return this.internet[Math.min(check, this.internet.length - 1)];
  }
}

class LoadText extends KissAction<State> {
  unlimitedRetryCheckInternet: boolean | UnlimitedRetryCheckInternet = true;

  /** The times the internet was checked. */
  checks: number[] = [];

  /** The times the reducer ran. */
  times: number[] = [];

  constructor(readonly env: Env, readonly id: string = 'A') {
    super();
  }

  protected hasInternet(): Promise<boolean> {
    const isOnline = this.env.isOnline(this.checks.length);
    this.checks.push(Date.now());
    return Promise.resolve(isOnline);
  }

  async reduce(): Promise<(state: State) => State> {
    this.times.push(Date.now());
    if (this.times.length <= this.env.failures) throw new UserException('Failed');
    return (state: State) => new State(state.text + this.id);
  }
}

class LoadTextWithKey extends LoadText {
  nonReentrantKeyParams() {
    return this.id;
  }
}

class LoadTextSharedKey extends LoadText {
  computeNonReentrantKey() {
    return 'text';
  }
}

class SaveTextSharedKey extends KissAction<State> {
  nonReentrant = true;

  computeNonReentrantKey() {
    return 'text';
  }

  async reduce() {
    return null;
  }
}

class LoadTextWithThrowingCheck extends LoadText {
  constructor(env: Env, readonly checkErrors: number) {
    super(env);
  }

  protected hasInternet(): Promise<boolean> {
    if (this.checks.length < this.checkErrors) {
      this.checks.push(Date.now());
      return Promise.reject(new Error('Check failed'));
    }
    return super.hasInternet();
  }
}

class LoadTextThatAborts extends LoadText {
  async reduce(): Promise<(state: State) => State> {
    this.times.push(Date.now());
    throw new AbortDispatchException();
  }
}

class LoadTextWithFailingBefore extends LoadText {
  before() {
    throw new UserException('Before failed');
  }
}

class LoadTextWithPolling extends LoadText {
  createPollingAction() {
    return new LoadText(this.env);
  }
}

class SyncLoadText extends KissAction<State> {
  unlimitedRetryCheckInternet = true;

  protected hasInternet(): Promise<boolean> {
    return Promise.resolve(true);
  }

  reduce(): State {
    return new State('sync');
  }
}

class SaveTextCommand extends OptimisticCommand<State, string> {
  unlimitedRetryCheckInternet = true;

  optimisticValue() {
    return 'optimistic';
  }

  getValueFromState(state: State) {
    return state.text;
  }

  applyValueToState(state: State, text: string) {
    return new State(text);
  }

  async sendCommandToServer() {
    return null;
  }
}
