import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, Store, StoreException, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Check internet without calling super');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }
}

// An action with `checkInternet`, which overrides `before()` WITHOUT calling `super.before()`.
// The internet is simulated with `online`, and the calls are written to `trace`.
class Increment extends KissAction<State> {
  checkInternet: { dialog: boolean } | { abort: true } = { dialog: true };

  constructor(readonly online: boolean, readonly trace: string[] = []) { super(); }

  protected hasInternet() {
    this.trace.push('hasInternet');
    return Promise.resolve(this.online);
  }

  protected before() {
    this.trace.push('before');
  }

  async reduce() {
    this.trace.push('reduce');
    return (state: State) => new State(state.count + 1);
  }

  protected after() {
    this.trace.push('after');
  }
}

Bdd(feature)
  .scenario('An action that overrides before without calling super still checks the internet.')
  .given('An action with checkInternet set to dialog: true.')
  .and('The action overrides before, and does not call super.before.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The action fails with the default no-internet UserException, which opens a dialog.')
  .and('The before and reduce methods do not run, and the state does not change.')
  .and('The after method runs.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new Increment(false, trace));

    // Then:
    expect(status.isCompletedFailed).toBe(true);
    const error = status.originalError as UserException;
    expect(error).toBeInstanceOf(UserException);
    expect(error.message).toBe('Please, verify your connection.');
    expect(error.title).toBe('There is no Internet');
    expect(error.ifOpenDialog).toBe(true);
    expect(trace).toEqual(['hasInternet', 'after']);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('When there is internet, the internet check runs before the before method.')
  .given('An action with checkInternet set to dialog: true.')
  .and('The action overrides before, and does not call super.before.')
  .and('There is internet.')
  .when('The action is dispatched.')
  .then('The internet is checked first, then before, reduce and after run.')
  .and('The state is changed by the reducer.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new Increment(true, trace));

    // Then:
    expect(status.isCompletedOk).toBe(true);
    expect(trace).toEqual(['hasInternet', 'before', 'reduce', 'after']);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An action that overrides before without calling super is aborted when there is no internet.')
  .given('An action with checkInternet set to abort: true.')
  .and('The action overrides before, and does not call super.before.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The dispatch is aborted, and the action does not fail.')
  .and('The before and reduce methods do not run, and the after method runs.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger });
    const action = new Increment(false, trace);
    action.checkInternet = { abort: true };

    // When:
    const status = await store.dispatchAndWait(action);

    // Then:
    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(store.isFailed(Increment)).toBe(false);
    expect(trace).toEqual(['hasInternet', 'after']);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('The action can change the no-internet error with noInternetException.')
  .given('An action with checkInternet set to the given dialog option.')
  .and('The action overrides noInternetException, to return its own UserException, which opens a dialog.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The action fails with the UserException of noInternetException.')
  .and('The exception opens a dialog only if the dialog option is true.')
  .example(val('dialog', true))
  .example(val('dialog', false))
  .run(async (ctx) => {
    // Given:
    const dialog: boolean = ctx.example.val('dialog');

    class LoadPrices extends Increment {
      checkInternet = { dialog };

      protected noInternetException() {
        return new UserException('You are offline. The prices could not be loaded.').withDialog(true);
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new LoadPrices(false));

    // Then:
    expect(status.isCompletedFailed).toBe(true);
    const error = status.originalError as UserException;
    expect(error).toBeInstanceOf(UserException);
    expect(error.message).toBe('You are offline. The prices could not be loaded.');
    expect(error.ifOpenDialog).toBe(dialog);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('When there is internet, noInternetException is not called.')
  .given('An action with checkInternet, which overrides noInternetException.')
  .and('There is internet.')
  .when('The action is dispatched.')
  .then('The action completes successfully, and noInternetException is not called.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];

    class LoadPrices extends Increment {
      protected noInternetException() {
        this.trace.push('noInternetException');
        return new UserException('Offline');
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new LoadPrices(true, trace));

    // Then:
    expect(status.isCompletedOk).toBe(true);
    expect(trace).not.toContain('noInternetException');
  });

Bdd(feature)
  .scenario('With abort: true, noInternetException is not called.')
  .given('An action with checkInternet set to abort: true, which overrides noInternetException.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The dispatch is aborted, and noInternetException is not called.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];

    class LoadPrices extends Increment {
      checkInternet = { abort: true } as const;

      protected noInternetException() {
        this.trace.push('noInternetException');
        return new UserException('Offline');
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new LoadPrices(false, trace));

    // Then:
    expect(status.isDispatchAborted).toBe(true);
    expect(trace).not.toContain('noInternetException');
  });

Bdd(feature)
  .scenario('The no-internet error goes to wrapError, like the errors of before.')
  .given('An action with checkInternet set to dialog: true, which overrides wrapError.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The wrapError method receives the no-internet UserException.')
  .and('The action fails with the error that wrapError returned.')
  .run(async (_) => {
    // Given:
    const received: any[] = [];

    class LoadPrices extends Increment {
      protected wrapError(error: any) {
        received.push(error);
        return new UserException('Wrapped');
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new LoadPrices(false));

    // Then:
    expect(received.length).toBe(1);
    expect(received[0]).toBeInstanceOf(UserException);
    expect(received[0].message).toBe('Please, verify your connection.');
    expect((status.wrappedError as UserException).message).toBe('Wrapped');
  });

Bdd(feature)
  .scenario('A sequential action that overrides before without calling super checks the internet on its turn.')
  .given('A sequential action with checkInternet set to dialog: true.')
  .and('The action overrides before, and does not call super.before.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The action fails with the no-internet UserException.')
  .and('The before and reduce methods do not run.')
  .run(async (_) => {
    // Given:
    const trace: string[] = [];

    class SequentialIncrement extends Increment {
      sequential = true;
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    const status = await store.dispatchAndWait(new SequentialIncrement(false, trace));

    // Then:
    expect(status.isCompletedFailed).toBe(true);
    expect((status.originalError as UserException).message).toBe('Please, verify your connection.');
    expect(trace).toEqual(['hasInternet', 'after']);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('An action with checkInternet is async, even if its before and reduce are sync.')
  .given('An action with checkInternet, and a sync before and a sync reduce.')
  .and('There is internet.')
  .when('The action is dispatched with dispatchSync.')
  .then('The dispatchSync throws a StoreException, which says the action uses checkInternet.')
  .and('When the action is dispatched with dispatchAndWait, it completes successfully.')
  .run(async (_) => {
    // Given:
    class SyncIncrement extends KissAction<State> {
      checkInternet = { dialog: true };
      protected hasInternet() { return Promise.resolve(true); }
      protected before() {}
      reduce() { return new State(this.state.count + 1); }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When/Then:
    expect(() => store.dispatchSync(new SyncIncrement())).toThrow(StoreException);
    expect(() => store.dispatchSync(new SyncIncrement())).toThrow('uses checkInternet, which makes it ASYNC');
    expect(store.state.count).toBe(0);

    const status = await store.dispatchAndWait(new SyncIncrement());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An action without checkInternet whose before and reduce are sync stays sync.')
  .given('An action without checkInternet, with a sync before and a sync reduce.')
  .when('The action is dispatched with dispatchSync.')
  .then('The state changes before dispatchSync returns.')
  .run(async (_) => {
    // Given:
    class SyncIncrement extends KissAction<State> {
      protected before() {}
      reduce() { return new State(this.state.count + 1); }
    }

    const store = new Store<State>({ initialState: new State(0), logger });

    // When:
    store.dispatchSync(new SyncIncrement());

    // Then:
    expect(store.state.count).toBe(1);
  });
