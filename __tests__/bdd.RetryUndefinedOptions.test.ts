import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Retry, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Retry options set to undefined');

Bdd(feature)
  .scenario('A "maxRetries" set to undefined uses the default of 3 retries.')
  .given('An action that always fails, with retry options "initialDelay: 1" and "maxRetries: undefined".')
  .note('For example, "maxRetries: config.maxRetries", where the config does not set it.')
  .when('The action is dispatched.')
  .then('It runs 4 times, and then fails.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({ initialDelay: 1, maxRetries: undefined });
    await dispatchWithFakeTimers(store, action);

    expect(action.times.length).toBe(4);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(UserException);
  });

Bdd(feature)
  .scenario('A retry option set to undefined uses its default value.')
  .given('An action that always fails, with retry options where one option is set to undefined.')
  .when('The action is dispatched.')
  .then('That option uses its default value, which gives the expected delays between attempts.')
  .and('The action fails after the last retry.')
  .example(val('Undefined option', 'initialDelay'), val('Other option', 'maxRetries: 3'), val('Delays', '350, 700, 1400'))
  .example(val('Undefined option', 'multiplier'), val('Other option', 'initialDelay: 100'), val('Delays', '100, 200, 400'))
  .example(val('Undefined option', 'maxDelay'), val('Other option', 'initialDelay: 2000'), val('Delays', '2000, 4000, 5000'))
  .example(val('Undefined option', 'maxRetries'), val('Other option', 'initialDelay: 100'), val('Delays', '100, 200, 400'))
  .example(val('Undefined option', 'on'), val('Other option', 'initialDelay: 100'), val('Delays', '100, 200, 400'))
  .example(val('Undefined option', 'unlimitedRetries'), val('Other option', 'initialDelay: 100'), val('Delays', '100, 200, 400'))
  .run(async (ctx) => {
    const option: string = ctx.example.val('Undefined option');
    const [otherOption, otherValue] = (ctx.example.val('Other option') as string).split(': ');
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({ [otherOption]: Number(otherValue), [option]: undefined } as Retry);
    await dispatchWithFakeTimers(store, action);

    const delays = (ctx.example.val('Delays') as string).split(', ').map(Number);
    expect(action.gaps()).toEqual(delays);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('All retry options set to undefined is the same as turning retry on with the defaults.')
  .given('An action that always fails, with all its retry options set to undefined.')
  .when('The action is dispatched.')
  .then('It waits 350, 700 and 1400 millis between attempts, and then fails.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1) });
    const action = new ActionThatAlwaysFails({
      on: undefined,
      initialDelay: undefined,
      multiplier: undefined,
      maxRetries: undefined,
      maxDelay: undefined,
      unlimitedRetries: undefined,
    });
    await dispatchWithFakeTimers(store, action);

    expect(action.gaps()).toEqual([350, 700, 1400]);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('An optimistic command with "maxRetries" set to undefined stops retrying, and can be dispatched again.')
  .given('An optimistic command whose server call always fails.')
  .and('Its retry options are "initialDelay: 1" and "maxRetries: undefined".')
  .when('The command is dispatched.')
  .then('The server call runs 4 times, and then the command fails.')
  .and('The optimistic value is rolled back.')
  .and('A later dispatch of the same command is not aborted.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      let calls = 0;

      class SaveWithRetry extends OptimisticCommand<State, number> {
        retry = { initialDelay: 1, maxRetries: undefined };
        optimisticValue() { return 2; }
        getValueFromState(state: State) { return state.count; }
        applyValueToState(_state: State, value: number) { return new State(value); }
        async sendCommandToServer(_value: number) {
          calls++;
          throw new UserException('Failed');
        }
      }

      const store = new Store<State>({ initialState: new State(1) });
      const action = new SaveWithRetry();
      store.dispatch(action);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(calls).toBe(4);
      expect(action.status.isCompletedFailed).toBe(true);
      expect(store.state.count).toBe(1);

      const action2 = new SaveWithRetry();
      store.dispatch(action2);
      await jest.advanceTimersByTimeAsync(60_000);

      expect(action2.status.isDispatchAborted).toBe(false);
      expect(calls).toBe(8);
      expect(action2.status.isCompletedFailed).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

/**
 * Dispatches the action with fake timers, and runs the timers for 60 seconds, which is more
 * than enough for the action to finish. Since `Date.now()` is also faked, the measured gaps
 * between attempts are exact. If the action keeps retrying forever, it's stopped by shutting
 * down the store, so that it doesn't keep running after the test.
 */
async function dispatchWithFakeTimers(store: Store<State>, action: KissAction<State>) {
  jest.useFakeTimers();
  try {
    store.dispatch(action);
    await jest.advanceTimersByTimeAsync(60_000);
    if (!action.status.isCompleted) store.setShutDown(true);
  } finally {
    jest.useRealTimers();
  }
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
