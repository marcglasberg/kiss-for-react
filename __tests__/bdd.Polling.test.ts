import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Poll, ReduxReducer, Store, StoreException, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Polling');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action that adds 1 to the count. Polls every 100 millis.
class Count extends KissAction<State> {
  pollInterval = 100;

  constructor(readonly poll = Poll.once) { super(); }

  createPollingAction() { return new Count(); }

  reduce() {
    return new State(this.state.count + 1);
  }
}

// Keeps track of the runs of the `Slow` and `Tracked` actions.
class Tracker {
  started = 0;
  running = 0;
  maxRunning = 0;
  errors = 0;
  fail = false;
}

// Async action that takes 250 millis to add 1 to the count. Polls every 100 millis.
class Slow extends KissAction<State> {
  pollInterval = 100;

  constructor(
    readonly tracker: Tracker,
    readonly poll = Poll.once,
    readonly pollWaitsForRun = true,
  ) { super(); }

  createPollingAction() { return new Slow(this.tracker, Poll.once, this.pollWaitsForRun); }

  async reduce() {
    const tracker = this.tracker;
    tracker.started++;
    tracker.running++;
    tracker.maxRunning = Math.max(tracker.maxRunning, tracker.running);
    await delayMillis(250);
    tracker.running--;
    return (state: State) => new State(state.count + 1);
  }
}

// Async action that takes 50 millis to add 1 to the count, or to fail with a `UserException`
// when `tracker.fail` is true. Polls every 100 millis.
class Tracked extends KissAction<State> {
  pollInterval = 100;

  constructor(
    readonly tracker: Tracker,
    readonly poll = Poll.once,
    readonly pollWaitsForRun = true,
  ) { super(); }

  createPollingAction() { return new Tracked(this.tracker, Poll.once, this.pollWaitsForRun); }

  async reduce() {
    this.tracker.started++;
    await delayMillis(50);
    if (this.tracker.fail) {
      this.tracker.errors++;
      throw new UserException('Failed');
    }
    return (state: State) => new State(state.count + 1);
  }
}

// Runs the test with fake timers, and then stops all polling.
async function withFakeTimers(store: Store<State>, test: () => Promise<void>) {
  jest.useFakeTimers();
  try {
    await test();
  } finally {
    store.setShutDown(true);
    jest.useRealTimers();
  }
}

const elapse = (millis: number) => jest.advanceTimersByTimeAsync(millis);

Bdd(feature)
  .scenario('Poll.start runs the action immediately, and starts polling.')
  .given('An action that polls every 100 millis.')
  .when('The action is dispatched with Poll.start.')
  .then('It runs right away.')
  .and('It runs again every 100 millis.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(100);
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(3);

      await elapse(100);
      expect(store.state.count).toBe(4);
    });
  });

Bdd(feature)
  .scenario('Poll.start does nothing when polling is already active.')
  .given('An action that polls every 100 millis, and is already polling.')
  .when('The action is dispatched with Poll.start again.')
  .then('It does not run, and the timer is not restarted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(50);
      const action = new Count(Poll.start);
      store.dispatch(action);
      expect(store.state.count).toBe(1);
      expect(action.status.isCompletedOk).toBe(true);

      // The original timer still ticks at 100 millis.
      await elapse(50);
      expect(store.state.count).toBe(2);
    });
  });

Bdd(feature)
  .scenario('Poll.stop cancels the polling, and does not run the action.')
  .given('An action that is polling.')
  .when('The action is dispatched with Poll.stop.')
  .then('It does not run.')
  .and('There are no more ticks.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      store.dispatch(new Count(Poll.stop));
      expect(store.state.count).toBe(1);

      await elapse(500);
      expect(store.state.count).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('Poll.stop when not polling does nothing.')
  .given('An action that is not polling.')
  .when('The action is dispatched with Poll.stop.')
  .then('It does not run, and does not fail.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      const action = new Count(Poll.stop);
      store.dispatchSync(action);
      expect(action.status.isCompletedOk).toBe(true);
      expect(store.state.count).toBe(0);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('The action still runs its before and after methods when the reducer is skipped.')
  .given('An action with before and after methods, that is polling.')
  .when('The action is dispatched with Poll.start again, and then with Poll.stop.')
  .then('Their before and after methods run, but their reducers do not.')
  .run(async (_) => {
    const log: string[] = [];

    class Logged extends KissAction<State> {
      constructor(readonly poll: Poll) { super(); }

      createPollingAction() { return new Logged(Poll.once); }

      before() { log.push(`before ${this.poll}`); }

      reduce() {
        log.push(`reduce ${this.poll}`);
        return null;
      }

      after() { log.push(`after ${this.poll}`); }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Logged(Poll.start));
      store.dispatch(new Logged(Poll.start));
      store.dispatch(new Logged(Poll.stop));

      expect(log).toEqual([
        'before start', 'reduce start', 'after start',
        'before start', 'after start',
        'before stop', 'after stop',
      ]);
    });
  });

Bdd(feature)
  .scenario('Poll.runNowAndRestart runs the action immediately, and restarts the polling.')
  .given('An action that polls every 100 millis, and is polling.')
  .when('The action is dispatched with Poll.runNowAndRestart, between two ticks.')
  .then('It runs right away.')
  .and('The next tick is 100 millis after that.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(60);
      store.dispatch(new Count(Poll.runNowAndRestart));
      expect(store.state.count).toBe(2);

      // The old tick, at 100 millis, was cancelled.
      await elapse(99); // 159 millis.
      expect(store.state.count).toBe(2);

      // The new tick happens at 160 millis.
      await elapse(1); // 160 millis.
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Poll.runNowAndRestart when not polling works like Poll.start.')
  .given('An action that polls every 100 millis, and is not polling.')
  .when('The action is dispatched with Poll.runNowAndRestart.')
  .then('It runs right away, and starts polling.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.runNowAndRestart));
      expect(store.state.count).toBe(1);

      await elapse(100);
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Poll.once runs the action, without affecting the polling.')
  .given('An action that polls every 100 millis, and is polling.')
  .when('The action is dispatched with Poll.once, between two ticks.')
  .then('It runs right away.')
  .and('The ticks continue as before.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      await elapse(60);
      store.dispatch(new Count(Poll.once));
      expect(store.state.count).toBe(2);

      await elapse(40); // 100 millis.
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('Poll.once never starts the polling.')
  .given('An action that polls every 100 millis, and is not polling.')
  .when('The action is dispatched with Poll.once, 3 times.')
  .then('It runs 3 times.')
  .and('There are no ticks.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count());
      store.dispatch(new Count(Poll.once));
      store.dispatch(new Count(Poll.once));
      expect(store.state.count).toBe(3);

      await elapse(500);
      expect(store.state.count).toBe(3);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('Poll.start after Poll.stop starts polling again.')
  .given('An action that was polling, and was stopped.')
  .when('The action is dispatched with Poll.start.')
  .then('It runs right away, and starts polling again.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.dispatch(new Count(Poll.stop));
      await elapse(500);
      expect(store.state.count).toBe(1);

      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(3);
    });
  });

Bdd(feature)
  .scenario('The ticks dispatch the action returned by createPollingAction.')
  .given('A polling controller action, whose createPollingAction returns a different worker action.')
  .when('The controller is dispatched with Poll.start.')
  .then('Each tick dispatches the worker action.')
  .and('The worker action is in progress while it runs.')
  .run(async (_) => {
    const log: string[] = [];

    class LoadCount extends KissAction<State> {
      async reduce() {
        log.push('LoadCount');
        await delayMillis(10);
        return (state: State) => new State(state.count + 1);
      }
    }

    class PollCount extends KissAction<State> {
      pollInterval = 100;

      constructor(readonly poll = Poll.start) { super(); }

      createPollingAction() { return new LoadCount(); }

      async reduce() {
        log.push('PollCount');
        await this.dispatchAndWait(new LoadCount());
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new PollCount(Poll.start));
      await elapse(10);
      expect(store.state.count).toBe(1);

      // The tick starts at 110 millis (10 + 100).
      await elapse(100); // 110 millis.
      expect(store.isWaiting(LoadCount)).toBe(true);
      expect(store.isWaiting(PollCount)).toBe(false);

      await elapse(10); // 120 millis.
      expect(store.state.count).toBe(2);

      expect(log).toEqual(['PollCount', 'LoadCount', 'LoadCount']);
    });
  });

Bdd(feature)
  .scenario('A single action class can both control the polling and do the work.')
  .given('An action whose createPollingAction returns the same action class, with Poll.once.')
  .when('The action is dispatched with Poll.start.')
  .then('The ticks run the action, without restarting the polling.')
  .run(async (_) => {
    const dispatched: string[] = [];
    const store = new Store<State>({
      initialState: new State(0),
      logger: logger,
      actionObserver: (action, _count, ini) => { if (ini) dispatched.push(action.toString()); },
    });

    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      await elapse(250);

      expect(store.state.count).toBe(3);
      expect(dispatched).toEqual(['Count(poll:start)', 'Count(poll:once)', 'Count(poll:once)']);
    });
  });

Bdd(feature)
  .scenario('Different action classes have independent polling.')
  .given('Two different action classes that poll.')
  .when('Both are started, and then one of them is stopped.')
  .then('The other one keeps polling.')
  .run(async (_) => {
    class CountToo extends Count {
      createPollingAction() { return new CountToo(); }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.dispatch(new CountToo(Poll.start));
      expect(store.state.count).toBe(2);

      await elapse(100);
      expect(store.state.count).toBe(4);

      store.dispatch(new Count(Poll.stop));
      await elapse(100);
      expect(store.state.count).toBe(5);
    });
  });

Bdd(feature)
  .scenario('pollingKeyParams gives each value its own polling.')
  .given('An action that polls, and whose pollingKeyParams is its id.')
  .when('It is started for ids A and B, and then stopped for id A.')
  .then('Id B keeps polling.')
  .and('Starting id B again does nothing, since it is already polling.')
  .run(async (_) => {
    const log: string[] = [];

    class Load extends KissAction<State> {
      pollInterval = 100;

      constructor(readonly id: string, readonly poll = Poll.once) { super(); }

      pollingKeyParams() { return this.id; }

      createPollingAction() { return new Load(this.id); }

      reduce() {
        log.push(this.id);
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Load('A', Poll.start));
      store.dispatch(new Load('B', Poll.start));
      store.dispatch(new Load('B', Poll.start));
      expect(log).toEqual(['A', 'B']);

      await elapse(100);
      expect(log).toEqual(['A', 'B', 'A', 'B']);

      store.dispatch(new Load('A', Poll.stop));
      await elapse(100);
      expect(log).toEqual(['A', 'B', 'A', 'B', 'B']);
    });
  });

Bdd(feature)
  .scenario('pollingKeyParams can return an array, compared by its contents.')
  .given('An action that polls, and whose pollingKeyParams is an array with a user and a wallet.')
  .when('It is started for 2 different pairs, and then for the first pair again.')
  .then('There are 2 independent pollings, one for each pair.')
  .run(async (_) => {
    const log: string[] = [];

    class Load extends KissAction<State> {
      pollInterval = 100;

      constructor(readonly user: string, readonly wallet: number, readonly poll = Poll.once) { super(); }

      pollingKeyParams() { return [this.user, this.wallet]; }

      createPollingAction() { return new Load(this.user, this.wallet); }

      reduce() {
        log.push(`${this.user}${this.wallet}`);
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Load('A', 1, Poll.start));
      store.dispatch(new Load('A', 2, Poll.start));
      store.dispatch(new Load('A', 1, Poll.start));
      expect(log).toEqual(['A1', 'A2']);

      await elapse(100);
      expect(log).toEqual(['A1', 'A2', 'A1', 'A2']);
    });
  });

Bdd(feature)
  .scenario('computePollingKey can make different action classes share the same polling.')
  .given('Two different action classes that poll, with the same computePollingKey.')
  .when('The first is started, and then the second is started.')
  .then('Starting the second does nothing, since the key is already polling.')
  .and('Stopping the second stops the shared polling.')
  .run(async (_) => {
    const log: string[] = [];

    class PollPrices extends KissAction<State> {
      pollInterval = 100;

      constructor(readonly poll = Poll.once) { super(); }

      computePollingKey() { return 'market-data'; }

      createPollingAction() { return new PollPrices(); }

      reduce() {
        log.push('prices');
        return null;
      }
    }

    class PollVolumes extends KissAction<State> {
      pollInterval = 100;

      constructor(readonly poll = Poll.once) { super(); }

      computePollingKey() { return 'market-data'; }

      createPollingAction() { return new PollVolumes(); }

      reduce() {
        log.push('volumes');
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new PollPrices(Poll.start));
      store.dispatch(new PollVolumes(Poll.start));
      expect(log).toEqual(['prices']);

      await elapse(100);
      expect(log).toEqual(['prices', 'prices']);

      store.dispatch(new PollVolumes(Poll.stop));
      await elapse(500);
      expect(log).toEqual(['prices', 'prices']);
    });
  });

Bdd(feature)
  .scenario('By default, the next tick waits for the previous run to finish.')
  .given('An action that polls every 100 millis, and takes 250 millis to run.')
  .when('The action is dispatched with Poll.start.')
  .then('The interval is counted from the END of each run.')
  .and('The runs never overlap.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      // So the period is 250 + 100 = 350 millis.
      store.dispatch(new Slow(tracker, Poll.start));

      // The immediate run finishes at 250 millis.
      await elapse(249);
      expect(store.state.count).toBe(0);
      await elapse(1); // 250 millis.
      expect(store.state.count).toBe(1);

      // The first tick starts at 350 millis, and finishes at 600 millis.
      await elapse(349); // 599 millis.
      expect(store.state.count).toBe(1);
      await elapse(1); // 600 millis.
      expect(store.state.count).toBe(2);

      // The second tick starts at 700 millis, and finishes at 950 millis.
      await elapse(349); // 949 millis.
      expect(store.state.count).toBe(2);
      await elapse(1); // 950 millis.
      expect(store.state.count).toBe(3);

      expect(tracker.maxRunning).toBe(1);
    });
  });

Bdd(feature)
  .scenario('With pollWaitsForRun false, the ticks happen at a fixed rate.')
  .given('An action that polls every 100 millis, takes 250 millis to run, and has pollWaitsForRun false.')
  .when('The action is dispatched with Poll.start.')
  .then('The interval is counted from the START of each run.')
  .and('The runs overlap.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Slow(tracker, Poll.start, false));

      // Runs start at 0, 100, 200, 300... and finish at 250, 350, 450...
      await elapse(250);
      expect(store.state.count).toBe(1);

      await elapse(100); // 350 millis.
      expect(store.state.count).toBe(2);

      await elapse(100); // 450 millis.
      expect(store.state.count).toBe(3);

      expect(tracker.maxRunning).toBeGreaterThan(1);
    });
  });

Bdd(feature)
  .scenario('Poll.start does nothing while the first run is still in progress.')
  .given('An action that polls, whose first run has not finished yet.')
  .when('The action is dispatched with Poll.start again.')
  .then('It does nothing, since polling is already active.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Slow(tracker, Poll.start));

      await elapse(100);
      store.dispatch(new Slow(tracker, Poll.start));

      // Only the original run finishes, at 250 millis.
      await elapse(150); // 250 millis.
      expect(store.state.count).toBe(1);

      // And a single polling is running: one tick every 350 millis.
      await elapse(350); // 600 millis.
      expect(store.state.count).toBe(2);

      expect(tracker.started).toBe(2);
      expect(tracker.maxRunning).toBe(1);
    });
  });

Bdd(feature)
  .scenario('Poll.stop during a run prevents the next tick.')
  .given('An action that polls, whose first run has not finished yet.')
  .when('The action is dispatched with Poll.stop.')
  .then('The run in progress still finishes.')
  .and('There are no more ticks.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Slow(tracker, Poll.start));

      await elapse(100);
      store.dispatch(new Slow(tracker, Poll.stop));

      await elapse(150); // 250 millis.
      expect(store.state.count).toBe(1);

      await elapse(5000);
      expect(store.state.count).toBe(1);
      expect(tracker.started).toBe(1);
    });
  });

Bdd(feature)
  .scenario('Poll.runNowAndRestart during a run does not duplicate the polling.')
  .given('An action that polls, whose first run has not finished yet.')
  .when('The action is dispatched with Poll.runNowAndRestart.')
  .then('Both runs finish.')
  .and('Only the new polling keeps ticking.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Slow(tracker, Poll.start));

      // The restarted run finishes at 50 + 250 = 300 millis.
      await elapse(50);
      store.dispatch(new Slow(tracker, Poll.runNowAndRestart));

      // The first run still finishes at 250 millis.
      await elapse(200); // 250 millis.
      expect(store.state.count).toBe(1);

      await elapse(50); // 300 millis.
      expect(store.state.count).toBe(2);

      // Only the new polling ticks: at 400 millis, finishing at 650 millis.
      await elapse(349); // 649 millis.
      expect(store.state.count).toBe(2);
      await elapse(1); // 650 millis.
      expect(store.state.count).toBe(3);

      expect(tracker.started).toBe(3);
    });
  });

Bdd(feature)
  .scenario('With pollWaitsForRun false, Poll.stop prevents new ticks.')
  .given('An action that polls at a fixed rate, with runs overlapping.')
  .when('The action is dispatched with Poll.stop, while runs are in progress.')
  .then('The runs in progress still finish.')
  .and('No new runs start.')
  .run(async (_) => {
    const tracker = new Tracker();
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Slow(tracker, Poll.start, false));

      // Runs started at 0 and 100 millis. The tick at 200 millis is cancelled.
      await elapse(150);
      store.dispatch(new Slow(tracker, Poll.stop, false));

      await elapse(100); // 250 millis.
      expect(store.state.count).toBe(1);

      await elapse(100); // 350 millis.
      expect(store.state.count).toBe(2);

      await elapse(5000);
      expect(store.state.count).toBe(2);
      expect(tracker.started).toBe(2);
    });
  });

Bdd(feature)
  .scenario('Failed runs do not stop the polling.')
  .given('An action that polls every 100 millis, and fails.')
  .when('The ticks keep failing, and then start succeeding.')
  .then('The polling keeps going, and the state changes once the runs succeed.')
  .example(val('Wait for run', true))
  .example(val('Wait for run', false))
  .run(async (ctx) => {
    const waitsForRun: boolean = ctx.example.val('Wait for run');
    const tracker = new Tracker();
    tracker.fail = true;

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      // Each run takes 50 millis. When waiting for the runs, they start at 0, 150, 300...
      // Otherwise, they start at 0, 100, 200, 300...
      store.dispatch(new Tracked(tracker, Poll.start, waitsForRun));

      // The first run failed at 50 millis, and the next one didn't start yet.
      await elapse(75);
      expect(store.isFailed(Tracked)).toBe(true);

      await elapse(245); // 320 millis.
      expect(tracker.started).toBe(waitsForRun ? 3 : 4);
      expect(tracker.errors).toBe(waitsForRun ? 2 : 3);
      expect(store.state.count).toBe(0);

      // Now the runs start succeeding.
      tracker.fail = false;
      await elapse(30); // 350 millis.
      expect(store.state.count).toBe(1);

      // When waiting for the runs, the next run finishes at 500 millis. Otherwise, at 450 millis.
      await elapse(150); // 500 millis.
      expect(store.state.count).toBe(2);
    });
  });

Bdd(feature)
  .scenario('If the immediate run of Poll.start fails, the polling is started anyway.')
  .given('An action that polls every 100 millis, and fails.')
  .when('The action is dispatched with Poll.start, and its run fails.')
  .then('The polling is active, so Poll.start does nothing.')
  .and('The next ticks run.')
  .run(async (_) => {
    const tracker = new Tracker();
    tracker.fail = true;

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      const action = new Tracked(tracker, Poll.start);
      store.dispatch(action);

      await elapse(50);
      expect(action.status.originalError).toBeInstanceOf(UserException);

      tracker.fail = false;
      store.dispatch(new Tracked(tracker, Poll.start));
      expect(tracker.started).toBe(1);

      // The tick starts at 150 millis, and finishes at 200 millis.
      await elapse(150); // 200 millis.
      expect(store.state.count).toBe(1);
      expect(tracker.started).toBe(2);
    });
  });

Bdd(feature)
  .scenario('stopAllPolling stops all the polling at once.')
  .given('Two different action classes that are polling.')
  .when('Some action calls stopAllPolling.')
  .then('There are no more ticks.')
  .run(async (_) => {
    class CountToo extends Count {
      createPollingAction() { return new CountToo(); }
    }

    class StopAll extends KissAction<State> {
      reduce() {
        this.stopAllPolling();
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      store.dispatch(new CountToo(Poll.start));
      expect(store.state.count).toBe(2);

      store.dispatch(new StopAll());
      await elapse(500);
      expect(store.state.count).toBe(2);
      expect(jest.getTimerCount()).toBe(0);

      // The polling can be started again.
      store.dispatch(new Count(Poll.start));
      await elapse(100);
      expect(store.state.count).toBe(4);
    });
  });

Bdd(feature)
  .scenario('Shutting down the store stops all the polling.')
  .given('An action that is polling.')
  .when('The store is shut down, and then turned on again.')
  .then('There are no more ticks.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Count(Poll.start));
      expect(store.state.count).toBe(1);

      store.setShutDown(true);
      store.setShutDown(false);

      await elapse(500);
      expect(store.state.count).toBe(1);
      expect(jest.getTimerCount()).toBe(0);
    });
  });

Bdd(feature)
  .scenario('The custom wrapReduce of a polling action wraps its reducer.')
  .given('An action that polls, and has a custom wrapReduce.')
  .when('The action is dispatched with Poll.start, and then with Poll.stop.')
  .then('The wrapReduce wraps the reducer when it runs.')
  .run(async (_) => {
    const log: string[] = [];

    class Wrapped extends Count {
      createPollingAction() { return new Wrapped(); }

      wrapReduce(reduce: () => ReduxReducer<State>): () => ReduxReducer<State> {
        return () => {
          log.push(`wrap ${this.poll}`);
          return reduce();
        };
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Wrapped(Poll.start));
      await elapse(100);
      store.dispatch(new Wrapped(Poll.stop));

      expect(store.state.count).toBe(2);
      expect(log).toEqual(['wrap start', 'wrap once']);
    });
  });

Bdd(feature)
  .scenario('Throttling the polling controller may prevent stopping the polling.')
  .given('An action that polls, and also uses throttle.')
  .when('The action is dispatched with Poll.stop, inside the throttle period.')
  .then('The dispatch is aborted, and the polling keeps going.')
  .note('That is why throttle, nonReentrant, fresh, sequential and checkInternet should be added to the tick action instead.')
  .run(async (_) => {
    class Throttled extends Count {
      throttle = 1000;

      createPollingAction() { return new Count(); }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    await withFakeTimers(store, async () => {
      store.dispatch(new Throttled(Poll.start));
      const stop = new Throttled(Poll.stop);
      store.dispatch(stop);
      expect(stop.status.isDispatched).toBe(false);

      await elapse(100);
      expect(store.state.count).toBe(2);
    });
  });

Bdd(feature)
  .scenario('A polling action must override createPollingAction.')
  .given('An action that uses polling, but does not override createPollingAction.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class NoTick extends KissAction<State> {
      constructor(readonly poll: Poll) { super(); }

      reduce() { return null; }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new NoTick(Poll.once))).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('An invalid poll or pollInterval value makes the dispatch throw.')
  .given('An action that uses polling, with an invalid value.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Poll', 'begin'), val('Interval', 100))
  .example(val('Poll', null), val('Interval', 100))
  .example(val('Poll', Poll.start), val('Interval', -1))
  .example(val('Poll', Poll.start), val('Interval', NaN))
  .example(val('Poll', Poll.start), val('Interval', '100'))
  .run(async (ctx) => {
    const poll = ctx.example.val('Poll');
    const pollInterval = ctx.example.val('Interval');

    class Invalid extends Count {
      poll = poll;
      pollInterval = pollInterval;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new Invalid())).toThrow(StoreException);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Polling can not be combined with retry or debounce.')
  .given('An action that uses polling, and also uses retry or debounce.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'debounce'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature');

    class WithRetry extends Count {
      retry = { on: true };
    }

    class WithDebounce extends Count {
      debounce = true;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    const action = (feature === 'retry') ? new WithRetry(Poll.start) : new WithDebounce(Poll.start);
    expect(() => store.dispatch(action)).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('An OptimisticCommand can not use polling.')
  .given('An OptimisticCommand that uses polling.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class Command extends OptimisticCommand<State, number> {
      poll = Poll.start;

      createPollingAction() { return new Count(); }

      optimisticValue() { return 1; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer() { return null; }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new Command())).toThrow(StoreException);
  });
