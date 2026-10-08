import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, PersistAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('PersistAction');

Bdd(feature)
  .scenario('Dispatching PersistAction persists the state right away, ignoring the throttle.')
  .given('A persistor with a long throttle period.')
  .and('The state was changed, but the change was not persisted yet because of the throttle.')
  .when('A PersistAction is dispatched.')
  .then('The state is persisted right away.')
  .and('The state is not persisted again when the throttle period ends.')
  .run(async (_) => {
    // Given
    const persistor = new ThrottledPersistor(300);
    const store = new Store<State>({ initialState: new State(1), persistor });
    await delayMillis(20); // Initial state is read and saved.

    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
    expect(persistor.persistCount).toBe(0);

    // When
    store.dispatch(new PersistAction());
    await delayMillis(10);

    // Then
    expect(persistor.persistCount).toBe(1);
    expect(persistor.savedState?.count).toBe(2);

    await delayMillis(400);
    expect(persistor.persistCount).toBe(1);
  });

Bdd(feature)
  .scenario('Dispatching PersistAction does nothing when there is nothing new to persist.')
  .given('A persistor with a long throttle period.')
  .and('The state has not changed since it was last persisted.')
  .when('A PersistAction is dispatched.')
  .then('The persistor is not asked to persist.')
  .run(async (_) => {
    // Given
    const persistor = new ThrottledPersistor(300);
    const store = new Store<State>({ initialState: new State(1), persistor });
    await delayMillis(20);

    // When
    store.dispatch(new PersistAction());
    await delayMillis(10);

    // Then
    expect(persistor.persistCount).toBe(0);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Dispatching PersistAction does nothing while the persistor is paused.')
  .given('A persistor with a long throttle period.')
  .and('The persistor is paused.')
  .and('The state was changed.')
  .when('A PersistAction is dispatched.')
  .then('The persistor is not asked to persist.')
  .run(async (_) => {
    // Given
    const persistor = new ThrottledPersistor(300);
    const store = new Store<State>({ initialState: new State(1), persistor });
    await delayMillis(20);
    store.pausePersistor();
    store.dispatch(new Increment());

    // When
    store.dispatch(new PersistAction());
    await delayMillis(10);

    // Then
    expect(persistor.persistCount).toBe(0);
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

class ThrottledPersistor extends Persistor<State> {
  savedState: State | null = null;
  persistCount = 0;

  constructor(private readonly throttleMillis: number) {
    super();
  }

  async readState(): Promise<State | null> {
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(_: State | null, newState: State) {
    this.persistCount++;
    this.savedState = newState;
  }

  get throttle(): number | null {
    return this.throttleMillis;
  }
}
