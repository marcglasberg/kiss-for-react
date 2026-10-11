import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut without a persistor');
const logger = (_: any) => {
};

Bdd(feature)
  .scenario('Without a persistor, logOut returns the store state to the given initial-state.')
  .given('A store without a persistor, and a state that was changed by actions.')
  .when('We call logOut with a new initial-state.')
  .then('When logOut returns, the store state is the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger });
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);

    await store.logOut({ initialState: new State(100), throttle: 0, actionsThrottle: 0 });

    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('Without a persistor, logOut waits for the throttle before returning.')
  .given('A store without a persistor.')
  .when('We await logOut with some throttle.')
  .then('It returns only after the throttle, and the state is the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(5), logger });

    const start = Date.now();
    await store.logOut({ initialState: new State(0), throttle: 100, actionsThrottle: 10 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Without a persistor, during logOut the store does not accept new actions. After logOut it does.')
  .given('A store without a persistor.')
  .when('We dispatch an action while logOut is running.')
  .then('The action is ignored.')
  .and('Actions dispatched after logOut returns are accepted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(5), logger });

    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 50, actionsThrottle: 10 });

    store.dispatch(new Increment());
    expect(store.state.count).toBe(5);

    await logOutPromise;
    expect(store.state.count).toBe(0);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Without a persistor, logOut waits for running actions to finish before resetting the state.')
  .given('A store without a persistor, and an async action that is running.')
  .when('We call logOut with a short throttle and a long actionsThrottle.')
  .then('logOut returns only after the action finishes.')
  .and('The final store state is the initial-state, not the state the action created.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(5), logger });

    store.dispatch(new SlowIncrement(100));
    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 1000 });

    expect(store.isWaiting(SlowIncrement)).toBe(false);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Without a persistor, logOut does not wait for running actions longer than actionsThrottle.')
  .given('A store without a persistor, and an async action that takes very long.')
  .when('We call logOut with a short actionsThrottle.')
  .then('logOut returns without waiting for the action, and the state is the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(5), logger });

    store.dispatch(new SlowIncrement(1000));

    const start = Date.now();
    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(store.isWaiting(SlowIncrement)).toBe(true);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Without a persistor, logOut clears the internal action props, so fresh actions run again.')
  .given('A store without a persistor.')
  .and('An action with fresh, that was dispatched, and whose data is still fresh.')
  .when('We call logOut.')
  .and('The action with fresh is dispatched again.')
  .then('It runs again, even though its fresh period has not ended.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger });

    store.dispatch(new LoadFresh(1));
    store.dispatch(new LoadFresh(10)); // Aborted, since it's still fresh.
    expect(store.state.count).toBe(1);

    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });

    store.dispatch(new LoadFresh(100));
    expect(store.state.count).toBe(100);
  });

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class SlowIncrement extends KissAction<State> {
  constructor(readonly millis: number) {
    super();
  }

  async reduce() {
    await delayMillis(this.millis);
    return (state: State) => new State(state.count + 1);
  }
}

// Adds `value` to the count, and keeps its data fresh for 5 seconds.
class LoadFresh extends KissAction<State> {
  fresh = 5000;

  constructor(readonly value: number) {
    super();
  }

  reduce() {
    return new State(this.state.count + this.value);
  }
}
