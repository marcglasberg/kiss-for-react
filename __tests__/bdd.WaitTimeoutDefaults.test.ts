import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, TimeoutException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait timeout defaults');

class State {
  constructor(readonly count: number) {
  }
}

class SlowAction extends KissAction<State> {
  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 60_000));
    return null;
  }
}

class OtherAction extends KissAction<State> {
  reduce() {
    return null;
  }
}

function createStore() {
  return new Store<State>({initialState: new State(0), logger: () => {}, logStateChanges: false});
}

afterEach(() => {
  jest.useRealTimers();
});

Bdd(feature)
  .scenario('The wait methods meant for tests time out after 3 seconds by default.')
  .given('An action that takes a long time is in progress.')
  .when('We wait for it with a test-only wait method, without giving a timeout.')
  .then('The wait does not time out before 3 seconds.')
  .and('The wait fails with a TimeoutException at 3 seconds.')
  .example(val('Method', 'waitActionCondition'))
  .example(val('Method', 'waitAllActions'))
  .example(val('Method', 'waitActionType'))
  .example(val('Method', 'waitAllActionTypes'))
  .example(val('Method', 'waitAnyActionTypeFinishes'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = createStore();
    const action = new SlowAction();
    store.dispatch(action);

    const waits: Record<string, () => Promise<unknown>> = {
      waitActionCondition: () => store.waitActionCondition(actions => actions.size > 5),
      waitAllActions: () => store.waitAllActions([action]),
      waitActionType: () => store.waitActionType(SlowAction),
      waitAllActionTypes: () => store.waitAllActionTypes([SlowAction]),
      waitAnyActionTypeFinishes: () => store.waitAnyActionTypeFinishes([OtherAction]),
    };

    let error: unknown = null;
    waits[ctx.example.val('Method')]().catch(e => error = e);

    await jest.advanceTimersByTimeAsync(2999);
    expect(error).toBeNull();

    await jest.advanceTimersByTimeAsync(1);
    expect(error).toBeInstanceOf(TimeoutException);
    expect(TimeoutException.defaultTimeoutMillis).toBe(3000);

    await jest.runAllTimersAsync();
  });

Bdd(feature)
  .scenario('waitCondition and dispatchWhen require a timeout.')
  .given('The wait methods that may be used in production: waitCondition and dispatchWhen.')
  .when('We call them without a timeout.')
  .then('The code does not compile.')
  .run(async (_) => {
    const store = createStore();

    // These lines would fail to compile without the @ts-expect-error comments.
    // We never run them, since they would wait forever.
    const neverCalled = () => {
      // @ts-expect-error: the timeout is required.
      store.waitCondition(state => state.count === 1);
      // @ts-expect-error: the timeout is required.
      store.dispatchWhen(new OtherAction(), state => state.count === 1);
    };

    expect(typeof neverCalled).toBe('function');
  });

Bdd(feature)
  .scenario('waitCondition with timeout 0 never times out.')
  .given('We wait for a state condition, with timeoutMillis 0.')
  .when('A long time passes, more than the default timeout.')
  .then('The wait has not failed.')
  .run(async (_) => {
    jest.useFakeTimers();
    const store = createStore();

    let error: unknown = null;
    store.waitCondition(state => state.count === 1, {timeoutMillis: 0}).catch(e => error = e);

    await jest.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(error).toBeNull();
  });
