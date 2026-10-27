import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Poll, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Stopping polling while a start is pending');

class Gate {
  open!: () => void;
  readonly promise = new Promise<void>(resolve => this.open = resolve);
}

class Work {
  ticks = 0;
  preparations = 0;
}

class Tick extends KissAction<number> {
  constructor(readonly work: Work) { super(); }

  reduce() {
    this.work.ticks++;
    return this.state + 1;
  }
}

// Polls every 100 millis. When given a `preparation` gate, its `before()` waits for the gate.
class PollTicks extends KissAction<number> {
  pollInterval = 100;

  constructor(readonly work: Work, readonly poll: Poll, readonly preparation?: Gate) { super(); }

  before(): void | Promise<void> {
    if (this.preparation) {
      this.work.preparations++;
      return this.preparation.promise;
    }
  }

  createPollingAction() { return new Tick(this.work); }
  reduce() { return null; }
}

// Like `PollTicks`, but its immediate run is async: it waits for the `run` gate, and then adds
// 10 to the state.
class PollTicksAsyncRun extends KissAction<number> {
  pollInterval = 100;

  constructor(readonly work: Work, readonly poll: Poll, readonly run: Gate) { super(); }

  createPollingAction() { return new Tick(this.work); }

  async reduce() {
    await this.run.promise;
    return (state: number) => state + 10;
  }
}

// Like `PollTicks`, but each `name` has its own polling key.
class PollNamedTicks extends KissAction<number> {
  pollInterval = 100;

  constructor(readonly name: string, readonly work: Work, readonly poll: Poll, readonly preparation?: Gate) { super(); }

  pollingKeyParams() { return this.name; }

  before(): void | Promise<void> {
    if (this.preparation) return this.preparation.promise;
  }

  createPollingAction() { return new Tick(this.work); }
  reduce() { return null; }
}

class StopAll extends KissAction<number> {
  reduce() {
    this.stopAllPolling();
    return null;
  }
}

async function stopPolling(store: Store<number>, work: Work, method: string): Promise<void> {
  if (method === 'Poll.stop') await store.dispatchAndWait(new PollTicks(work, Poll.stop));
  else if (method === 'stopAllPolling()') await store.dispatchAndWait(new StopAll());
  else throw new Error(`Unknown polling stop method: ${method}`);
}

Bdd(feature)
  .scenario('Stopping polling prevents an earlier pending start from creating new ticks.')
  .given('An action with [Start] is waiting for its asynchronous before method, and no polling tick has run.')
  .when('Polling is stopped with [Stop], and the pending before method then finishes.')
  .and('Three polling intervals pass.')
  .then('The pending action has finished as aborted, and no action remains in progress.')
  .and('No polling tick has run, and the state has not changed.')
  .example(val('Start', Poll.start), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.start), val('Stop', 'stopAllPolling()'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'stopAllPolling()'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<number>({ initialState: 0, logger: null });
    const work = new Work();
    const preparation = new Gate();
    const action = new PollTicks(work, ctx.example.val('Start'), preparation);

    try {
      const done = store.dispatchAndWait(action);
      expect(work.preparations).toBe(1);
      expect(store.isWaiting(PollTicks)).toBe(true);
      expect(work.ticks).toBe(0);

      await stopPolling(store, work, ctx.example.val('Stop'));
      preparation.open();
      const status = await done;
      await jest.advanceTimersByTimeAsync(300);

      expect(status.isCompleted).toBe(true);
      expect(status.isDispatchAborted).toBe(true);
      expect(action.isAborted).toBe(true);
      expect(store.actionsInProgress().size).toBe(0);
      expect(store.isFailed(PollTicks)).toBe(false);
      expect(store.isFailed(Tick)).toBe(false);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 0, state: 0 });
    } finally {
      preparation.open();
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Stopping polling while the immediate run of a start is in progress lets that run finish, but stops the ticks.')
  .given('An action with [Start] has started polling, and its immediate run is still in progress.')
  .when('Polling is stopped with [Stop], and the immediate run then finishes.')
  .and('Three polling intervals pass.')
  .then('The immediate run has changed the state, and the action has completed with no error.')
  .and('No polling tick has run.')
  .example(val('Start', Poll.start), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.start), val('Stop', 'stopAllPolling()'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'stopAllPolling()'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<number>({ initialState: 0, logger: null });
    const work = new Work();
    const run = new Gate();
    const action = new PollTicksAsyncRun(work, ctx.example.val('Start'), run);

    try {
      const done = store.dispatchAndWait(action);
      expect(store.isWaiting(PollTicksAsyncRun)).toBe(true);

      // `PollTicks` with `Poll.stop` has the same polling key as `PollTicksAsyncRun`, since
      // both use the default key, which is the class. So we stop `PollTicksAsyncRun` directly.
      if (ctx.example.val('Stop') === 'Poll.stop')
        await store.dispatchAndWait(new PollTicksAsyncRun(work, Poll.stop, run));
      else
        await store.dispatchAndWait(new StopAll());

      run.open();
      const status = await done;
      await jest.advanceTimersByTimeAsync(300);

      expect(status.isCompletedOk).toBe(true);
      expect(store.actionsInProgress().size).toBe(0);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 0, state: 10 });
    } finally {
      run.open();
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Stopping the polling of another key does not affect a pending start.')
  .given('An action with [Start] for the polling key "prices" is waiting for its asynchronous before method.')
  .when('Polling is stopped with Poll.stop for the polling key "balance", and the pending before method then finishes.')
  .and('One polling interval passes.')
  .then('The pending action has completed with no error, and polling for "prices" has started.')
  .and('One polling tick has run, and the state has changed.')
  .example(val('Start', Poll.start))
  .example(val('Start', Poll.runNowAndRestart))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<number>({ initialState: 0, logger: null });
    const work = new Work();
    const preparation = new Gate();
    const action = new PollNamedTicks('prices', work, ctx.example.val('Start'), preparation);

    try {
      const done = store.dispatchAndWait(action);
      expect(store.isWaiting(PollNamedTicks)).toBe(true);

      await store.dispatchAndWait(new PollNamedTicks('balance', work, Poll.stop));
      preparation.open();
      const status = await done;
      await jest.advanceTimersByTimeAsync(100);

      expect(status.isCompletedOk).toBe(true);
      expect(action.isAborted).toBe(false);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 1, state: 1 });
    } finally {
      preparation.open();
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('A start dispatched after polling was stopped is not affected by that stop.')
  .given('Polling was stopped with [Stop].')
  .when('An action with [Start] is dispatched, and waits for its asynchronous before method.')
  .and('The before method finishes, and one polling interval passes.')
  .then('The action has completed with no error, and polling has started.')
  .and('One polling tick has run, and the state has changed.')
  .example(val('Start', Poll.start), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.start), val('Stop', 'stopAllPolling()'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'Poll.stop'))
  .example(val('Start', Poll.runNowAndRestart), val('Stop', 'stopAllPolling()'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<number>({ initialState: 0, logger: null });
    const work = new Work();
    const preparation = new Gate();

    try {
      await stopPolling(store, work, ctx.example.val('Stop'));

      const action = new PollTicks(work, ctx.example.val('Start'), preparation);
      const done = store.dispatchAndWait(action);
      expect(store.isWaiting(PollTicks)).toBe(true);

      preparation.open();
      const status = await done;
      await jest.advanceTimersByTimeAsync(100);

      expect(status.isCompletedOk).toBe(true);
      expect(action.isAborted).toBe(false);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 1, state: 1 });
    } finally {
      preparation.open();
      await store.dispose();
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('Active polling can be stopped and then started by a new action.')
  .given('Polling is active, and one tick has updated the state.')
  .when('Polling is stopped with [Stop], and three polling intervals pass.')
  .and('A new action starts polling, and one polling interval passes.')
  .and('Polling is stopped again with [Stop], and three polling intervals pass.')
  .then('No tick runs during either stopped period, and the state stays unchanged during those periods.')
  .and('The new start causes exactly one new tick to run and update the state.')
  .and('No action remains in progress after polling is stopped again.')
  .example(val('Stop', 'Poll.stop'))
  .example(val('Stop', 'stopAllPolling()'))
  .run(async (ctx) => {
    jest.useFakeTimers();
    const store = new Store<number>({ initialState: 0, logger: null });
    const work = new Work();

    try {
      await store.dispatchAndWait(new PollTicks(work, Poll.start));
      await jest.advanceTimersByTimeAsync(100);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 1, state: 1 });

      await stopPolling(store, work, ctx.example.val('Stop'));
      await jest.advanceTimersByTimeAsync(300);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 1, state: 1 });

      const restarted = await store.dispatchAndWait(new PollTicks(work, Poll.start));
      await jest.advanceTimersByTimeAsync(100);
      expect(restarted.isCompletedOk).toBe(true);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 2, state: 2 });

      await stopPolling(store, work, ctx.example.val('Stop'));
      await jest.advanceTimersByTimeAsync(300);
      expect({ ticks: work.ticks, state: store.state }).toEqual({ ticks: 2, state: 2 });
      expect(store.actionsInProgress().size).toBe(0);
      expect(store.isFailed(PollTicks)).toBe(false);
      expect(store.isFailed(Tick)).toBe(false);
    } finally {
      await store.dispose();
      jest.useRealTimers();
    }
  });
