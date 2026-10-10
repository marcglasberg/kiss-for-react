import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Fresh');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action, fresh for 300 millis, that adds `value` to the count.
class AddSync extends KissAction<State> {
  fresh: number | boolean = 300;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  reduce() {
    this.trace.push(`reduce ${this.value}`);
    return new State(this.state.count + this.value);
  }
}

// Async action, fresh for 300 millis, that adds `value` to the count.
class AddAsync extends KissAction<State> {
  fresh: number | boolean = 300;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  async reduce() {
    this.trace.push(`reduce ${this.value}`);
    await delayMillis(1);
    return (state: State) => new State(state.count + this.value);
  }
}

// Async action, fresh for 300 millis, that fails with a `UserException`.
class Fail extends KissAction<State> {
  fresh: number | boolean = 300;

  constructor(readonly trace: string[] = []) { super(); }

  async reduce(): Promise<(state: State) => State> {
    this.trace.push('reduce');
    await delayMillis(1);
    throw new UserException('Failed');
  }
}

Bdd(feature)
  .scenario('A sync action is not run again while its data is fresh.')
  .given('A SYNC action with fresh.')
  .when('The action is dispatched 3 times in quick succession.')
  .then('Only the first action runs, right away.')
  .and('The other dispatches are aborted.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatchSync(new AddSync(1, log));
    expect(store.state.count).toBe(1);

    store.dispatchSync(new AddSync(10, log));
    store.dispatchSync(new AddSync(100, log));

    expect(log).toEqual(['reduce 1']);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An async action is not run again while its data is fresh.')
  .given('An ASYNC action with fresh.')
  .when('The action is dispatched 3 times, each after the previous one finished.')
  .then('Only the first action runs.')
  .and('The aborted dispatches complete without running.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const status1 = await store.dispatchAndWait(new AddAsync(1, log));
    const status2 = await store.dispatchAndWait(new AddAsync(10, log));
    const status3 = await store.dispatchAndWait(new AddAsync(100, log));

    expect(status1.isCompletedOk).toBe(true);
    expect(status2.isDispatched).toBe(false);
    expect(status3.isDispatched).toBe(false);

    expect(log).toEqual(['reduce 1']);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An action runs again when its data is stale.')
  .given('An action with fresh, that was dispatched.')
  .when('The action is dispatched again, after the fresh period.')
  .then('It runs again.')
  .and('It starts a new fresh period.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddSync(1, log));
    await delayMillis(330);

    store.dispatch(new AddSync(10, log));
    store.dispatch(new AddSync(100, log));

    expect(log).toEqual(['reduce 1', 'reduce 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('The fresh period starts when the action is dispatched, not when it finishes.')
  .given('An ASYNC action with fresh, that takes longer than its fresh period to finish.')
  .when('The action is dispatched again while the first is still running, but after the fresh period.')
  .then('Both actions run.')
  .run(async (_) => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => finish = resolve);

    // Only finishes when the test calls `finish()`.
    class Slow extends KissAction<State> {
      fresh = 50;

      constructor(readonly trace: string[]) { super(); }

      async reduce() {
        this.trace.push('reduce');
        await finished;
        return (state: State) => new State(state.count + 1);
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Slow(log));
    await delayMillis(80);
    expect(store.isWaiting(Slow)).toBe(true);

    store.dispatch(new Slow(log));
    expect(log).toEqual(['reduce', 'reduce']);

    finish();
    await store.waitAllActions([]);
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('Setting fresh to true uses the default fresh period of 1000 milliseconds.')
  .given('An action with fresh = true.')
  .when('The action is dispatched, and then again after a while, but before 1000 milliseconds.')
  .then('The second dispatch is aborted.')
  .and('The fresh period is 1000 milliseconds.')
  .run(async (_) => {
    class AddDefault extends AddSync {
      fresh = true;
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddDefault(1, log));
    await delayMillis(300);
    store.dispatch(new AddDefault(10, log));

    expect(log).toEqual(['reduce 1']);
    expect(new AddDefault(1)._freshMillis).toBe(1000);
  });

Bdd(feature)
  .scenario('Setting fresh to false turns off the fresh period a base class turned on.')
  .given('An action with fresh = false, that extends an action with fresh.')
  .when('The action is dispatched several times in quick succession.')
  .then('All dispatches run.')
  .run(async (_) => {
    class AddNotFresh extends AddSync {
      fresh = false;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.dispatch(new AddNotFresh(1));
    store.dispatch(new AddNotFresh(10));
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('An action can ignore the fresh period.')
  .given('An action with fresh, that ignores the fresh period when it is dispatched with force.')
  .and('The action was dispatched, and its data is still fresh.')
  .when('The action is dispatched with force.')
  .then('It runs.')
  .and('It starts a new fresh period, so a later dispatch without force is aborted.')
  .run(async (_) => {
    class AddForce extends AddSync {
      fresh = 400;

      constructor(value: number, trace: string[], readonly force = false) { super(value, trace); }

      get ignoreFresh() { return this.force; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForce(1, log));
    store.dispatch(new AddForce(10, log));
    await delayMillis(150);

    // Still inside the first fresh period, but forced.
    store.dispatch(new AddForce(100, log, true));
    expect(log).toEqual(['reduce 1', 'reduce 100']);

    // 450 millis after the first dispatch, so the first period ended, but not the new one.
    await delayMillis(300);
    store.dispatch(new AddForce(1000, log));

    expect(log).toEqual(['reduce 1', 'reduce 100']);
    expect(store.state.count).toBe(101);
  });

Bdd(feature)
  .scenario('When the action fails, its data does not stay fresh.')
  .given('An action with fresh, that fails.')
  .when('The action is dispatched again, within the fresh period.')
  .then('It runs again.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const status = await store.dispatchAndWait(new Fail(log));
    expect(status.isCompletedFailed).toBe(true);

    await store.dispatchAndWait(new Fail(log));
    expect(log).toEqual(['reduce', 'reduce']);
  });

Bdd(feature)
  .scenario('When a sync action fails, its data does not stay fresh.')
  .given('A SYNC action with fresh, that fails.')
  .when('The action is dispatched again, within the fresh period.')
  .then('It runs again.')
  .run(async (_) => {
    class FailSync extends KissAction<State> {
      fresh = 300;

      constructor(readonly trace: string[]) { super(); }

      reduce(): State {
        this.trace.push('reduce');
        throw new UserException('Failed');
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new FailSync(log));
    store.dispatch(new FailSync(log));
    expect(log).toEqual(['reduce', 'reduce']);
  });

Bdd(feature)
  .scenario('When a forced run fails, the data becomes stale, even if it was fresh before.')
  .given('An action with fresh, that ignores the fresh period when it is dispatched with force.')
  .and('The action was dispatched, and its data is still fresh.')
  .when('The action is dispatched with force, and fails.')
  .then('The data is stale, so a later dispatch without force runs.')
  .run(async (_) => {
    class LoadForce extends KissAction<State> {
      fresh = 1000;

      constructor(readonly name: string, readonly trace: string[], readonly force = false, readonly fail = false) { super(); }

      get ignoreFresh() { return this.force; }

      async reduce() {
        this.trace.push(this.name);
        if (this.fail) throw new UserException('Failed');
        return null;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new LoadForce('first', log));
    await store.dispatchAndWait(new LoadForce('fresh', log));
    expect(log).toEqual(['first']);

    const status = await store.dispatchAndWait(new LoadForce('forced', log, true, true));
    expect(status.isCompletedFailed).toBe(true);

    await store.dispatchAndWait(new LoadForce('stale', log));
    expect(log).toEqual(['first', 'forced', 'stale']);
  });

Bdd(feature)
  .scenario('A failed action does not cancel the fresh period started by a newer action.')
  .given('An action with fresh, that takes a while to finish, and fails.')
  .and('While it runs, the action is dispatched again with force, starts a new fresh period, and succeeds.')
  .when('The first action fails.')
  .then('The new fresh period is kept, so a dispatch within the new fresh period is aborted.')
  .run(async (_) => {
    let fail!: () => void;
    const failed = new Promise<void>(resolve => fail = resolve);

    // When `fail` is true, it only fails when the test calls `fail()`.
    class SlowAction extends KissAction<State> {
      fresh = 1000;

      constructor(readonly fail: boolean, readonly trace: string[], readonly force = false) { super(); }

      get ignoreFresh() { return this.force; }

      async reduce() {
        this.trace.push(this.fail ? 'reduce fail' : 'reduce ok');
        if (this.fail) {
          await failed;
          throw new UserException('Failed');
        }
        return null;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const failing = new SlowAction(true, log);
    store.dispatch(failing);

    // Forced, so it runs and starts a new fresh period.
    await store.dispatchAndWait(new SlowAction(false, log, true));

    fail();
    await store.waitAllActions([failing]);
    expect(failing.status.isCompletedFailed).toBe(true);

    // Inside the new fresh period.
    store.dispatch(new SlowAction(false, log));
    expect(log).toEqual(['reduce fail', 'reduce ok']);
  });

Bdd(feature)
  .scenario('With retry, the data stays fresh while the action retries, and becomes stale if the last attempt fails.')
  .given('An action with fresh and retry, that fails on every attempt.')
  .when('The action is dispatched again while it is retrying, and again after it fails.')
  .then('The dispatch while it is retrying is aborted.')
  .and('The dispatch after it fails runs.')
  .run(async (_) => {
    class FailRetry extends KissAction<State> {
      fresh = 1000;
      retry = { initialDelay: 20, maxRetries: 2 };

      constructor(readonly trace: string[]) { super(); }

      async reduce(): Promise<(state: State) => State> {
        this.trace.push('reduce');
        throw new UserException('Failed');
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const promise = store.dispatchAndWait(new FailRetry(log));
    store.dispatch(new FailRetry(log)); // Aborted, while retrying.
    const status = await promise;
    expect(status.isCompletedFailed).toBe(true);
    expect(log).toEqual(['reduce', 'reduce', 'reduce']);

    log.length = 0;
    store.dispatch(new FailRetry(log)); // Runs, since the data is stale.
    expect(log).toEqual(['reduce']);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('By default, actions of different classes do not share the fresh period.')
  .given('Two different action classes with fresh.')
  .and('One of them is a subclass of the other.')
  .when('Both actions are dispatched in quick succession.')
  .then('Both actions run.')
  .run(async (_) => {
    class AddSub extends AddSync {
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddSync(1, log));
    store.dispatch(new AddSub(10, log));

    expect(log).toEqual(['reduce 1', 'reduce 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('Actions of the same class with different freshKeyParams have separate fresh periods.')
  .given('An action with fresh, whose freshKeyParams returns one of its fields.')
  .when('Actions with different values of that field are dispatched in quick succession.')
  .then('The actions with different values have separate fresh periods.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      freshKeyParams() { return this.user; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForUser('A', 1, log));
    store.dispatch(new AddForUser('B', 10, log));
    store.dispatch(new AddForUser('A', 100, log));
    store.dispatch(new AddForUser('B', 1000, log));

    expect(log).toEqual(['reduce 1', 'reduce 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('Array freshKeyParams are compared by their contents.')
  .given('An action with fresh, whose freshKeyParams returns a new array with two of its fields.')
  .when('Actions with the same field values, and then with different field values, are dispatched in quick succession.')
  .then('The actions with the same field values share the fresh period.')
  .and('The action with different field values runs.')
  .run(async (_) => {
    class AddForCart extends AddSync {
      constructor(readonly user: string, readonly cart: number, value: number, log: string[]) { super(value, log); }

      freshKeyParams() { return [this.user, this.cart]; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForCart('A', 1, 1, log));
    store.dispatch(new AddForCart('A', 1, 10, log));
    store.dispatch(new AddForCart('A', 2, 100, log));

    expect(log).toEqual(['reduce 1', 'reduce 100']);
  });

Bdd(feature)
  .scenario('Actions of different classes with the same computeFreshKey share the fresh period.')
  .given('Two different action classes with fresh.')
  .and('Both override computeFreshKey to return the same user id.')
  .when('Both actions are dispatched in quick succession, with the same user id, and then with another user id.')
  .then('The second action is aborted when it has the same user id.')
  .and('It runs when it has another user id.')
  .run(async (_) => {
    class LoadUserProfile extends AddSync {
      constructor(readonly userId: string, value: number, log: string[]) { super(value, log); }

      computeFreshKey() { return this.userId; }
    }

    class LoadUserSettings extends AddSync {
      constructor(readonly userId: string, value: number, log: string[]) { super(value, log); }

      computeFreshKey() { return this.userId; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new LoadUserProfile('123', 1, log));
    store.dispatch(new LoadUserSettings('123', 10, log));
    store.dispatch(new LoadUserSettings('456', 100, log));

    expect(log).toEqual(['reduce 1', 'reduce 100']);
  });

Bdd(feature)
  .scenario('The action can remove its own fresh-key.')
  .given('An action with fresh, that removes its fresh-key in reduce, when the loaded data is empty.')
  .when('The action loads empty data, and is dispatched again within the fresh period.')
  .then('It runs again.')
  .and('After it loads non-empty data, it does not run again within the fresh period.')
  .run(async (_) => {
    class Load extends KissAction<State> {
      fresh = 1000;

      constructor(readonly loaded: number, readonly trace: string[]) { super(); }

      async reduce() {
        this.trace.push(`load ${this.loaded}`);
        if (this.loaded === 0) this.removeFreshKey();
        return (state: State) => new State(this.loaded);
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new Load(0, log));
    await store.dispatchAndWait(new Load(5, log));
    await store.dispatchAndWait(new Load(7, log));

    expect(log).toEqual(['load 0', 'load 5']);
    expect(store.state.count).toBe(5);
  });

Bdd(feature)
  .scenario('Removing all fresh-keys allows all actions to run again right away.')
  .given('Two actions with fresh and different fresh-keys, whose data is still fresh.')
  .when('removeAllFreshKeys is called.')
  .then('Both actions can be dispatched again right away.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      freshKeyParams() { return this.user; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const action = new AddForUser('A', 1, log);
    store.dispatch(action);
    store.dispatch(new AddForUser('B', 10, log));

    action.removeAllFreshKeys();

    store.dispatch(new AddForUser('A', 100, log));
    store.dispatch(new AddForUser('B', 1000, log));

    expect(log).toEqual(['reduce 1', 'reduce 10', 'reduce 100', 'reduce 1000']);
  });

Bdd(feature)
  .scenario('An action aborted by abortDispatch does not make its fresh-key fresh.')
  .given('An action with fresh, whose abortDispatch returns true.')
  .when('The action is dispatched, and then an action with the same fresh-key is dispatched.')
  .then('The second action runs.')
  .run(async (_) => {
    class AddAbort extends AddSync {
      abortDispatch() { return this.value < 0; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddAbort(-1, log));
    store.dispatch(new AddAbort(10, log));

    expect(log).toEqual(['reduce 10']);
  });

Bdd(feature)
  .scenario('Fresh can not be combined with nonReentrant or throttle.')
  .given('An action with fresh, and also with nonReentrant or throttle.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Other feature', 'nonReentrant'))
  .example(val('Other feature', 'throttle'))
  .run(async (ctx) => {
    class AddNonReentrant extends AddAsync {
      nonReentrant = true;
    }

    class AddThrottle extends AddAsync {
      throttle = 300;
    }

    const action = ctx.example.val('Other feature') === 'nonReentrant'
      ? new AddNonReentrant(1)
      : new AddThrottle(1);

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(action)).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('Fresh can not be used in an OptimisticCommand.')
  .given('An OptimisticCommand with fresh.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class Save extends OptimisticCommand<State, number> {
      fresh = 50;

      optimisticValue() { return 1; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer() {}
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new Save())).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('An invalid fresh value makes the dispatch throw.')
  .given('An action with an invalid fresh value.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Fresh', -1))
  .example(val('Fresh', NaN))
  .example(val('Fresh', '300'))
  .run(async (ctx) => {
    const fresh = ctx.example.val('Fresh');

    class AddInvalid extends AddSync {
      fresh = fresh;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new AddInvalid(1))).toThrow(StoreException);
  });
