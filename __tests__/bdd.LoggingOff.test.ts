import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Turning logging off');

class State {
  constructor(readonly count: number) {
  }
}

/** Counts how many times its description is built. */
class Increment extends KissAction<State> {
  static toStringCalls = 0;

  reduce() {
    return new State(this.state.count + 1);
  }

  toString(): string {
    Increment.toStringCalls++;
    return 'Increment()';
  }
}

Bdd(feature)
  .scenario('With the logger set to null, nothing is logged.')
  .given('A store created with the logger set to null.')
  .when('An action is dispatched.')
  .then('The action runs and changes the state.')
  .and('Nothing is printed to the console.')
  .run(async (_) => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const store = new Store<State>({ initialState: new State(1), logger: null });
      store.dispatch(new Increment());
      Store.log('Some information.');

      expect(store.state.count).toBe(2);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

Bdd(feature)
  .scenario('With the logger set to null, log messages are not even built.')
  .given('A store created with the logger set to null.')
  .when('An action is dispatched.')
  .then('The description of the action is never built.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(1), logger: null });
    Increment.toStringCalls = 0;

    store.dispatch(new Increment());

    expect(store.state.count).toBe(2);
    expect(Increment.toStringCalls).toBe(0);
  });

Bdd(feature)
  .scenario('With the logger set to null, state changes are not described.')
  .given('A store created with the logger set to null.')
  .and('Logging of state changes is turned on.')
  .when('An action changes the state.')
  .then('The description of the state change is never built.')
  .run(async (_) => {
    const describe = jest.spyOn(Store, 'describeStateChange');
    try {
      const store = new Store<State>({ initialState: new State(1), logger: null, logStateChanges: true });
      store.dispatch(new Increment());

      expect(store.state.count).toBe(2);
      expect(describe).not.toHaveBeenCalled();
    } finally {
      describe.mockRestore();
    }
  });

Bdd(feature)
  .scenario('With a logger, log messages are still built and logged.')
  .given('A store created with a logger.')
  .when('An action is dispatched.')
  .then('The action is logged with its description.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });
    Increment.toStringCalls = 0;

    store.dispatch(new Increment());

    expect(Increment.toStringCalls).toBeGreaterThan(0);
    expect(logs.some((log) => log.includes('Increment()'))).toBe(true);
  });

Bdd(feature)
  .scenario('An empty logger function still turns logging off.')
  .given('A store created with a logger that does nothing.')
  .when('An action is dispatched.')
  .then('The action runs and changes the state.')
  .and('Nothing is printed to the console.')
  .run(async (_) => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const store = new Store<State>({ initialState: new State(1), logger: () => {} });
      store.dispatch(new Increment());

      expect(store.state.count).toBe(2);
      expect(consoleLog).not.toHaveBeenCalled();
    } finally {
      consoleLog.mockRestore();
    }
  });

Bdd(feature)
  .scenario('Without a logger, messages are printed to the console.')
  .given('A store created without a logger.')
  .when('An action is dispatched.')
  .then('The action is printed to the console.')
  .run(async (_) => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const store = new Store<State>({ initialState: new State(1) });
      store.dispatch(new Increment());

      expect(consoleLog.mock.calls.some(([obj]) => String(obj).includes('Increment()'))).toBe(true);
    } finally {
      consoleLog.mockRestore();
    }
  });
