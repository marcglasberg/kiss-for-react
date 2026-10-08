import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, row, val } from 'easy-bdd-tool-jest';
import { KissAction, Retry, Store, StoreException, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Retry delays');

jest.setTimeout(10000);

Bdd(feature)
  .scenario('Retries wait for the default delays between attempts.')
  .given('An action with retry turned on, using the default retry options.')
  .and('The action always fails.')
  .when('The action is dispatched.')
  .then('It waits 350 millis before the first retry.')
  .and('It waits 700 millis before the second retry.')
  .and('It waits 1400 millis before the third retry.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({});
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedFailed).toBe(true);
    expectGaps(action.gaps(), [350, 700, 1400]);
  });

Bdd(feature)
  .scenario('Retries use the configured initial delay and multiplier.')
  .given('An action that always fails, with retry options:')
  .table('Retry',
    row(val('initialDelay', 50), val('multiplier', 3), val('maxRetries', 3)),
  )
  .when('The action is dispatched.')
  .then('It waits 50, 150 and 450 millis between attempts.')
  .run(async (ctx) => {
    const r = ctx.table('Retry').rows[0];
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({
      initialDelay: r.val('initialDelay'),
      multiplier: r.val('multiplier'),
      maxRetries: r.val('maxRetries'),
    });
    await store.dispatchAndWait(action);

    expect(action.attempts).toBe(4);
    expectGaps(action.gaps(), [50, 150, 450]);
  });

Bdd(feature)
  .scenario('Retry delays never go above the maximum delay.')
  .given('An action that always fails, with retry options:')
  .table('Retry',
    row(val('initialDelay', 100), val('multiplier', 2), val('maxRetries', 4), val('maxDelay', 250)),
  )
  .when('The action is dispatched.')
  .then('It waits 100, 200, 250 and 250 millis between attempts.')
  .run(async (ctx) => {
    const r = ctx.table('Retry').rows[0];
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({
      initialDelay: r.val('initialDelay'),
      multiplier: r.val('multiplier'),
      maxRetries: r.val('maxRetries'),
      maxDelay: r.val('maxDelay'),
    });
    await store.dispatchAndWait(action);

    expect(action.attempts).toBe(5);
    expectGaps(action.gaps(), [100, 200, 250, 250]);
  });

Bdd(feature)
  .scenario('Retry can be turned off with "on: false".')
  .given('An action that always fails, with retry options "on: false".')
  .when('The action is dispatched.')
  .then('It runs only once, and fails without retrying.')
  .note('This lets a subclass turn off the retry that a base class turned on.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({ on: false, initialDelay: 10 });
    await store.dispatchAndWait(action);

    expect(action.times.length).toBe(1);
    expect(action.attempts).toBe(0);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('Retry with "unlimitedRetries" does not stop after the maximum retries.')
  .given('An action with retry options "unlimitedRetries: true" and "maxRetries: 3".')
  .and('The action fails the first 6 times.')
  .when('The action is dispatched.')
  .then('It keeps retrying, and succeeds on the 7th attempt.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatFailsNTimes(6, { unlimitedRetries: true, maxRetries: 3, initialDelay: 1, maxDelay: 5 });
    await store.dispatchAndWait(action);

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.times.length).toBe(7);
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('A multiplier of 1 keeps the retry delay constant.')
  .given('An action that always fails, with retry options:')
  .table('Retry',
    row(val('initialDelay', 100), val('multiplier', 1), val('maxRetries', 3)),
  )
  .when('The action is dispatched.')
  .then('It waits 100 millis between every attempt.')
  .run(async (ctx) => {
    const r = ctx.table('Retry').rows[0];
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({
      initialDelay: r.val('initialDelay'),
      multiplier: r.val('multiplier'),
      maxRetries: r.val('maxRetries'),
    });
    await store.dispatchAndWait(action);

    expectGaps(action.gaps(), [100, 100, 100]);
  });

Bdd(feature)
  .scenario('An invalid retry option makes the dispatch throw a descriptive error.')
  .given('An action with an invalid retry option.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException that names the action, the option and its value.')
  .and('The reducer does not run.')
  .example(val('Option', 'multiplier'), val('Value', 0.5), val('Message', 'must be a number >= 1'))
  .example(val('Option', 'multiplier'), val('Value', NaN), val('Message', 'must be a number >= 1'))
  .example(val('Option', 'initialDelay'), val('Value', -1), val('Message', 'must be a number >= 0'))
  .example(val('Option', 'initialDelay'), val('Value', Infinity), val('Message', 'must be a number >= 0'))
  .example(val('Option', 'maxDelay'), val('Value', -10), val('Message', 'must be a number >= 0'))
  .example(val('Option', 'maxRetries'), val('Value', 1.5), val('Message', 'must be an integer >= -1'))
  .example(val('Option', 'maxRetries'), val('Value', -2), val('Message', 'must be an integer >= -1'))
  .example(val('Option', 'on'), val('Value', 'yes'), val('Message', 'must be a boolean'))
  .example(val('Option', 'unlimitedRetries'), val('Value', 1), val('Message', 'must be a boolean'))
  .run(async (ctx) => {
    const option: string = ctx.example.val('Option');
    const value: any = ctx.example.val('Value');
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({ [option]: value } as Retry);

    let error: any;
    try {
      store.dispatch(action);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(StoreException);
    expect(error.message).toContain('ActionThatAlwaysFails');
    expect(error.message).toContain(`retry.${option}`);
    expect(error.message).toContain(ctx.example.val('Message'));
    expect(error.message).toContain(String(value));
    expect(action.times.length).toBe(0);
  });

Bdd(feature)
  .scenario('Valid edge values of the retry options are accepted.')
  .given('An action that always fails, with retry options "initialDelay: 0", "maxDelay: 0" and "maxRetries: 0".')
  .when('The action is dispatched.')
  .then('It runs once, does not retry, and fails with its own error.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({ initialDelay: 0, maxDelay: 0, maxRetries: 0 });
    await store.dispatchAndWait(action);

    expect(action.times.length).toBe(1);
    expect(action.status.originalError).toBeInstanceOf(UserException);
  });

/** Each measured gap must be at least the expected delay (minus timer jitter), but not much longer. */
function expectGaps(gaps: number[], expected: number[]) {
  expect(gaps.length).toBe(expected.length);
  gaps.forEach((gap, i) => {
    expect(gap).toBeGreaterThanOrEqual(expected[i] - 5);
    expect(gap).toBeLessThan(expected[i] + 150);
  });
}

class State {
  constructor(readonly count: number) {}
}

class ActionThatAlwaysFails extends KissAction<State> {
  times: number[] = [];

  constructor(retry: Retry) {
    super();
    this.retry = retry;
  }

  gaps(): number[] {
    return this.times.slice(1).map((t, i) => t - this.times[i]);
  }

  async reduce(): Promise<(state: State) => State> {
    this.times.push(Date.now());
    throw new UserException('Failed');
  }
}

class ActionThatFailsNTimes extends KissAction<State> {
  times: number[] = [];

  constructor(readonly failures: number, retry: Retry) {
    super();
    this.retry = retry;
  }

  async reduce(): Promise<(state: State) => State> {
    this.times.push(Date.now());
    if (this.times.length <= this.failures) throw new UserException('Failed');
    return (state: State) => new State(state.count + 1);
  }
}
