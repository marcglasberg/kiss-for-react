import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Throttle');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action, throttled for 300 millis, that adds `value` to the count.
class AddSync extends KissAction<State> {
  throttle: number | boolean = 300;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  reduce() {
    this.trace.push(`reduce ${this.value}`);
    return new State(this.state.count + this.value);
  }
}

// Async action, throttled for 300 millis, that adds `value` to the count.
class AddAsync extends KissAction<State> {
  throttle: number | boolean = 300;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  async reduce() {
    this.trace.push(`reduce ${this.value}`);
    await delayMillis(1);
    return (state: State) => new State(state.count + this.value);
  }
}

// Async action, throttled for 300 millis, that fails with a `UserException`.
class Fail extends KissAction<State> {
  throttle: number | boolean = 300;

  constructor(readonly trace: string[] = []) { super(); }

  async reduce(): Promise<(state: State) => State> {
    this.trace.push('reduce');
    await delayMillis(1);
    throw new UserException('Failed');
  }
}

Bdd(feature)
  .scenario('A sync action is throttled when dispatched several times quickly.')
  .given('A SYNC action with throttle.')
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
  .scenario('An async action is throttled when dispatched several times quickly.')
  .given('An ASYNC action with throttle.')
  .when('The action is dispatched 3 times in quick succession.')
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
  .scenario('An action runs again after the throttle period ends.')
  .given('An action with throttle, that was dispatched.')
  .when('The action is dispatched again, after the throttle period.')
  .then('It runs again.')
  .and('It starts a new throttle period.')
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
  .scenario('The throttle period starts when the action is dispatched, not when it finishes.')
  .given('An ASYNC action with throttle, that takes longer than its throttle period to finish.')
  .when('The action is dispatched again while the first is still running, but after the throttle period.')
  .then('Both actions run.')
  .run(async (_) => {
    let finish!: () => void;
    const finished = new Promise<void>(resolve => finish = resolve);

    // Only finishes when the test calls `finish()`.
    class Slow extends KissAction<State> {
      throttle = 50;

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
  .scenario('Setting throttle to true uses the default throttle period of 1000 milliseconds.')
  .given('An action with throttle = true.')
  .when('The action is dispatched, and then again after a while, but before 1000 milliseconds.')
  .then('The second dispatch is aborted.')
  .and('The throttle period is 1000 milliseconds.')
  .run(async (_) => {
    class AddDefault extends AddSync {
      throttle = true;
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddDefault(1, log));
    await delayMillis(300);
    store.dispatch(new AddDefault(10, log));

    expect(log).toEqual(['reduce 1']);
    expect(new AddDefault(1)._throttleMillis).toBe(1000);
  });

Bdd(feature)
  .scenario('Setting throttle to false turns off the throttle a base class turned on.')
  .given('An action with throttle = false, that extends an action with throttle.')
  .when('The action is dispatched several times in quick succession.')
  .then('All dispatches run.')
  .run(async (_) => {
    class AddNoThrottle extends AddSync {
      throttle = false;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.dispatch(new AddNoThrottle(1));
    store.dispatch(new AddNoThrottle(10));
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('An action can ignore the throttle period.')
  .given('An action with throttle, that ignores the throttle when it is dispatched with force.')
  .and('The action was dispatched, and its throttle period has not ended.')
  .when('The action is dispatched with force.')
  .then('It runs.')
  .and('It starts a new throttle period, so a later dispatch without force is aborted.')
  .run(async (_) => {
    class AddForce extends AddSync {
      throttle = 400;

      constructor(value: number, trace: string[], readonly force = false) { super(value, trace); }

      get ignoreThrottle() { return this.force; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForce(1, log));
    store.dispatch(new AddForce(10, log));
    await delayMillis(150);

    // Still inside the first throttle period, but forced.
    store.dispatch(new AddForce(100, log, true));
    expect(log).toEqual(['reduce 1', 'reduce 100']);

    // 450 millis after the first dispatch, so the first period ended, but not the new one.
    await delayMillis(300);
    store.dispatch(new AddForce(1000, log));

    expect(log).toEqual(['reduce 1', 'reduce 100']);
    expect(store.state.count).toBe(101);
  });

Bdd(feature)
  .scenario('By default, the throttle lock is NOT removed when the action fails.')
  .given('An action with throttle, that fails.')
  .when('The action is dispatched again, within the throttle period.')
  .then('It does not run a second time.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const status = await store.dispatchAndWait(new Fail(log));
    expect(status.isCompletedFailed).toBe(true);

    await store.dispatchAndWait(new Fail(log));
    expect(log).toEqual(['reduce']);
  });

Bdd(feature)
  .scenario('With removeThrottleLockOnError, the throttle lock is removed when the action fails.')
  .given('An action with throttle and removeThrottleLockOnError = true, that fails.')
  .when('The action is dispatched again, within the throttle period.')
  .then('It runs again.')
  .run(async (_) => {
    class FailAndRemove extends Fail {
      removeThrottleLockOnError = true;
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new FailAndRemove(log));
    await store.dispatchAndWait(new FailAndRemove(log));
    expect(log).toEqual(['reduce', 'reduce']);
  });

Bdd(feature)
  .scenario('With removeThrottleLockOnError, the throttle lock is NOT removed when the action succeeds.')
  .given('An action with throttle and removeThrottleLockOnError = true, that succeeds.')
  .when('The action is dispatched again, within the throttle period.')
  .then('It does not run a second time.')
  .run(async (_) => {
    class AddAndRemove extends AddAsync {
      removeThrottleLockOnError = true;
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new AddAndRemove(1, log));
    await store.dispatchAndWait(new AddAndRemove(10, log));
    expect(log).toEqual(['reduce 1']);
  });

Bdd(feature)
  .scenario('A failed action does not remove the throttle lock taken by a newer action.')
  .given('An action with throttle and removeThrottleLockOnError = true, that takes longer than its throttle period, and fails.')
  .and('While it runs, after its throttle period, the action is dispatched again, and takes a new throttle lock.')
  .when('The first action fails.')
  .then('The new throttle lock is kept, so a dispatch within the new throttle period is aborted.')
  .run(async (_) => {
    let fail!: () => void;
    const failed = new Promise<void>(resolve => fail = resolve);

    // When `fail` is true, it only fails when the test calls `fail()`.
    class SlowAction extends KissAction<State> {
      throttle = 100;
      removeThrottleLockOnError = true;

      constructor(readonly fail: boolean, readonly trace: string[]) { super(); }

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
    await delayMillis(130);

    // The first throttle period ended, so this one runs and takes a new lock.
    store.dispatch(new SlowAction(false, log));

    fail();
    await store.waitAllActions([failing]);
    expect(failing.status.isCompletedFailed).toBe(true);

    // Inside the new throttle period.
    store.dispatch(new SlowAction(false, log));
    expect(log).toEqual(['reduce fail', 'reduce ok']);
  });

Bdd(feature)
  .scenario('The action can remove its own throttle lock.')
  .given('An action with throttle, that removes its throttle lock in after(), only for a specific error.')
  .when('The action fails with that error, and is dispatched again within the throttle period.')
  .then('It runs again.')
  .run(async (_) => {
    class SpecificError extends UserException {
    }

    class FailSpecific extends KissAction<State> {
      throttle = 100;

      constructor(readonly specific: boolean, readonly trace: string[]) { super(); }

      async reduce(): Promise<(state: State) => State> {
        this.trace.push(this.specific ? 'specific' : 'other');
        throw this.specific ? new SpecificError('Specific') : new UserException('Other');
      }

      after() {
        if (this.status.originalError instanceof SpecificError) this.removeThrottleLock();
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new FailSpecific(true, log));
    await store.dispatchAndWait(new FailSpecific(false, log));
    await store.dispatchAndWait(new FailSpecific(true, log));

    expect(log).toEqual(['specific', 'other']);
  });

Bdd(feature)
  .scenario('By default, actions of different classes do not throttle each other.')
  .given('Two different action classes with throttle.')
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
  .scenario('Actions of different classes with the same lock throttle each other.')
  .given('Two different action classes with throttle.')
  .and('Both override throttleLockBuilder to return the same lock.')
  .when('Both actions are dispatched in quick succession.')
  .then('Only the first action runs.')
  .run(async (_) => {
    class Add1 extends AddSync {
      throttleLockBuilder() { return 'myLock'; }
    }

    class Add2 extends AddSync {
      throttleLockBuilder() { return 'myLock'; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Add1(1, log));
    store.dispatch(new Add2(10, log));

    expect(log).toEqual(['reduce 1']);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Actions of the same class with different locks do not throttle each other.')
  .given('An action with throttle, whose lock depends on one of its fields.')
  .when('Actions with different values of that field are dispatched in quick succession.')
  .then('The actions with different locks throttle separately.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      throttleLockBuilder() { return this.user; }
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
  .scenario('Array locks are compared by their contents.')
  .given('An action with throttle, whose lock is a new array with its class and a field.')
  .when('Actions with the same field value are dispatched in quick succession.')
  .then('They throttle each other.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      throttleLockBuilder() { return [this.constructor, this.user]; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForUser('A', 1, log));
    store.dispatch(new AddForUser('A', 10, log));

    expect(log).toEqual(['reduce 1']);
  });

Bdd(feature)
  .scenario('Removing all throttle locks allows all actions to run again right away.')
  .given('Two actions with throttle and different locks, inside their throttle periods.')
  .when('removeAllThrottleLocks is called.')
  .then('Both actions can be dispatched again right away.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      throttleLockBuilder() { return this.user; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const action = new AddForUser('A', 1, log);
    store.dispatch(action);
    store.dispatch(new AddForUser('B', 10, log));

    action.removeAllThrottleLocks();

    store.dispatch(new AddForUser('A', 100, log));
    store.dispatch(new AddForUser('B', 1000, log));

    expect(log).toEqual(['reduce 1', 'reduce 10', 'reduce 100', 'reduce 1000']);
  });

Bdd(feature)
  .scenario('An action aborted by abortDispatch does not take the throttle lock.')
  .given('An action with throttle, whose abortDispatch returns true.')
  .when('The action is dispatched, and then an action with the same lock is dispatched.')
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
  .scenario('Throttle can not be combined with nonReentrant.')
  .given('An action with both throttle and nonReentrant.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class AddNonReentrant extends AddAsync {
      nonReentrant = true;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new AddNonReentrant(1))).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('Throttle can not be used in an OptimisticCommand.')
  .given('An OptimisticCommand with throttle.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class Save extends OptimisticCommand<State, number> {
      throttle = 50;

      optimisticValue() { return 1; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer() {}
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new Save())).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('An invalid throttle value makes the dispatch throw.')
  .given('An action with an invalid throttle value.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Throttle', -1))
  .example(val('Throttle', NaN))
  .example(val('Throttle', '300'))
  .run(async (ctx) => {
    const throttle = ctx.example.val('Throttle');

    class AddInvalid extends AddSync {
      throttle = throttle;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new AddInvalid(1))).toThrow(StoreException);
  });
