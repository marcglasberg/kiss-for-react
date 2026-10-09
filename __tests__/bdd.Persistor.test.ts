import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, Persistor } from '../src';
import { delayMillis } from '../src/utils';
import { StoreException } from '../src/StoreException';

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
  .scenario('Dispatching an action while the persisted state is being read throws, and changes nothing.')
  .given('The persistor is async and slow, taking 150 millis to read/write/delete the state.')
  .and('The store was just created, and is still reading the persisted state.')
  .when('An action is dispatched with dispatch, dispatchSync or dispatchAndWait.')
  .then('The dispatch throws a StoreException.')
  .and('The state does not change, and the action is not dispatched.')
  .and('After the store is ready, the store has the persisted state.')
  .example(val('Persisted', null))
  .example(val('Persisted', 42))
  .run(async (ctx) => {

    const persisted = ctx.example.val('Persisted') as number | null;
    const persistor = new MyPersistorSlow();
    if (persisted !== null) persistor.savedState = new State(persisted);

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      persistor: persistor
    });

    // The persistor is still reading the state.
    await delayMillis(10);

    const action1 = new Increment();
    const action2 = new Increment();
    const action3 = new Increment();
    expect(() => store.dispatch(action1)).toThrow(StoreException);
    expect(() => store.dispatchSync(action2)).toThrow(StoreException);
    expect(() => store.dispatchAndWait(action3)).toThrow(StoreException);
    expect(store.state.count).toBe(1);
    expect(action1.status.isDispatched).toBe(false);
    expect(store.dispatchCount).toBe(0);

    await store.ready();
    await delayMillis(200);
    expect(store.state.count).toBe(persisted ?? 1);
    expect(persistor.savedState?.count).toBe(persisted ?? 1);

    // After the store is ready, dispatching works.
    store.dispatch(new Increment());
    expect(store.state.count).toBe((persisted ?? 1) + 1);
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
  .when('We await persistAndPausePersistor, before the reading finishes.')
  .then('The initial-state is saved before persistAndPausePersistor returns.')
  .and('The persistor stays paused.')
  .run(async (_) => {

    const persistor = new MyPersistorSlow();
    const store = new Store<State>({ initialState: new State(1), logger: logger, persistor: persistor });

    // The persistor is still reading the state.
    await delayMillis(10);
    await store.persistAndPausePersistor();
    expect(store.state.count).toBe(1);

    expect(persistor.record).toBe('' +
      'Creating persistor.' +
      'Persistor reading state: undefined.' +
      'Finished reading state: undefined.' +
      'Persistor saving state: undefined.' +
      'Finished saving state: undefined.'
    );
    expect(persistor.savedState?.count).toBe(1);

    // Paused.
    store.dispatch(new Increment());
    await delayMillis(300);
    expect(persistor.savedState?.count).toBe(1);
  });

Bdd(feature)
  .scenario('Logging out while the persisted state is still being read throws, and changes nothing.')
  .given('A store whose persisted state is still being read.')
  .when('logOut is called before the read finishes.')
  .then('logOut throws a StoreException.')
  .and('After the read finishes, the store has the state that was read, and it is still persisted.')
  .run(async (_) => {

    class SlowPersistor extends Persistor<string> {
      saved: string | null = 'old-user';
      async readState() { const v = this.saved; await delayMillis(100); return v; }
      async deleteState() { this.saved = null; }
      async saveInitialState(s: string) { this.saved = s; }
      async persistDifference(_l: string | null, s: string) { this.saved = s; }
      get throttle() { return 0; }
    }

    const persistor = new SlowPersistor();
    const store = new Store<string>({ initialState: 'initial', persistor });

    await expect(store.logOut({ initialState: 'initial', throttle: 0, actionsThrottle: 0 }))
      .rejects.toBeInstanceOf(StoreException);

    await store.ready();
    await delayMillis(20);
    expect(store.state).toBe('old-user');
    expect(persistor.saved).toBe('old-user');

    // After the read, logOut works.
    await store.logOut({ initialState: 'initial', throttle: 0, actionsThrottle: 0 });
    expect(store.state).toBe('initial');
    expect(persistor.saved).toBe('initial');
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
