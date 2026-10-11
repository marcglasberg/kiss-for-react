import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store, UpdateStateAction } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut and dispatchWhen');

class State {
  constructor(readonly user: string | null, readonly n: number = 0) {
  }
}

/** A persistor that keeps the saved state in memory. */
class MemPersistor extends Persistor<State> {
  stored: State | null = null;

  async readState() {
    return null;
  }

  async deleteState() {
    this.stored = null;
  }

  async persistDifference(_last: State | null, newState: State) {
    this.stored = newState;
  }

  get throttle() {
    return 0;
  }
}

/** Sets the user, synchronously. */
class SetUser extends KissAction<State> {
  constructor(readonly user: string | null) {
    super();
  }

  reduce() {
    return new State(this.user, this.state.n);
  }
}

/** Sets `n`, synchronously. */
class SetN extends KissAction<State> {
  constructor(readonly n: number) {
    super();
  }

  reduce() {
    return new State(this.state.user, this.n);
  }
}

const logOut = (store: Store<State>) =>
  store.logOut({initialState: new State(null), throttle: 0, actionsThrottle: 0});

Bdd(feature)
  .scenario('A dispatchWhen met by the state that logOut applies is not dispatched.')
  .given('A store with a persistor, and the user "bob" logged in.')
  .and('A dispatchWhen, to log in "bob" again when there is no user.')
  .and('The store [Shut down].')
  .when('logOut runs, and changes the state to the initial-state, with no user.')
  .then('The dispatchWhen action is not dispatched.')
  .and('The state is the initial-state of logOut.')
  .and('The persisted state is the initial-state of logOut.')
  .example(val('Shut down', 'is not shut down'))
  .example(val('Shut down', 'was shut down before logOut'))
  .run(async (ctx) => {
    const persistor = new MemPersistor();
    const store = new Store<State>({initialState: new State('bob'), logger: null, persistor});
    await store.ready();

    const login = new SetUser('bob');
    store.dispatchWhen(login, (state) => state.user === null, {timeoutMillis: 0});
    if (ctx.example.val('Shut down') === 'was shut down before logOut') store.setShutDown(true);

    await logOut(store);
    await delayMillis(20);

    expect(login.status.isDispatched).toBe(false);
    expect(store.state).toEqual(new State(null));
    expect(persistor.stored).toEqual(new State(null));
  });

Bdd(feature)
  .scenario('Actions dispatched by the [Observer] while logOut applies its state are not dispatched.')
  .given('A [Observer] that dispatches an action to log in "bob", when logOut applies its state.')
  .when('logOut runs, and changes the state to the initial-state, with no user.')
  .then('The action dispatched by the [Observer] is not dispatched.')
  .and('The state is the initial-state of logOut.')
  .example(val('Observer', 'stateObserver'))
  .example(val('Observer', 'actionObserver'))
  .run(async (ctx) => {
    const login = new SetUser('bob');
    const dispatchLogin = (action: KissAction<State>) => {
      if (action instanceof UpdateStateAction && !login.status.isDispatched) store.dispatch(login);
    };

    const store: Store<State> = new Store<State>({
      initialState: new State('bob'),
      logger: null,
      stateObserver: ctx.example.val('Observer') === 'stateObserver'
        ? (action) => dispatchLogin(action)
        : undefined,
      actionObserver: ctx.example.val('Observer') === 'actionObserver'
        ? (action, _dispatchCount, ini) => {
          if (ini) dispatchLogin(action);
        }
        : undefined,
    });

    await logOut(store);

    expect(login.status.isDispatched).toBe(false);
    expect(store.state).toEqual(new State(null));
  });

Bdd(feature)
  .scenario('A dispatchWhen called before logOut is cancelled by logOut.')
  .given('A dispatchWhen, called before logOut, to dispatch an action when n is 5.')
  .and('It has a timeout of 50 ms, and an onTimeout.')
  .when('logOut runs and finishes, and then the state changes to n = 5.')
  .then('The dispatchWhen action is not dispatched.')
  .and('The onTimeout is not called, even after the timeout.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State('bob'), logger: null});

    const child = new SetN(7);
    let timeouts = 0;
    store.dispatchWhen(child, (state) => state.n === 5, {timeoutMillis: 50, onTimeout: () => timeouts++});

    await logOut(store);
    store.dispatch(new SetN(5));
    await delayMillis(100);

    expect(child.status.isDispatched).toBe(false);
    expect(store.state.n).toBe(5);
    expect(timeouts).toBe(0);
  });

Bdd(feature)
  .scenario('A dispatchWhen called after logOut works normally.')
  .given('A logOut that already finished.')
  .and('A dispatchWhen, to dispatch an action when n is 5.')
  .when('The state changes to n = 5.')
  .then('The dispatchWhen action is dispatched.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State('bob'), logger: null});
    await logOut(store);

    const child = new SetN(7);
    store.dispatchWhen(child, (state) => state.n === 5, {timeoutMillis: 0});
    store.dispatch(new SetN(5));

    expect(child.status.isDispatched).toBe(true);
    expect(store.state.n).toBe(7);
  });
