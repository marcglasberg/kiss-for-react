import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Debounce');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sync action, debounced for 50 millis, that adds `value` to the count.
class AddSync extends KissAction<State> {
  debounce: number | boolean = 50;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  reduce() {
    this.trace.push(`reduce ${this.value}`);
    return new State(this.state.count + this.value);
  }
}

// Async action, debounced for 50 millis, that adds `value` to the count.
class AddAsync extends KissAction<State> {
  debounce: number | boolean = 50;

  constructor(readonly value: number, readonly trace: string[] = []) { super(); }

  async reduce() {
    this.trace.push(`reduce ${this.value}`);
    await delayMillis(1);
    return (state: State) => new State(state.count + this.value);
  }
}

Bdd(feature)
  .scenario('A sync action is debounced when dispatched several times quickly.')
  .given('A SYNC action with debounce.')
  .when('The action is dispatched 3 times in quick succession.')
  .then('Only the last action runs its reducer, once, after the debounce period.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddSync(1, log));
    store.dispatch(new AddSync(10, log));
    store.dispatch(new AddSync(100, log));
    expect(store.state.count).toBe(0);

    await delayMillis(20);
    expect(log).toEqual([]);
    expect(store.state.count).toBe(0);

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 100']);
    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('An async action is debounced when dispatched several times quickly.')
  .given('An ASYNC action with debounce.')
  .when('The action is dispatched 3 times in quick succession.')
  .then('Only the last action runs its reducer, once, after the debounce period.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddAsync(1, log));
    store.dispatch(new AddAsync(10, log));
    store.dispatch(new AddAsync(100, log));

    await delayMillis(20);
    expect(log).toEqual([]);

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 100']);
    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('Each dispatch resets the debounce period.')
  .given('An action with debounce.')
  .when('The action is dispatched several times, each one before the debounce period of the previous ends.')
  .then('No action runs until the dispatches stop for the debounce period.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    for (let i = 1; i <= 4; i++) {
      store.dispatch(new AddSync(i, log));
      await delayMillis(30);
    }
    // 120 millis passed, which is more than the 50 millis debounce, but no action ran.
    expect(log).toEqual([]);

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 4']);
    expect(store.state.count).toBe(4);
  });

Bdd(feature)
  .scenario('An action runs again after the debounce period expires.')
  .given('An action with debounce.')
  .when('The action is dispatched.')
  .and('After the debounce period, it is dispatched again.')
  .then('Each dispatch runs its reducer.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new AddAsync(1, log));
    expect(store.state.count).toBe(1);

    await store.dispatchAndWait(new AddAsync(10, log));
    expect(store.state.count).toBe(11);

    expect(log).toEqual(['reduce 1', 'reduce 10']);
  });

Bdd(feature)
  .scenario('An action dispatched during the debounce period finishes right away, without running its reducer.')
  .given('An action with debounce, that is waiting for its debounce period.')
  .when('Another action of the same class is dispatched.')
  .then('The first action finishes right away, without failing.')
  .and('Its before and after methods run, but not its reducer.')
  .and('Only the second action changes the state.')
  .run(async (_) => {
    const log: string[] = [];

    class Add extends AddSync {
      before() { this.trace.push(`before ${this.value}`); }

      after() { this.trace.push(`after ${this.value}`); }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const first = new Add(1, log);
    const firstPromise = store.dispatchAndWait(first);
    expect(store.isWaiting(Add)).toBe(true);

    store.dispatch(new Add(10, log));
    const firstStatus = await firstPromise;
    expect(firstStatus.isCompletedOk).toBe(true);
    expect(log).toEqual(['before 1', 'before 10', 'after 1']);
    expect(store.state.count).toBe(0);
    expect(store.isWaiting(Add)).toBe(true);

    await store.waitAllActions([]);
    expect(log).toEqual(['before 1', 'before 10', 'after 1', 'reduce 10', 'after 10']);
    expect(store.state.count).toBe(10);
    expect(store.isWaiting(Add)).toBe(false);
  });

Bdd(feature)
  .scenario('Setting debounce to true uses the default debounce period of 333 milliseconds.')
  .given('An action with debounce = true.')
  .when('The action is dispatched.')
  .then('It runs its reducer only after 333 milliseconds.')
  .run(async (_) => {
    class AddDefault extends AddSync {
      debounce = true;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const start = Date.now();
    store.dispatch(new AddDefault(1));

    await delayMillis(250);
    expect(store.state.count).toBe(0);

    await store.waitAllActions([]);
    expect(store.state.count).toBe(1);
    expect(Date.now() - start).toBeGreaterThanOrEqual(330);
  });

Bdd(feature)
  .scenario('Setting debounce to false turns off the debounce a base class turned on.')
  .given('An action with debounce = false, that extends an action with debounce.')
  .when('The action is dispatched.')
  .then('It runs right away.')
  .run(async (_) => {
    class AddNoDebounce extends AddSync {
      debounce = false;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    store.dispatch(new AddNoDebounce(1));
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('By default, actions of different classes do not debounce each other.')
  .given('Two different action classes with debounce.')
  .and('One of them is a subclass of the other.')
  .when('Both actions are dispatched in quick succession.')
  .then('Both actions run their reducers.')
  .run(async (_) => {
    class AddSub extends AddSync {
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddSync(1, log));
    store.dispatch(new AddSub(10, log));

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 1', 'reduce 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('Actions of different classes with the same lock debounce each other.')
  .given('Two different action classes with debounce.')
  .and('Both override debounceLockBuilder to return the same lock.')
  .when('Both actions are dispatched in quick succession.')
  .then('Only the last action runs its reducer.')
  .run(async (_) => {
    class Add1 extends AddSync {
      debounceLockBuilder() { return 'myLock'; }
    }

    class Add2 extends AddSync {
      debounceLockBuilder() { return 'myLock'; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Add1(1, log));
    store.dispatch(new Add2(10, log));

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 10']);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('Actions of the same class with different locks do not debounce each other.')
  .given('An action with debounce, whose lock depends on one of its fields.')
  .when('Actions with different values of that field are dispatched in quick succession.')
  .then('The actions with different locks debounce separately.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      debounceLockBuilder() { return this.user; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForUser('A', 1, log));
    store.dispatch(new AddForUser('B', 10, log));
    store.dispatch(new AddForUser('A', 100, log));
    store.dispatch(new AddForUser('B', 1000, log));

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 100', 'reduce 1000']);
    expect(store.state.count).toBe(1100);
  });

Bdd(feature)
  .scenario('Array locks are compared by their contents.')
  .given('An action with debounce, whose lock is a new array with its class and a field.')
  .when('Actions with the same field value are dispatched in quick succession.')
  .then('They debounce each other.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      debounceLockBuilder() { return [this.constructor, this.user]; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddForUser('A', 1, log));
    store.dispatch(new AddForUser('A', 10, log));

    await store.waitAllActions([]);
    expect(log).toEqual(['reduce 10']);
  });

Bdd(feature)
  .scenario('Removing all debounce locks makes the waiting actions finish without running their reducers.')
  .given('Two actions with debounce and different locks, waiting for their debounce period.')
  .when('removeAllDebounceLocks is called.')
  .then('Both actions finish right away, without running their reducers.')
  .and('A new action with debounce still runs after its debounce period.')
  .run(async (_) => {
    class AddForUser extends AddSync {
      constructor(readonly user: string, value: number, log: string[]) { super(value, log); }

      debounceLockBuilder() { return this.user; }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const actionA = new AddForUser('A', 1, log);
    const actionB = new AddForUser('B', 10, log);
    store.dispatch(actionA);
    store.dispatch(actionB);

    actionA.removeAllDebounceLocks();
    await store.waitAllActions([actionA, actionB]);
    expect(actionA.status.isCompletedOk).toBe(true);
    expect(actionB.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(0);

    await store.dispatchAndWait(new AddForUser('A', 100, log));
    expect(log).toEqual(['reduce 100']);
    expect(store.state.count).toBe(100);
  });

Bdd(feature)
  .scenario('A custom wrapReduce only runs for the action that runs its reducer.')
  .given('An action with debounce and a custom wrapReduce.')
  .when('The action is dispatched twice in quick succession.')
  .then('The wrapReduce runs only once, after the debounce period.')
  .run(async (_) => {
    const log: string[] = [];

    class AddWrapped extends AddSync {
      wrapReduce(reduce: () => any) {
        this.trace.push(`wrap ${this.value}`);
        return reduce;
      }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddWrapped(1, log));
    store.dispatch(new AddWrapped(10, log));
    expect(log).toEqual([]);

    await store.waitAllActions([]);
    expect(log).toEqual(['wrap 10', 'reduce 10']);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('A debounced action uses the state at the time its reducer runs.')
  .given('An action with debounce.')
  .when('The action is dispatched.')
  .and('The state changes during the debounce period.')
  .then('The reducer reads the changed state.')
  .run(async (_) => {
    class AddNow extends KissAction<State> {
      constructor(readonly value: number) { super(); }

      reduce() { return new State(this.state.count + this.value); }
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new AddSync(1));
    store.dispatch(new AddNow(10));
    expect(store.state.count).toBe(10);

    await store.waitAllActions([]);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('A debounced action can not be dispatched with dispatchSync.')
  .given('A SYNC action with debounce.')
  .when('The action is dispatched with dispatchSync.')
  .then('The dispatch throws a StoreException.')
  .and('The reducer does not run.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    expect(() => store.dispatchSync(new AddSync(1, log))).toThrow(StoreException);

    await delayMillis(80);
    expect(log).toEqual([]);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('Debounce can not be combined with retry.')
  .given('An action with both debounce and retry.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class AddRetry extends AddAsync {
      retry = { on: true };
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new AddRetry(1))).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('Debounce can not be used in an OptimisticCommand.')
  .given('An OptimisticCommand with debounce.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .run(async (_) => {
    class Save extends OptimisticCommand<State, number> {
      debounce = 50;

      optimisticValue() { return 1; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer() {}
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new Save())).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('An invalid debounce value makes the dispatch throw.')
  .given('An action with an invalid debounce value.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException.')
  .example(val('Debounce', -1))
  .example(val('Debounce', NaN))
  .example(val('Debounce', '300'))
  .run(async (ctx) => {
    const debounce = ctx.example.val('Debounce');

    class AddInvalid extends AddSync {
      debounce = debounce;
    }

    const store = new Store<State>({ initialState: new State(0), logger: logger });
    expect(() => store.dispatch(new AddInvalid(1))).toThrow(StoreException);
  });
