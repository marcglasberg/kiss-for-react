import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { createStore, KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Store constructor');

// Note: this file must compile with ts-jest diagnostics ON. If `logger` or `logStateChanges`
// ever become required again in `ConstructorParams`, this whole suite fails to compile.

Bdd(feature)
  .scenario('Creating a store with only the initial state.')
  .given('Only the `initialState` is provided.')
  .when('The store is created with `createStore` or `new Store`.')
  .then('It compiles, and the store works with the initial state.')
  .run(async (_) => {

    const store1 = createStore<State>({ initialState: new State(1) });
    expect(store1.state.count).toBe(1);

    const store2 = new Store<State>({ initialState: new State(2) });
    expect(store2.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('The default logger prints state changes to the console.')
  .given('Neither `logger` nor `logStateChanges` is provided.')
  .when('An action changes the state.')
  .then('The state change is printed with `console.log`.')
  .run(async (_) => {

    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const store = createStore<State>({ initialState: new State(1) });
      store.dispatch(new Increment());
      expect(store.state.count).toBe(2);
      expect(spy.mock.calls.map(args => String(args[0])).some(msg => msg.includes('count: 1 → 2'))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

Bdd(feature)
  .scenario('A custom logger receives the state changes.')
  .given('A `logger` is provided, but `logStateChanges` is not.')
  .when('An action changes the state.')
  .then('The state change is sent to the custom logger (`logStateChanges` defaults to true).')
  .run(async (_) => {

    const logs: string[] = [];
    const store = createStore<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
    expect(logs.some(msg => msg.includes('count: 1 → 2'))).toBe(true);
  });

Bdd(feature)
  .scenario('State changes are not logged when `logStateChanges` is false.')
  .given('A `logger` is provided, and `logStateChanges` is false.')
  .when('An action changes the state.')
  .then('The state change is not sent to the logger.')
  .run(async (_) => {

    const logs: string[] = [];
    const store = createStore<State>({
      initialState: new State(1),
      logger: (obj) => logs.push(String(obj)),
      logStateChanges: false,
    });
    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
    expect(logs.some(msg => msg.includes('count: 1 → 2'))).toBe(false);
  });

class State {
  constructor(readonly count: number) {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}
