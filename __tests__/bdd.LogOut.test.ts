import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut');
const logger = (_: any) => {
};

Bdd(feature)
  .scenario('After logOut, the store state is the given initial-state.')
  .given('A store with a persistor, and a state that was changed by actions.')
  .when('We call logOut with a new initial-state.')
  .then('When logOut returns, the store state is the initial-state.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    store.dispatch(new Increment());
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);

    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 });
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('logOut deletes the persisted state, and then persists the initial-state.')
  .given('A store with a persistor, and a persisted state.')
  .when('We call logOut.')
  .then('The persisted state is deleted.')
  .and('The initial-state is persisted afterwards.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(1);
    persistor.record = [];

    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 });

    expect(persistor.record).toEqual([
      'delete',
      'persist 0',
    ]);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('logOut waits until all the logout work is done before returning.')
  .given('A store with a slow persistor.')
  .when('We await logOut.')
  .then('It returns only after the throttle, the deletion, and the persistence of the initial-state.')
  .run(async (_) => {
    const persistor = new RecordingPersistor(50);
    const store = await createStore(persistor);

    store.dispatch(new Increment());
    await delayMillis(100);
    expect(persistor.savedState?.count).toBe(1);

    const start = Date.now();
    await store.logOut({ initialState: new State(0), throttle: 100, actionsThrottle: 10 });
    const elapsed = Date.now() - start;

    // Throttle 100 + delete 50 + persist 50.
    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('After logOut, the persistor keeps persisting new state changes.')
  .given('A store with a persistor.')
  .when('We call logOut.')
  .and('Then dispatch an action that changes the state.')
  .then('The new state is persisted.')
  .and('The persistor is not paused.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    store.dispatch(new Increment());
    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 });
    expect(persistor.savedState?.count).toBe(0);

    store.dispatch(new Increment());
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(2);
    expect(persistor.savedState?.count).toBe(2);
    expect((store as any)._processPersistence.isPaused).toBe(false);
  });

Bdd(feature)
  .scenario('During logOut the store does not accept new actions. After logOut it does.')
  .given('A store with a persistor.')
  .when('We dispatch an action while logOut is running.')
  .then('The action is ignored.')
  .and('Actions dispatched after logOut returns are accepted.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    const logOutPromise = store.logOut({ initialState: new State(0), throttle: 50, actionsThrottle: 10 });

    store.dispatch(new Increment());
    expect(store.state.count).toBe(0);

    await logOutPromise;
    expect(store.state.count).toBe(0);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('logOut waits for running actions to finish before deleting the state.')
  .given('A store with a persistor, and an async action that is running.')
  .when('We call logOut with a short throttle and a long actionsThrottle.')
  .then('The state is only deleted after the action finishes.')
  .and('The final store state is the initial-state, not the state the action created.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    persistor.record = [];

    store.dispatch(new SlowIncrement(100));
    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 1000 });

    // The state created by the action is not persisted, since the persistor is paused.
    expect(persistor.record).toEqual([
      'delete',
      'persist 0',
    ]);
    expect(store.state.count).toBe(0);
    expect(store.isWaiting(SlowIncrement)).toBe(false);
    expect(persistor.deletedAfter).toEqual(['action finished']);
  });

Bdd(feature)
  .scenario('logOut does not wait for running actions longer than actionsThrottle.')
  .given('A store with a persistor, and an async action that takes very long.')
  .when('We call logOut with a short actionsThrottle.')
  .then('The state is deleted and logOut returns, without waiting for the action.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);

    store.dispatch(new SlowIncrement(1000));

    const start = Date.now();
    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 50 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('logOut cancels a pending throttled persistence.')
  .given('A store with a persistor that has a throttle.')
  .and('A state change that is waiting for the throttle to persist.')
  .when('We call logOut.')
  .then('The pending state is never persisted.')
  .run(async (_) => {
    const persistor = new RecordingPersistor(0, 200);
    const store = await createStore(persistor);
    persistor.record = [];

    // First change persists right away (throttle window starts), second waits for the timer.
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.record).toEqual(['persist 1']);

    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 });
    await delayMillis(300);

    expect(persistor.record).toEqual([
      'persist 1',
      'delete',
      'persist 0',
    ]);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('logOut called while the state is being persisted waits for that persistence to finish.')
  .given('A store with a slow persistor.')
  .and('A state change that is currently being persisted.')
  .when('We call logOut and await it.')
  .then('The state is only deleted after the ongoing persistence finishes.')
  .and('logOut only returns after the whole logout is done.')
  .run(async (_) => {
    const persistor = new RecordingPersistor(100);
    const store = await createStore(persistor);
    persistor.record = [];

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.record).toEqual(['persist 1']); // Still persisting.

    await store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 });

    expect(persistor.record).toEqual([
      'persist 1',
      'persisted 1',
      'delete',
      'persist 0',
      'persisted 0',
    ]);
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);

    // And persistence still works afterwards.
    store.dispatch(new Increment());
    await delayMillis(150);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('logOut restores the store and the persistor even if deleting the state fails.')
  .given('A store with a persistor whose deleteState throws.')
  .when('We call logOut.')
  .then('logOut rejects with the error.')
  .and('The store accepts actions again, and the persistor is not paused.')
  .run(async (_) => {
    const persistor = new RecordingPersistor();
    const store = await createStore(persistor);
    persistor.failDelete = true;

    await expect(
      store.logOut({ initialState: new State(0), throttle: 10, actionsThrottle: 10 })
    ).rejects.toThrow('delete failed');

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(1);
  });

async function createStore(persistor: RecordingPersistor): Promise<Store<State>> {
  const store = new Store<State>({ initialState: new State(0), logger, persistor });
  // Let the persistor read the (null) state, and save the initial state.
  while (!persistor.initialized) await delayMillis(5);
  // Let the throttle window that starts with the store creation pass.
  await delayMillis(persistor.throttleMillis ?? 0);
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

let lastSlowActionFinished = false;

class SlowIncrement extends KissAction<State> {
  constructor(readonly millis: number) {
    super();
  }

  async reduce() {
    lastSlowActionFinished = false;
    await delayMillis(this.millis);
    lastSlowActionFinished = true;
    return (state: State) => new State(state.count + 1);
  }
}

class RecordingPersistor extends Persistor<State> {
  savedState: State | null = null;
  record: string[] = [];
  deletedAfter: string[] = [];
  failDelete = false;
  initialized = false;

  constructor(readonly delay = 0, readonly throttleMillis: number | null = null) {
    super();
  }

  async readState(): Promise<State | null> {
    await delayMillis(this.delay);
    return this.savedState;
  }

  async saveInitialState(state: State) {
    await delayMillis(this.delay);
    this.savedState = state;
    this.initialized = true;
  }

  async deleteState() {
    if (this.failDelete) throw new Error('delete failed');
    this.record.push('delete');
    if (lastSlowActionFinished) this.deletedAfter.push('action finished');
    await delayMillis(this.delay);
    this.savedState = null;
  }

  async persistDifference(_: State | null, newState: State) {
    this.record.push('persist ' + newState.count);
    if (this.delay > 0) {
      await delayMillis(this.delay);
      this.record.push('persisted ' + newState.count);
    }
    this.savedState = newState;
  }

  get throttle(): number | null {
    return this.throttleMillis;
  }
}
