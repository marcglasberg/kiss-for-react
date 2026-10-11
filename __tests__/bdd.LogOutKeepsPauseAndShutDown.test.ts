import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut keeps the persistor paused and the store shut down');
const logger = (_: any) => {
};

Bdd(feature)
  .scenario('A persistor paused before logOut stays paused after logOut.')
  .given('A store with a persistor, and a state that was changed by actions.')
  .and('The persistor is paused.')
  .when('We call logOut.')
  .then('The persisted state is deleted, and the initial-state is persisted.')
  .and('After logOut, state changes are not persisted, since the persistor is still paused.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(1);
    persistor.record = [];

    store.pausePersistor();
    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });
    expect(persistor.record).toEqual(['delete', 'persist 0']);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.record).toEqual(['delete', 'persist 0']);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('A persistor paused before logOut persists the new state changes when it is resumed after logOut.')
  .given('A store with a persistor that is paused.')
  .and('We called logOut, and then changed the state.')
  .when('The persistor is resumed.')
  .then('The new state is persisted.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    store.pausePersistor();
    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(0);

    store.resumePersistor();
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('A store shut down before logOut stays shut down after logOut.')
  .given('A store with a persistor, and a state that was changed by actions.')
  .and('The store is shut down.')
  .when('We call logOut.')
  .then('The store state is the initial-state, and it is persisted.')
  .and('After logOut, the store still does not accept new actions.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.dispatch(new Increment());
    await delayMillis(10);

    store.setShutDown(true);
    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(0);

    // When the app restarts the store, it accepts new actions again.
    store.setShutDown(false);
    store.dispatch(new Increment());
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Without a persistor, a store shut down before logOut stays shut down after logOut.')
  .given('A store without a persistor, and a state that was changed by actions.')
  .and('The store is shut down.')
  .when('We call logOut.')
  .then('The store state is the initial-state.')
  .and('After logOut, the store still does not accept new actions.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger });
    store.dispatch(new Increment());

    store.setShutDown(true);
    await store.logOut({ initialState: new State(100), throttle: 0, actionsThrottle: 0 });
    expect(store.state.count).toBe(100);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('A persistor paused while logOut is running stays paused after logOut.')
  .given('A store with a persistor.')
  .and('logOut is running.')
  .when('The persistor is paused.')
  .then('After logOut, state changes are not persisted, since the persistor is still paused.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 20, actionsThrottle: 0 });
    store.pausePersistor();
    await logOutPromise;
    expect(persistor.savedState?.count).toBe(0);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('A persistor resumed while logOut is running does not persist the old state.')
  .given('A store with a persistor, and a persisted state.')
  .and('logOut is running, and is deleting the persisted state.')
  .when('The persistor is resumed.')
  .then('The old state is not persisted again. Only the initial-state is persisted.')
  .and('After logOut, the persistor persists the new state changes.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(1);
    persistor.record = [];

    persistor.deleteDelay = 50;
    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 });
    while (!persistor.record.includes('delete')) await delayMillis(1);
    store.resumePersistor();
    await logOutPromise;
    await delayMillis(10);

    expect(persistor.record).toEqual(['delete', 'persist 0']);
    expect(persistor.savedState?.count).toBe(0);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('A store shut down while logOut is running stays shut down after logOut.')
  .given('A store with a persistor.')
  .and('logOut is running.')
  .when('The store is shut down.')
  .then('After logOut, the store state is the initial-state.')
  .and('After logOut, the store still does not accept new actions.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.dispatch(new Increment());

    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 20, actionsThrottle: 0 });
    store.setShutDown(true);
    await logOutPromise;
    expect(store.state.count).toBe(0);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('A store restarted while logOut is running only accepts new actions after logOut.')
  .given('A store with a persistor, that is shut down.')
  .and('logOut is running.')
  .when('The store is restarted (it is no longer shut down).')
  .then('While logOut is running, the store still does not accept new actions.')
  .and('After logOut, the store accepts new actions.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.setShutDown(true);

    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 20, actionsThrottle: 0 });
    store.setShutDown(false);
    store.dispatch(new Increment());
    expect(store.state.count).toBe(0);

    await logOutPromise;
    expect(store.state.count).toBe(0);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('After two logOuts that run at the same time, the store accepts actions and the persistor is not paused.')
  .given('A store with a persistor, that is not shut down, and whose persistor is not paused.')
  .when('We call logOut twice, without waiting for the first one to finish.')
  .then('After both finish, the store state is the initial-state of the last logOut.')
  .and('The store accepts new actions, and they are persisted.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    store.dispatch(new Increment());

    const logOut1 = store.logOut({ initialState: new State(10), throttle: 10, actionsThrottle: 0 });
    const logOut2 = store.logOut({ initialState: new State(20), throttle: 30, actionsThrottle: 0 });
    await Promise.all([logOut1, logOut2]);
    expect(store.state.count).toBe(20);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(21);
    expect(persistor.savedState?.count).toBe(21);
  });

async function createStore(persistor: RecordingPersistor): Promise<Store<State>> {
  const store = new Store<State>({ initialState: new State(0), logger, persistor });
  await store.ready();
  persistor.record = [];
  return store;
}

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class RecordingPersistor extends Persistor<State> {
  savedState: State | null = null;
  record: string[] = [];
  deleteDelay = 0;

  async readState(): Promise<State | null> {
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.record.push('delete');
    if (this.deleteDelay > 0) await delayMillis(this.deleteDelay);
    this.savedState = null;
  }

  async persistDifference(_: State | null, newState: State) {
    this.record.push('persist ' + newState.count);
    this.savedState = newState;
  }

  get throttle(): number | null {
    return 0;
  }
}
