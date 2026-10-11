import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('A failed saveInitialState is not considered persisted');

Bdd(feature)
  .scenario('At startup, if saving the initial-state fails, nothing is considered persisted.')
  .given('A persistor with no saved state, whose saveInitialState fails.')
  .when('The store starts.')
  .then('The last persisted state is null.')
  .and('The next state change is saved in full (the persistor receives a null last persisted state).')
  .run(async (_) => {
    // Given
    const persistor = new DiffPersistor();
    persistor.failSaveInitial = true;

    // When
    const store = createStore(persistor);
    await store.ready();

    // Then
    expect(persistor.record).toEqual(['saveInitialState 0 (failed)']);
    expect(store.getLastPersistedStateFromPersistor()).toBeNull();

    persistor.failSaveInitial = false;
    store.dispatch(new Increment());
    await delayMillis(10);

    expect(persistor.lastPersistedStates).toEqual([null]);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('If saveInitialStateInPersistence fails, nothing is considered persisted.')
  .given('A store whose initial-state was saved.')
  .and('A persistor whose saveInitialState fails.')
  .when('saveInitialStateInPersistence is called.')
  .then('It rejects.')
  .and('The last persisted state is null.')
  .and('The next state change is saved in full (the persistor receives a null last persisted state).')
  .run(async (_) => {
    // Given
    const persistor = new DiffPersistor();
    const store = createStore(persistor);
    await store.ready();
    expect(persistor.savedState?.count).toBe(0);
    persistor.failSaveInitial = true;

    // When
    await expect(store.saveInitialStateInPersistence(new State(5))).rejects.toThrow('save initial failed');

    // Then
    expect(store.getLastPersistedStateFromPersistor()).toBeNull();

    persistor.failSaveInitial = false;
    store.dispatch(new Increment());
    await delayMillis(10);

    expect(persistor.lastPersistedStates).toEqual([null]);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('If saveInitialStateInPersistence succeeds, the saved state is considered persisted.')
  .given('A store whose initial-state was saved.')
  .when('saveInitialStateInPersistence is called with another state, and succeeds.')
  .then('The last persisted state is that state.')
  .and('The next state change is saved as a difference from that state.')
  .run(async (_) => {
    // Given
    const persistor = new DiffPersistor();
    const store = createStore(persistor);
    await store.ready();

    // When
    const saved = new State(5);
    await store.saveInitialStateInPersistence(saved);

    // Then
    expect(store.getLastPersistedStateFromPersistor()).toBe(saved);

    store.dispatch(new Increment());
    await delayMillis(10);

    expect(persistor.lastPersistedStates).toEqual([saved]);
    expect(persistor.savedState?.count).toBe(1);
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

function createStore(persistor: Persistor<State>): Store<State> {
  return new Store<State>({
    initialState: new State(0),
    logger: (_: any) => {
    },
    logStateChanges: false,
    persistor,
    // Swallows the persistence errors.
    errorObserver: () => null,
  });
}

/**
 * A persistor that records the last persisted state it receives in each `persistDifference`,
 * like a persistor that saves only the differences would use it.
 */
class DiffPersistor extends Persistor<State> {
  savedState: State | null = null;
  record: string[] = [];
  lastPersistedStates: (State | null)[] = [];
  failSaveInitial = false;

  async readState(): Promise<State | null> {
    return this.savedState;
  }

  async saveInitialState(state: State) {
    if (this.failSaveInitial) {
      this.record.push('saveInitialState ' + state.count + ' (failed)');
      throw new Error('save initial failed');
    }
    this.record.push('saveInitialState ' + state.count);
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(lastPersistedState: State | null, newState: State) {
    this.lastPersistedStates.push(lastPersistedState);
    this.savedState = newState;
  }

  get throttle(): number | null {
    return null;
  }
}
