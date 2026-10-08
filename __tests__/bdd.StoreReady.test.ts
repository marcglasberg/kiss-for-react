import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Store ready');

Bdd(feature)
  .scenario('Waiting for the store to be ready waits until the persisted state is loaded.')
  .given('There is some state already persisted.')
  .and('Reading the persisted state takes some time.')
  .when('The store is created, and we wait for it to be ready.')
  .then('Before it is ready, the store has the initial-state.')
  .and('After it is ready, the store has the persisted state.')
  .and('The persisted state was read only once.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(42));
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });

    let isReady = false;
    const ready = store.ready().then(() => isReady = true);

    await Promise.resolve();
    expect(isReady).toBe(false);
    expect(store.state.count).toBe(0);

    persistor.finishReading();
    await ready;

    expect(store.state.count).toBe(42);
    expect(persistor.readCount).toBe(1);
  });

Bdd(feature)
  .scenario('Actions dispatched after the store is ready are not overwritten by the persisted state.')
  .given('There is some state already persisted.')
  .when('The store is created, we wait for it to be ready, and then an action is dispatched.')
  .then('The action changes the persisted state, and the change is kept.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(10));
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });

    persistor.finishReading();
    await store.ready();
    store.dispatch(new Increment());

    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('A store without a persistor is ready right away.')
  .given('A store without a persistor.')
  .when('We wait for the store to be ready.')
  .then('It is ready, and has the initial-state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(5), logger: () => {} });
    await store.ready();
    expect(store.state.count).toBe(5);
  });

Bdd(feature)
  .scenario('The store is ready even when reading the persisted state fails.')
  .given('Reading the persisted state throws an error.')
  .when('We wait for the store to be ready.')
  .then('The wait does not fail, and the store keeps the initial-state.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(42));
    persistor.readError = new Error('Disk error');
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });

    persistor.finishReading();
    await expect(store.ready()).resolves.toBeUndefined();
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Waiting for the store to be ready many times does not read the persisted state again.')
  .given('There is some state already persisted.')
  .when('We wait for the store to be ready, twice.')
  .then('Both waits return the same promise.')
  .and('The persisted state was read only once.')
  .run(async (_) => {
    const persistor = new SlowPersistor(new State(42));
    const store = new Store<State>({ initialState: new State(0), persistor, logger: () => {} });

    expect(store.ready()).toBe(store.ready());
    persistor.finishReading();
    await store.ready();
    await store.ready();

    expect(persistor.readCount).toBe(1);
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

class SlowPersistor extends Persistor<State> {
  readCount = 0;
  readError: Error | null = null;
  private _finishReading!: () => void;
  private readonly _reading = new Promise<void>(resolve => this._finishReading = resolve);

  constructor(public savedState: State | null = null) {
    super();
  }

  finishReading() {
    this._finishReading();
  }

  async readState(): Promise<State | null> {
    this.readCount++;
    await this._reading;
    if (this.readError) throw this.readError;
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(_lastPersistedState: State | null, newState: State) {
    this.savedState = newState;
  }

  get throttle(): number | null {
    return null;
  }
}
