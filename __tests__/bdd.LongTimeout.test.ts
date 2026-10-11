import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, TimeoutException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Wait timeouts larger than about 24.8 days');

const logger = (_: string) => {};

const DAY = 24 * 60 * 60 * 1000;

/** Timeouts larger than the largest delay `setTimeout` accepts (2^31 - 1 ms, about 24.8 days). */
const timeouts: Record<string, number> = {
  '30 days': 30 * DAY,
  'Infinity': Infinity,
  'Number.MAX_SAFE_INTEGER': Number.MAX_SAFE_INTEGER,
};

class State {
  constructor(readonly n: number) {
  }
}

class SetN extends KissAction<State> {
  constructor(readonly n: number) {
    super();
  }

  reduce() {
    return new State(this.n);
  }
}

class AsyncSetN extends KissAction<State> {
  constructor(readonly n: number) {
    super();
  }

  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 100));
    return (_: State) => new State(this.n);
  }
}

const delay = (millis: number) => new Promise(resolve => setTimeout(resolve, millis));

Bdd(feature)
  .scenario('waitCondition with a very large timeout doesn\'t time out right away.')
  .given('A state where the condition is false.')
  .when('We wait for the condition with a timeout of <Timeout>.')
  .and('The condition becomes true a while later.')
  .then('The wait doesn\'t time out before that.')
  .and('The wait resolves with the action that made the condition true.')
  .example(val('Timeout', '30 days'))
  .example(val('Timeout', 'Infinity'))
  .example(val('Timeout', 'Number.MAX_SAFE_INTEGER'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});

    // When
    let error: unknown = null;
    let triggerAction: unknown = null;
    const promise = store
      .waitCondition(s => s.n === 1, {timeoutMillis: timeouts[ctx.example.val('Timeout')]})
      .then(action => { triggerAction = action; }, e => { error = e; });

    await delay(50);
    expect(error).toBe(null);

    const action = new SetN(1);
    store.dispatch(action);
    await promise;

    // Then
    expect(error).toBe(null);
    expect(triggerAction).toBe(action);
  });

Bdd(feature)
  .scenario('waitCondition with a 30-day timeout times out after exactly 30 days.')
  .given('A state where the condition is false, and stays false.')
  .when('We wait for the condition with a timeout of 30 days.')
  .then('The wait has not timed out 1 millisecond before the 30 days.')
  .and('The wait rejects with a TimeoutException at the 30 days.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      // Given
      const store = new Store<State>({initialState: new State(0), logger});

      // When
      let error: unknown = null;
      store
        .waitCondition(s => s.n === 1, {timeoutMillis: 30 * DAY})
        .catch(e => { error = e; });

      // Then
      await jest.advanceTimersByTimeAsync(30 * DAY - 1);
      expect(error).toBe(null);

      await jest.advanceTimersByTimeAsync(1);
      expect(error).toBeInstanceOf(TimeoutException);
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('dispatchWhen with a very large timeout doesn\'t drop the action.')
  .given('A state where the condition is false.')
  .when('We use dispatchWhen with a timeout of <Timeout>.')
  .and('The condition becomes true a while later.')
  .then('The action is dispatched.')
  .and('onTimeout is not called.')
  .example(val('Timeout', '30 days'))
  .example(val('Timeout', 'Infinity'))
  .example(val('Timeout', 'Number.MAX_SAFE_INTEGER'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});

    // When
    let timedOut = false;
    store.dispatchWhen(new SetN(10), s => s.n === 1, {
      timeoutMillis: timeouts[ctx.example.val('Timeout')],
      onTimeout: () => { timedOut = true; },
    });

    await delay(50);
    store.dispatch(new SetN(1));
    await delay(0);

    // Then
    expect(store.state.n).toBe(10);
    expect(timedOut).toBe(false);
  });

Bdd(feature)
  .scenario('waitAllActions with a very large timeout waits for the actions to finish.')
  .given('An async action that takes 100 milliseconds to finish.')
  .when('We dispatch the action, and wait for it with a timeout of <Timeout>.')
  .then('The wait doesn\'t time out.')
  .and('The wait resolves when the action finishes.')
  .example(val('Timeout', '30 days'))
  .example(val('Timeout', 'Infinity'))
  .example(val('Timeout', 'Number.MAX_SAFE_INTEGER'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const action = new AsyncSetN(1);

    // When
    store.dispatch(action);
    let error: unknown = null;
    await store
      .waitAllActions([action], {timeoutMillis: timeouts[ctx.example.val('Timeout')]})
      .catch(e => { error = e; });

    // Then
    expect(error).toBe(null);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.n).toBe(1);
  });
