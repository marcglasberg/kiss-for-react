import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Pausing the persistor before the store is ready');

Bdd(feature)
  .scenario('Pausing the persistor before the store is ready keeps the state read from the persistor as the persisted state.')
  .given('There is some state already persisted.')
  .and('The persistor only saves the parts of the state that changed.')
  .and('The persistor is paused before the store is ready.')
  .when('The store becomes ready.')
  .then('The last persisted state is the state read from the persistor.')
  .run(async (_) => {
    const persistor = new KeyPersistor({a: 5, b: 5});
    const store = new Store<S>({initialState: {a: 0, b: 0}, persistor, logger: () => {}});

    store.pausePersistor();
    persistor.finishReading();
    await store.ready();

    expect(store.state).toEqual({a: 5, b: 5});
    expect(store.getLastPersistedStateFromPersistor()).toEqual({a: 5, b: 5});
  });

Bdd(feature)
  .scenario('A change made after the store is ready is saved when the persistor resumes, if it was paused before the store was ready.')
  .given('There is some state already persisted.')
  .and('The persistor only saves the parts of the state that changed.')
  .and('The persistor is paused before the store is ready.')
  .and('The store becomes ready, and then the state changes.')
  .when('The persistor is resumed.')
  .then('Only the change is saved, and the persisted state is the current state.')
  .run(async (_) => {
    const persistor = new KeyPersistor({a: 5, b: 5});
    const store = new Store<S>({initialState: {a: 0, b: 0}, persistor, logger: () => {}});

    store.pausePersistor();
    persistor.finishReading();
    await store.ready();

    store.dispatch(new SetA(0));
    store.resumePersistor();
    await tick();

    expect(persistor.stored).toEqual({a: 0, b: 5});
    expect(persistor.diffs).toEqual([{from: {a: 5, b: 5}, to: {a: 0, b: 5}}]);
  });

Bdd(feature)
  .scenario('Resuming the persistor paused before the store was ready does not save the state read from the persistor again.')
  .given('There is some state already persisted.')
  .and('The persistor is paused before the store is ready.')
  .and('The store becomes ready.')
  .when('The persistor is resumed.')
  .then('Nothing is saved.')
  .run(async (_) => {
    const persistor = new KeyPersistor({a: 5, b: 5});
    const store = new Store<S>({initialState: {a: 0, b: 0}, persistor, logger: () => {}});

    store.pausePersistor();
    persistor.finishReading();
    await store.ready();

    store.resumePersistor();
    await tick();

    expect(persistor.diffs).toEqual([]);
    expect(persistor.stored).toEqual({a: 5, b: 5});
  });

Bdd(feature)
  .scenario('persistAndPausePersistor called before the store is ready does not save the state read from the persistor again.')
  .given('There is some state already persisted.')
  .when('persistAndPausePersistor is called before the store is ready.')
  .then('It waits for the store to be ready, and nothing is saved.')
  .and('After the persistor resumes, a change is saved against the state read from the persistor.')
  .run(async (_) => {
    const persistor = new KeyPersistor({a: 5, b: 5});
    const store = new Store<S>({initialState: {a: 0, b: 0}, persistor, logger: () => {}});

    const paused = store.persistAndPausePersistor();
    persistor.finishReading();
    await paused;

    expect(store.state).toEqual({a: 5, b: 5});
    expect(persistor.diffs).toEqual([]);
    expect(store.getLastPersistedStateFromPersistor()).toEqual({a: 5, b: 5});

    store.dispatch(new SetA(0));
    store.resumePersistor();
    await tick();

    expect(persistor.stored).toEqual({a: 0, b: 5});
    expect(persistor.diffs).toEqual([{from: {a: 5, b: 5}, to: {a: 0, b: 5}}]);
  });

Bdd(feature)
  .scenario('Pausing the persistor before the store is ready, when nothing was persisted yet, keeps the saved initial-state as the persisted state.')
  .given('There is no state persisted yet.')
  .and('The persistor is paused before the store is ready.')
  .and('The store becomes ready, so the initial-state is saved.')
  .and('Then the state changes.')
  .when('The persistor is resumed.')
  .then('Only the change is saved, and the persisted state is the current state.')
  .run(async (_) => {
    const persistor = new KeyPersistor(null);
    const store = new Store<S>({initialState: {a: 0, b: 0}, persistor, logger: () => {}});

    store.pausePersistor();
    persistor.finishReading();
    await store.ready();

    expect(persistor.stored).toEqual({a: 0, b: 0});
    expect(store.getLastPersistedStateFromPersistor()).toEqual({a: 0, b: 0});

    store.dispatch(new SetA(7));
    store.resumePersistor();
    await tick();

    expect(persistor.stored).toEqual({a: 7, b: 0});
    expect(persistor.diffs).toEqual([{from: {a: 0, b: 0}, to: {a: 7, b: 0}}]);
  });

type S = { a: number, b: number };

class SetA extends KissAction<S> {
  constructor(readonly value: number) {
    super();
  }

  reduce() {
    return {...this.state, a: this.value};
  }
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 10));

/**
 * Saves only the keys that changed between the last persisted state and the new state,
 * like a persistor that writes each key to its own storage entry.
 * Reading the state waits until `finishReading()` is called.
 */
class KeyPersistor extends Persistor<S> {
  stored: S | null;
  diffs: { from: S | null, to: S }[] = [];
  private _finishReading!: () => void;
  private readonly _reading = new Promise<void>(resolve => this._finishReading = resolve);

  constructor(stored: S | null) {
    super();
    this.stored = stored === null ? null : {...stored};
  }

  finishReading() {
    this._finishReading();
  }

  async readState() {
    await this._reading;
    return this.stored === null ? null : {...this.stored};
  }

  async deleteState() {
    this.stored = null;
  }

  async saveInitialState(s: S) {
    this.stored = {...s};
  }

  async persistDifference(last: S | null, s: S) {
    this.diffs.push({from: last === null ? null : {...last}, to: {...s}});
    const stored: S = this.stored ?? {...s};
    for (const key of ['a', 'b'] as const)
      if (last === null || last[key] !== s[key]) stored[key] = s[key];
    this.stored = stored;
  }

  get throttle() {
    return 0;
  }
}
