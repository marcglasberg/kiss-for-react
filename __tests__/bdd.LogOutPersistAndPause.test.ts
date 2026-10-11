import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('persistAndPausePersistor during logOut');

type State = { n: number };

/**
 * A persistor that keeps the saved state in memory, and records its calls. Each save takes
 * `delay` milliseconds (read when the save starts). Its throttle is 1 second, so that a state
 * change is not saved right away.
 */
class SlowPersistor extends Persistor<State> {
  stored: State | null = null;
  calls: string[] = [];
  delay = 0;

  async readState() {
    return null;
  }

  async deleteState() {
    this.calls.push('delete');
    this.stored = null;
  }

  async persistDifference(_last: State | null, newState: State) {
    const delay = this.delay;
    this.calls.push(`save start ${newState.n}`);
    await delayMillis(delay);
    this.stored = newState;
    this.calls.push(`save end ${newState.n}`);
  }

  get throttle() {
    return 1000;
  }
}

class SetN extends KissAction<State> {
  constructor(readonly n: number) {
    super();
  }

  reduce() {
    return {n: this.n};
  }
}

// Creates a store with the given persistor. The old user's state `{n: 7}` is not saved yet,
// since it's waiting for the throttle of the persistor.
async function createStoreWithUnsavedState(persistor: SlowPersistor): Promise<Store<State>> {
  const store = new Store<State>({initialState: {n: 0}, logger: null, persistor});
  await store.ready();
  store.dispatch(new SetN(7));
  await delayMillis(1);
  persistor.calls = [];
  return store;
}

Bdd(feature)
  .scenario('persistAndPausePersistor during logOut does not save the state of the previous user.')
  .given('A store with a persistor, and a state of the previous user that is not saved yet.')
  .and('A save of the previous user\'s state would take [Old save] ms, and a save of the initial-state 0 ms.')
  .when('logOut is called, and while it waits for its throttle, persistAndPausePersistor is called.')
  .then('The state of the previous user is never saved.')
  .and('The saved state, and the last persisted state, are the initial-state of logOut.')
  .and('When persistAndPausePersistor finishes, the initial-state of logOut is already saved.')
  .example(val('Old save', 60))
  .example(val('Old save', 0))
  .run(async (ctx) => {
    const persistor = new SlowPersistor();
    const store = await createStoreWithUnsavedState(persistor);
    let storedWhenPersistAndPauseFinished: State | null = null;

    persistor.delay = ctx.example.val('Old save');
    const logOut = store.logOut({initialState: {n: 0}, throttle: 20, actionsThrottle: 0});
    await delayMillis(5);
    const persistAndPause = store.persistAndPausePersistor()
      .then(() => storedWhenPersistAndPauseFinished = persistor.stored);
    await delayMillis(1);
    persistor.delay = 0;

    await Promise.all([logOut, persistAndPause]);
    await delayMillis(100);

    expect(persistor.calls).not.toContain('save start 7');
    expect(persistor.stored).toEqual({n: 0});
    expect(store.getLastPersistedStateFromPersistor()).toEqual({n: 0});
    expect(store.state).toEqual({n: 0});
    expect(storedWhenPersistAndPauseFinished).toEqual({n: 0});
  });

Bdd(feature)
  .scenario('After persistAndPausePersistor is called during logOut, the persistor stays paused after logOut.')
  .given('A store with a persistor.')
  .and('persistAndPausePersistor was called while logOut was running.')
  .when('logOut finishes, and then the state changes.')
  .then('The new state is not saved, since the persistor is paused.')
  .and('When persistAndPausePersistor is called again, the new state is saved.')
  .run(async (_) => {
    const persistor = new SlowPersistor();
    const store = await createStoreWithUnsavedState(persistor);

    const logOut = store.logOut({initialState: {n: 0}, throttle: 20, actionsThrottle: 0});
    await delayMillis(5);
    const persistAndPause = store.persistAndPausePersistor();
    await Promise.all([logOut, persistAndPause]);

    store.dispatch(new SetN(3));
    await delayMillis(20);
    expect(persistor.stored).toEqual({n: 0});

    await store.persistAndPausePersistor();
    expect(persistor.stored).toEqual({n: 3});
  });

Bdd(feature)
  .scenario('A logOut waits for the save of another logOut, before deleting and saving its initial-state.')
  .given('A store with a persistor.')
  .and('A 1st logOut, whose save of its initial-state {n: 1} takes 60 ms.')
  .when('A 2nd logOut, with initial-state {n: 2}, runs at the same time, and its save takes 0 ms.')
  .then('The 2nd logOut deletes and saves only after the save of the 1st one finishes.')
  .and('The saved state is the initial-state of the 2nd logOut, which is also the store state.')
  .run(async (_) => {
    const persistor = new SlowPersistor();
    const store = await createStoreWithUnsavedState(persistor);

    persistor.delay = 60;
    const logOut1 = store.logOut({initialState: {n: 1}, throttle: 0, actionsThrottle: 0});
    const logOut2 = store.logOut({initialState: {n: 2}, throttle: 10, actionsThrottle: 0});
    await delayMillis(5);
    persistor.delay = 0;
    await Promise.all([logOut1, logOut2]);
    await delayMillis(100);

    expect(persistor.calls).toEqual(['delete', 'save start 1', 'save end 1', 'delete', 'save start 2', 'save end 2']);
    expect(persistor.stored).toEqual({n: 2});
    expect(store.state).toEqual({n: 2});
    expect(store.getLastPersistedStateFromPersistor()).toEqual({n: 2});
  });
