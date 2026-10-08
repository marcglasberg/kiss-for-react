import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, Persistor } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Persistor  ');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('There is no persisted state. ' +
    'State changes are persisted by a SYNC persistor.')
  .given('There is no persisted state when the store is created.')
  .and('The persistor works SYNC when called (like localStorage).')
  .and('An action that changes the state.')
  .when('The store is created.')
  .and('The action is dispatched.')
  .then('The initial-state is initially in the store.')
  .and('The initial-state in the store is persisted.')
  .and('The new state created by the dispatched action is persisted.')
  .run(async (_) => {

    const persistor = new MyPersistor();

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // When the store is created:
    // - The store state is initialState.
    // - There is no state persisted.
    expect(store.state.count).toBe(1);
    expect(persistor.savedState).toBeNull();

    // However, creating the store will tell the Persistor to read the state.
    // In this case, there is no state persisted, so the Persistor will persist the initialState.
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(1);

    // We now dispatch an action that increments the state.
    // The persistor saves it too.
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
    expect(persistor.savedState?.count).toBe(2);
  });

Bdd(feature)
  .scenario('The persisted state is read when the Store is created. ' +
    'State changes are persisted by a SYNC persistor.')
  .given('There is some state already persisted when the store is created.')
  .and('The persistor works SYNC when called (like localStorage).')
  .and('An action that changes the state.')
  .when('The store is created.')
  .and('The action is dispatched.')
  .then('The initial-state is initially in the store.')
  .and('The persisted state is read into the store.')
  .and('The new state created by the dispatched action is persisted.')
  .run(async (_) => {

    // There is some state already persisted when the store is created.
    const persistor = new MyPersistor();
    persistor.savedState = new State(42);

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // When the store is created:
    // - The store state is initialState.
    // - There is a state persisted as `42`.
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(42);

    // Creating the store will tell the Persistor to read the state.
    // This time there is a state persisted, so the Persistor will read it.
    await delayMillis(10);
    expect(store.state.count).toBe(42);
    expect(persistor.savedState?.count).toBe(42);

    // We now dispatch an action that increments the state.
    // The persistor saves it too.
    store.dispatch(new Increment());
    expect(store.state.count).toBe(43);
    expect(persistor.savedState?.count).toBe(43);
  });

Bdd(feature)
  .scenario('There is no persisted state. ' +
    'State changes are persisted by an ASYNC persistor.')
  .given('There is no persisted state when the store is created.')
  .and('The persistor works SYNC when called (like localStorage).')
  .and('An action that changes the state.')
  .when('The store is created.')
  .and('The action is dispatched.')
  .then('The initial-state is initially in the store.')
  .and('The initial-state in the store is persisted.')
  .and('The new state created by the dispatched action is persisted.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // When the store is created:
    // - The store state is initialState.
    // - There is no state persisted.
    expect(store.state.count).toBe(1);
    expect(persistor.savedState).toBeNull();

    // However, creating the store will tell the Persistor to read the state.
    // In this case, there is no state persisted, so the Persistor will persist the initialState.
    // However, it takes 250 millis to do so. So after 10 millis, the state is not yet persisted.
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(undefined);

    // Reading (150 millis) plus saving (150 millis) takes 300 millis. We wait longer, to be safe.
    await delayMillis(450);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(1);

    // We now dispatch an action that increments the state.
    // The persistor saves it too.
    // However, it takes 150 millis to do so. So after 10 millis, the state is not yet persisted.
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
    expect(persistor.savedState?.count).toBe(1);

    // Waiting more than 150 millis, the state is finally persisted.
    await delayMillis(300);
    expect(store.state.count).toBe(2);
    expect(persistor.savedState?.count).toBe(2);
  });

Bdd(feature)
  .scenario('The persisted state is read when the Store is created. ' +
    'State changes are persisted by an ASYNC persistor.')
  .given('There is some state already persisted when the store is created.')
  .and('The persistor works SYNC when called (like localStorage).')
  .and('An action that changes the state.')
  .when('The store is created.')
  .and('The action is dispatched.')
  .then('The initial-state is initially in the store.')
  .and('The persisted state is read into the store.')
  .and('The new state created by the dispatched action is persisted.')
  .run(async (_) => {

    // There is some state already persisted when the store is created.
    const persistor = new MyPersistorSlow();
    persistor.savedState = new State(42);

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // When the store is created:
    // - The store state is initialState.
    // - There is a state persisted as `42`.
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(42);

    // Creating the store will tell the Persistor to read the state.
    // This time there is a state persisted, so the Persistor will read it.
    // However, it takes 150 millis to do so. So after only 10 millis, the state is not yet read.
    await delayMillis(10);
    expect(store.state.count).toBe(1);
    expect(persistor.savedState?.count).toBe(42);

    // Waiting more than 150 millis, the state is finally read.
    await delayMillis(300);
    expect(store.state.count).toBe(42);
    expect(persistor.savedState?.count).toBe(42);

    // We now dispatch an action that increments the state.
    // The persistor saves it too, but not immediately.
    store.dispatch(new Increment());
    expect(store.state.count).toBe(43);
    expect(persistor.savedState?.count).toBe(42);

    // Waiting more than 150 millis, the state is finally persisted.
    await delayMillis(300);
    expect(store.state.count).toBe(43);
    expect(persistor.savedState?.count).toBe(43);
  });

Bdd(feature)
  .scenario('State changes are only persisted when the previous state finished persisting.')
  .given('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .and('An action that changes the state.')
  .when('The action is dispatched twice.')
  .then('The second state is only persisted when the first one finishes.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();
    persistor.savedState = new State(123);

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // When the store is created:
    expect(store.state.count).toBe(1);
    expect(persistor.savedState.count).toBe(123);

    // We allow time for the persistor to read the persisted state.
    await delayMillis(600);
    expect(store.state.count).toBe(123);
    expect(persistor.savedState?.count).toBe(123);

    expect(persistor.record).toBe('' +
      'Creating persistor.' +
      'Persistor reading state: 123.' +
      'Finished reading state: 123.'
    );

    // Clear the recording.
    persistor.record = '';

    // Now we dispatch two actions that increment the state.
    store.dispatch(new Increment());
    store.dispatch(new Increment());

    // We allow time for both to end, and then check the recording.
    await delayMillis(600);
    expect(persistor.record).toBe('' +
      'Persisting difference: 123 → 124.' + // First persistence starts.
      'Finished persisting difference: 123 → 124.' +
      'Persisting difference: 124 → 125.' + // Second only starts after the first ends.
      'Finished persisting difference: 124 → 125.'
    );
  });

Bdd(feature)
  .scenario('A state change made while the persisted state is being read is persisted after the initial-state.')
  .given('There is no persisted state when the store is created.')
  .and('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .when('The store is created.')
  .and('An action changes the state before the persistor finished reading and saving the initial-state.')
  .then('The new state is only persisted after the initial-state is saved.')
  .and('The persisted state is the new state, not the initial-state.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // The persistor is still reading the state.
    await delayMillis(10);
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);

    // Wait for reading (150), saving the initial-state (150) and persisting (150).
    await delayMillis(600);

    expect(persistor.record).toBe('' +
      'Creating persistor.' +
      'Persistor reading state: undefined.' +
      'Finished reading state: undefined.' +
      'Persistor saving state: undefined.' +
      'Finished saving state: undefined.' +
      'Persisting difference: 1 → 2.' + // Only starts after the initial-state is saved.
      'Finished persisting difference: 1 → 2.'
    );
    expect(store.state.count).toBe(2);
    expect(persistor.savedState?.count).toBe(2);
  });

Bdd(feature)
  .scenario('A state change made while the persisted state is being read does not overwrite the persisted state.')
  .given('There is some state already persisted when the store is created.')
  .and('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .when('The store is created.')
  .and('An action changes the state before the persistor finished reading the state.')
  .then('The persisted state is read into the store.')
  .and('The persisted state is not overwritten.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();
    persistor.savedState = new State(42);

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // The persistor is still reading the state.
    await delayMillis(10);
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);

    await delayMillis(600);

    expect(persistor.record).toBe('' +
      'Creating persistor.' +
      'Persistor reading state: 42.' +
      'Finished reading state: 42.'
    );
    expect(store.state.count).toBe(42);
    expect(persistor.savedState?.count).toBe(42);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor can be awaited, and the current state is persisted when it returns.')
  .given('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .and('The store finished reading the persisted state.')
  .and('The persistor has a long throttle, so a state change is waiting to be persisted.')
  .when('We await persistAndPausePersistor.')
  .then('When it returns, the current state is persisted.')
  .and('Later state changes are not persisted, until the persistor is resumed.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow(new State(42), '', 1000);
    const store = new Store<State>({ initialState: new State(1), logger: logger, persistor: persistor });
    await delayMillis(300);
    expect(store.state.count).toBe(42);

    // Waits for the throttle (1000 millis) to persist.
    store.dispatch(new Increment());
    expect(persistor.savedState?.count).toBe(42);

    await store.persistAndPausePersistor();
    expect(persistor.savedState?.count).toBe(43);

    // Paused.
    store.dispatch(new Increment());
    await delayMillis(300);
    expect(persistor.savedState?.count).toBe(43);

    // Resumed. The throttle still applies.
    store.resumePersistor();
    await delayMillis(1200);
    expect(persistor.savedState?.count).toBe(44);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor called while a state is being persisted also persists the newest state.')
  .given('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .and('A state change is currently being persisted.')
  .and('Another state change happened after that.')
  .when('We await persistAndPausePersistor.')
  .then('It waits for the current persistence to finish.')
  .and('Then it persists the newest state, before returning.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow(new State(42));
    const store = new Store<State>({ initialState: new State(1), logger: logger, persistor: persistor });
    await delayMillis(300);
    persistor.record = '';

    store.dispatch(new Increment()); // Starts persisting 43.
    store.dispatch(new Increment()); // 44 waits.
    await delayMillis(10);

    await store.persistAndPausePersistor();

    expect(persistor.record).toBe('' +
      'Persisting difference: 42 → 43.' +
      'Finished persisting difference: 42 → 43.' +
      'Persisting difference: 43 → 44.' +
      'Finished persisting difference: 43 → 44.'
    );
    expect(persistor.savedState?.count).toBe(44);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor called while the persisted state is being read waits for the reading to finish.')
  .given('There is no persisted state when the store is created.')
  .and('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .when('An action changes the state while the persistor is reading the state.')
  .and('We await persistAndPausePersistor, before the reading finishes.')
  .then('The initial-state is saved first.')
  .and('Then the new state is persisted, before persistAndPausePersistor returns.')
  .and('The persistor stays paused.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();
    const store = new Store<State>({ initialState: new State(1), logger: logger, persistor: persistor });

    // The persistor is still reading the state.
    await delayMillis(10);
    store.dispatch(new Increment());
    await store.persistAndPausePersistor();

    expect(persistor.record).toBe('' +
      'Creating persistor.' +
      'Persistor reading state: undefined.' +
      'Finished reading state: undefined.' +
      'Persistor saving state: undefined.' +
      'Finished saving state: undefined.' +
      'Persisting difference: 1 → 2.' +
      'Finished persisting difference: 1 → 2.'
    );
    expect(persistor.savedState?.count).toBe(2);

    // Paused.
    store.dispatch(new Increment());
    await delayMillis(300);
    expect(persistor.savedState?.count).toBe(2);
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

export class MyPersistor extends Persistor<State> {

  constructor(
    public savedState: State | null = null
  ) {
    logger('Creating persistor');
    super();
  }

  async readState(): Promise<State | null> {
    logger('Persistor reading state: ' + this.savedState?.count);
    return this.savedState;
  }

  async saveInitialState(state: State) {
    logger('Persistor saving state: ' + this.savedState?.count);
    this.savedState = state;
  }

  async deleteState() {
    logger('Persistor deleting state');
    this.savedState = null;
  }

  async persistDifference(
    lastPersistedState: State | null,
    newState: State
  ) {
    logger('Persisting difference: ' + lastPersistedState?.count + ' → ' + newState.count);
    this.savedState = newState;
  }

  get throttle(): number | null {
    return null; // Throttle is off.
  }
}

export class MyPersistorSlow extends Persistor<State> {

  constructor(
    public savedState: State | null = null,
    public record = '',
    public throttleMillis: number | null = null,
  ) {
    super();
    this.record += 'Creating persistor.';
  }

  async readState(): Promise<State | null> {
    this.record += 'Persistor reading state: ' + this.savedState?.count + '.';
    await delayMillis(150);
    this.record += 'Finished reading state: ' + this.savedState?.count + '.';
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.record += 'Persistor saving state: ' + this.savedState?.count + '.';
    await delayMillis(150);
    this.record += 'Finished saving state: ' + this.savedState?.count + '.';
    this.savedState = state;
  }

  async deleteState() {
    this.record += 'Persistor deleting state.';
    await delayMillis(150);
    this.record += 'Persistor finished deleting state.';
    this.savedState = null;
  }

  async persistDifference(
    lastPersistedState: State | null,
    newState: State
  ) {
    this.record += 'Persisting difference: ' + lastPersistedState?.count + ' → ' + newState.count + '.';
    await delayMillis(150);
    this.record += 'Finished persisting difference: ' + lastPersistedState?.count + ' → ' + newState.count + '.';
    this.savedState = newState;
  }

  get throttle(): number | null {
    return this.throttleMillis; // Throttle is off by default.
  }
}
