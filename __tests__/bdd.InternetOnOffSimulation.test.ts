import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, Store, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Internet on/off simulation');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Async action with checkInternet, whose real internet check returns `online`.
class Increment extends KissAction<State> {
  checkInternet = { dialog: false };

  constructor(readonly online: boolean = true) { super(); }

  protected async hasInternet() { return this.online; }

  async reduce() {
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('The store can simulate that there is no internet, for all actions that check it.')
  .given('An action with checkInternet, and the real internet is on.')
  .and('The store simulates that there is no internet.')
  .when('The action is dispatched.')
  .then('The action fails with a "No Internet" UserException.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.forceInternetOnOffSimulation = () => false;

    const status = await store.dispatchAndWait(new Increment(true));

    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBeInstanceOf(UserException);
    expect((status.originalError as UserException).message).toBe('No Internet');
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('The store can simulate that there is internet, even if the real internet is off.')
  .given('An action with checkInternet, and the real internet is off.')
  .and('The store simulates that there is internet.')
  .when('The action is dispatched.')
  .then('The action runs, and changes the state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.forceInternetOnOffSimulation = () => true;

    const status = await store.dispatchAndWait(new Increment(false));

    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('By default, the real internet connection is used.')
  .given('A new store, which does not simulate the internet.')
  .and('An action with checkInternet, and the real internet is {Online}.')
  .when('The action is dispatched.')
  .then('The action runs: {Runs}.')
  .example(val('Online', true), val('Runs', true))
  .example(val('Online', false), val('Runs', false))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(store.forceInternetOnOffSimulation()).toBeNull();

    const status = await store.dispatchAndWait(new Increment(ctx.example.val('Online') as boolean));

    expect(status.isCompletedOk).toBe(ctx.example.val('Runs'));
  });

Bdd(feature)
  .scenario('With checkInternet abort, simulating no internet aborts the action.')
  .given('An action with checkInternet set to abort, and the real internet is on.')
  .and('The store simulates that there is no internet.')
  .when('The action is dispatched.')
  .then('The dispatch is aborted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.forceInternetOnOffSimulation = () => false;

    class IncrementOrAbort extends KissAction<State> {
      checkInternet = { abort: true };

      protected async hasInternet() { return true; }

      async reduce() {
        return (state: State) => new State(state.count + 1);
      }
    }

    const status = await store.dispatchAndWait(new IncrementOrAbort());

    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('An action can simulate the internet itself, taking precedence over the store.')
  .given('The store simulates that there is no internet.')
  .and('An action with checkInternet, that simulates that there is internet.')
  .when('The action is dispatched.')
  .then('The action runs, and changes the state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.forceInternetOnOffSimulation = () => false;

    class AlwaysOnline extends Increment {
      get internetOnOffSimulation() { return true; }
    }

    const status = await store.dispatchAndWait(new AlwaysOnline(false));

    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Actions without checkInternet ignore the simulation.')
  .given('An action without checkInternet.')
  .and('The store simulates that there is no internet.')
  .when('The action is dispatched.')
  .then('The action runs, and changes the state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.forceInternetOnOffSimulation = () => false;

    class NoCheck extends KissAction<State> {
      async reduce() {
        return (state: State) => new State(state.count + 1);
      }
    }

    const status = await store.dispatchAndWait(new NoCheck());

    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('The simulation also applies to actions with unlimitedRetryCheckInternet.')
  .given('An action with unlimitedRetryCheckInternet, and the real internet is on.')
  .and('The store simulates that there is no internet.')
  .when('The action is dispatched.')
  .then('The action waits for the internet, without running its reducer.')
  .and('When the store simulates that there is internet, the action runs.')
  .run(async (_) => {
    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State(0), logger: logger });
      store.forceInternetOnOffSimulation = () => false;

      let runs = 0;

      class LoadWhenOnline extends KissAction<State> {
        unlimitedRetryCheckInternet = true;

        protected async hasInternet() { return true; }

        async reduce() {
          runs++;
          return (state: State) => new State(state.count + 1);
        }
      }

      const promise = store.dispatchAndWait(new LoadWhenOnline());
      await jest.advanceTimersByTimeAsync(3000);
      expect(runs).toBe(0);

      store.forceInternetOnOffSimulation = () => true;
      await jest.advanceTimersByTimeAsync(1000);

      expect((await promise).isCompletedOk).toBe(true);
      expect(runs).toBe(1);
      expect(store.state.count).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });
