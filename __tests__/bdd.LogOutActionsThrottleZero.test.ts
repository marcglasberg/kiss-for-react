import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut with no time to wait for running actions');
const logger = (_: any) => {
};

class State {
  constructor(readonly count: number) {
  }
}

/** An async action that never finishes. */
class NeverFinishes extends KissAction<State> {
  async reduce() {
    await new Promise<void>(() => {
    });
    return null;
  }
}

/** An async action that calls logOut with the given `actionsThrottle`, and waits for it. */
class LogOutFromAction extends KissAction<State> {
  constructor(readonly actionsThrottle: number) {
    super();
  }

  async reduce() {
    await this.store.logOut({initialState: new State(0), throttle: 0, actionsThrottle: this.actionsThrottle});
    return null;
  }
}

// Returns 'settled' if the given promise settles within 500 ms, or 'still running' otherwise.
function settlesWithin500ms(promise: Promise<any>): Promise<string> {
  return Promise.race([
    promise.then(() => 'settled', () => 'settled'),
    delayMillis(500).then(() => 'still running'),
  ]);
}

Bdd(feature)
  .scenario('logOut does not wait for running actions when actionsThrottle is zero or negative.')
  .given('A store with an action that never finishes.')
  .when('We call logOut with no throttle, and an actionsThrottle of [Actions throttle] ms.')
  .then('logOut finishes right away, without waiting for the action.')
  .and('The store state is the initial-state.')
  .example(val('Actions throttle', 0))
  .example(val('Actions throttle', -1))
  .run(async (ctx) => {
    const store = new Store<State>({initialState: new State(5), logger});
    store.dispatch(new NeverFinishes());
    expect(store.isWaiting(NeverFinishes)).toBe(true);

    const start = Date.now();
    const result = await settlesWithin500ms(
      store.logOut({initialState: new State(0), throttle: 0, actionsThrottle: ctx.example.val('Actions throttle')}));

    expect(result).toBe('settled');
    expect(Date.now() - start).toBeLessThan(100);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('An action can call logOut with an actionsThrottle of zero, and wait for it.')
  .given('An action that calls logOut with no throttle and an actionsThrottle of 0 ms, and waits for it.')
  .when('The action is dispatched, and we wait for it.')
  .then('logOut finishes right away, even though the action calling it is still running.')
  .and('The action finishes (as aborted, since it was dispatched before logOut).')
  .and('The store state is the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(5), logger});
    const action = new LogOutFromAction(0);

    const start = Date.now();
    const result = await settlesWithin500ms(store.dispatchAndWait(action));

    expect(result).toBe('settled');
    expect(Date.now() - start).toBeLessThan(100);
    expect(action.status.isCompleted).toBe(true);
    expect(action.status.isDispatchAborted).toBe(true);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('logOut still waits for running actions when actionsThrottle is positive, but at most actionsThrottle.')
  .given('A store with an action that never finishes.')
  .when('We call logOut with no throttle, and an actionsThrottle of 100 ms.')
  .then('logOut finishes after about 100 ms.')
  .and('The store state is the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(5), logger});
    store.dispatch(new NeverFinishes());

    const start = Date.now();
    const result = await settlesWithin500ms(
      store.logOut({initialState: new State(0), throttle: 0, actionsThrottle: 100}));
    const elapsed = Date.now() - start;

    expect(result).toBe('settled');
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(400);
    expect(store.state.count).toBe(0);
  });
