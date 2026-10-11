import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Poll, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Polling is stopped while its action is in an async before');

class State {
  constructor(readonly user: string) {
  }
}

// Counts the ticks of the polling.
class Counter {
  ticks = 0;
}

// The polling tick. Counts itself, and doesn't change the state.
class Tick extends KissAction<State> {
  constructor(readonly counter: Counter) {
    super();
  }

  reduce() {
    this.counter.ticks++;
    return null;
  }
}

// Starts or restarts polling every 20 millis. Its `before()` takes 30 millis.
class PollTicks extends KissAction<State> {
  pollInterval = 20;

  constructor(readonly counter: Counter, readonly poll: Poll) {
    super();
  }

  async before() {
    await delayMillis(30);
  }

  createPollingAction() {
    return new Tick(this.counter);
  }

  reduce() {
    return null;
  }
}

function pollValue(name: string): Poll {
  switch (name) {
    case 'Poll.start':
      return Poll.start;
    case 'Poll.runNowAndRestart':
      return Poll.runNowAndRestart;
    default:
      throw new Error(`Unknown poll: ${name}`);
  }
}

// Stops all polling in the given way.
async function stopAllPolling(store: Store<State>, how: string): Promise<void> {
  switch (how) {
    case 'clearInternalActionProps()':
      store.clearInternalActionProps();
      break;
    case 'setShutDown(true), and then setShutDown(false)':
      store.setShutDown(true);
      await delayMillis(50);
      store.setShutDown(false);
      break;
    case 'logOut()':
      await store.logOut({initialState: new State(''), throttle: 0, actionsThrottle: 1000});
      break;
    default:
      throw new Error(`Unknown way: ${how}`);
  }
}

Bdd(feature)
  .scenario('Polling does not start if it was stopped while its action was in an async before.')
  .given('An action that starts polling with [Poll], and whose before() is async.')
  .and('The action was dispatched, and is still in its before().')
  .when('All polling is stopped with [How].')
  .then('After the action finishes, the polling does not start.')
  .and('The action finishes as aborted.')
  .example(val('Poll', 'Poll.start'), val('How', 'clearInternalActionProps()'))
  .example(val('Poll', 'Poll.start'), val('How', 'setShutDown(true), and then setShutDown(false)'))
  .example(val('Poll', 'Poll.start'), val('How', 'logOut()'))
  .example(val('Poll', 'Poll.runNowAndRestart'), val('How', 'clearInternalActionProps()'))
  .example(val('Poll', 'Poll.runNowAndRestart'), val('How', 'setShutDown(true), and then setShutDown(false)'))
  .example(val('Poll', 'Poll.runNowAndRestart'), val('How', 'logOut()'))
  .run(async (ctx) => {
    const store = new Store<State>({initialState: new State('bob'), logger: null});
    const counter = new Counter();

    const action = new PollTicks(counter, pollValue(ctx.example.val('Poll')));
    const promise = store.dispatchAndWait(action);
    await delayMillis(5);

    await stopAllPolling(store, ctx.example.val('How'));
    const status = await promise;

    counter.ticks = 0;
    await delayMillis(150);
    const ticks = counter.ticks;

    // Stops any polling left, so that its timers don't keep running after the test.
    store.clearInternalActionProps();

    expect(ticks).toBe(0);
    expect(status.isDispatchAborted).toBe(true);
  });

Bdd(feature)
  .scenario('An action dispatched after all polling was stopped can start polling again.')
  .given('All polling was stopped with clearInternalActionProps().')
  .when('An action that starts polling with [Poll], and whose before() is async, is dispatched.')
  .then('The polling starts, and ticks.')
  .example(val('Poll', 'Poll.start'))
  .example(val('Poll', 'Poll.runNowAndRestart'))
  .run(async (ctx) => {
    const store = new Store<State>({initialState: new State('bob'), logger: null});
    const counter = new Counter();
    store.clearInternalActionProps();

    const status = await store.dispatchAndWait(new PollTicks(counter, pollValue(ctx.example.val('Poll'))));
    await delayMillis(150);
    store.clearInternalActionProps();

    expect(status.isCompletedOk).toBe(true);
    expect(counter.ticks).toBeGreaterThanOrEqual(3);
  });
