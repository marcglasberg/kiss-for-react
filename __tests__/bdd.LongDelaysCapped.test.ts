import { afterEach, beforeEach, expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Poll, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Delays larger than about 24.8 days are capped');

// Fake timers let the tests advance the clock by days.
beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

const advance = (millis: number) => jest.advanceTimersByTimeAsync(millis);

const logger = (_: string) => {};

const DAY = 24 * 60 * 60 * 1000;

/** The largest delay `setTimeout` accepts (about 24.8 days). */
const MAX = 2 ** 31 - 1;

/** Retry delays larger than the largest delay `setTimeout` accepts. */
const delays: Record<string, number> = {
  '30 days': 30 * DAY,
  'Number.MAX_SAFE_INTEGER': Number.MAX_SAFE_INTEGER,
};

Bdd(feature)
  .scenario('A retry delay larger than about 24.8 days is capped at about 24.8 days.')
  .given('An action that always fails, and retries once, with a retry delay of <Delay>.')
  .when('The action is dispatched.')
  .then('It doesn\'t retry within one second.')
  .and('It retries when about 24.8 days have passed.')
  .example(val('Delay', '30 days'))
  .example(val('Delay', 'Number.MAX_SAFE_INTEGER'))
  .run(async (ctx) => {
    // Given
    const delay = delays[ctx.example.val('Delay')];
    const store = new Store<number>({initialState: 0, logger});
    const action = new AlwaysFails(delay);

    // When
    store.dispatch(action);
    expect(action.runs).toBe(1);

    // Then
    await advance(1000);
    expect(action.runs).toBe(1);

    await advance(MAX - 1000);
    expect(action.runs).toBe(2);
  });

Bdd(feature)
  .scenario('A retry delay that grows past about 24.8 days stays at about 24.8 days.')
  .given('An action that always fails, and retries forever.')
  .and('Its retry delay starts at 1 day, doubles each time, and has a maximum of 1000 days.')
  .when('The action is dispatched, and retried until its delay is larger than about 24.8 days.')
  .then('It doesn\'t retry within one second.')
  .and('It retries when about 24.8 days have passed.')
  .run(async (_) => {
    // Given
    const store = new Store<number>({initialState: 0, logger});
    const action = new AlwaysFails(DAY, {multiplier: 2, maxRetries: -1});

    // When: Delays of 1, 2, 4, 8 and 16 days. The next one would be 32 days.
    store.dispatch(action);
    await advance(31 * DAY);
    expect(action.runs).toBe(6);

    // Then
    await advance(1000);
    expect(action.runs).toBe(6);

    await advance(MAX - 1000);
    expect(action.runs).toBe(7);

    store.setShutDown(true);
  });

Bdd(feature)
  .scenario('A debounce larger than about 24.8 days is capped at about 24.8 days.')
  .given('An action with a debounce of 30 days.')
  .when('The action is dispatched.')
  .then('Its reducer doesn\'t run within one second.')
  .and('Its reducer runs when about 24.8 days have passed.')
  .run(async (_) => {
    // Given
    const store = new Store<number>({initialState: 0, logger});

    // When
    store.dispatch(new Debounced());

    // Then
    await advance(1000);
    expect(store.state).toBe(0);

    await advance(MAX - 1000);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('A poll interval larger than about 24.8 days is capped at about 24.8 days.')
  .given('An action that polls every 30 days.')
  .when('The action is dispatched with Poll.start.')
  .then('It runs right away.')
  .and('It doesn\'t run again within one second.')
  .and('It runs again when about 24.8 days have passed.')
  .run(async (_) => {
    // Given
    const store = new Store<number>({initialState: 0, logger});

    // When
    store.dispatch(new Polled(Poll.start));

    // Then
    expect(store.state).toBe(1);

    await advance(1000);
    expect(store.state).toBe(1);

    await advance(MAX - 1000);
    expect(store.state).toBe(2);

    store.setShutDown(true);
  });

Bdd(feature)
  .scenario('A persistor throttle larger than about 24.8 days is respected.')
  .given('A store with a persistor with a throttle of 30 days.')
  .and('The initial state was just saved.')
  .when('The state changes.')
  .then('The new state is not saved within one second.')
  .and('The new state is not saved when about 24.8 days have passed.')
  .and('The new state is saved when the 30 days have passed.')
  .run(async (_) => {
    // Given
    const persistor = new MemPersistor(30 * DAY);
    const store = new Store<number>({initialState: 0, persistor, logger});
    await store.ready();
    expect(persistor.saved).toBe(0);

    // When
    store.dispatchSync(new Inc());

    // Then
    await advance(1000);
    expect(persistor.saved).toBe(0);

    await advance(MAX - 1000);
    expect(persistor.saved).toBe(0);

    await advance(30 * DAY - MAX);
    expect(persistor.saved).toBe(1);
  });

Bdd(feature)
  .scenario('A logOut throttle larger than about 24.8 days is capped at about 24.8 days.')
  .given('A store.')
  .when('We log out with a throttle of 30 days.')
  .then('The logOut doesn\'t finish within one second.')
  .and('The logOut finishes when about 24.8 days have passed.')
  .run(async (_) => {
    // Given
    const store = new Store<number>({initialState: 5, logger});

    // When
    let finished = false;
    store.logOut({initialState: 0, throttle: 30 * DAY, actionsThrottle: 0})
      .then(() => { finished = true; });

    // Then
    await advance(1000);
    expect(finished).toBe(false);

    await advance(MAX - 1000);
    expect(finished).toBe(true);
    expect(store.state).toBe(0);
  });

class AlwaysFails extends KissAction<number> {
  runs = 0;

  constructor(delay: number, options: { multiplier?: number, maxRetries?: number } = {}) {
    super();
    this.retry = {
      initialDelay: delay,
      maxDelay: Math.max(delay, 1000 * DAY),
      multiplier: options.multiplier ?? 1,
      maxRetries: options.maxRetries ?? 1,
    };
  }

  async reduce(): Promise<null> {
    this.runs++;
    throw new UserException('Failed');
  }
}

class Inc extends KissAction<number> {
  reduce() {
    return this.state + 1;
  }
}

class Debounced extends KissAction<number> {
  debounce = 30 * DAY;

  reduce() {
    return this.state + 1;
  }
}

class Polled extends KissAction<number> {
  pollInterval = 30 * DAY;

  constructor(readonly poll = Poll.once) {
    super();
  }

  createPollingAction() {
    return new Polled();
  }

  reduce() {
    return this.state + 1;
  }
}

class MemPersistor extends Persistor<number> {
  saved: number | null = null;

  constructor(private readonly _throttle: number) {
    super();
  }

  async readState() {
    return null;
  }

  async deleteState() {
    this.saved = null;
  }

  async saveInitialState(s: number) {
    this.saved = s;
  }

  async persistDifference(_last: number | null, s: number) {
    this.saved = s;
  }

  get throttle() {
    return this._throttle;
  }
}
