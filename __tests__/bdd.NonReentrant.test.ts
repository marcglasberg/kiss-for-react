import { expect, test } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, UserException } from '../src';
import { delayMillis } from "../src/utils";

reporter(new FeatureFileReporter());

const feature = new Feature('Non reentrant actions');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('Sync action non-reentrant does not call itself.')
  .given('A SYNC action that calls itself.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    store.dispatch(new NonReentrantSyncActionCallsItself());
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('Async action non-reentrant does not call itself.')
  .given('An ASYNC action that calls itself.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    expect(store.state.count).toBe(1);
    store.dispatch(new NonReentrantAsyncActionCallsItself());
    expect(store.state.count).toBe(2);
  });


Bdd(feature)
  .scenario('Async action non-reentrant does start before an action of the same type finished.')
  .given('An ASYNC action takes some time to finish.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .and('Another action of the same type is dispatched before the previous one finished.')
  .then('It runs only once.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    // We start with count 1.
    expect(store.state.count).toBe(1);
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(false);

    // We dispatch an action that will wait for 100 millis and increment 10.
    store.dispatch(new NonReentrantAsyncAction(10, 100));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    // So far, we still have count 1.
    expect(store.state.count).toBe(1);

    // We wait a little bit and dispatch ANOTHER action that will wait for 10 millis and increment 50.
    await delayMillis(10);
    store.dispatch(new NonReentrantAsyncAction(50, 10));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    // We wait for all actions to finish dispatching.
    await store.waitAllActions([]);
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(false);

    // The only action that ran was the first one, which incremented by 10 (1+10 = 11).
    // The second action was aborted.
    expect(store.state.count).toBe(11);
  });

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

class NonReentrantSyncActionCallsItself extends KissAction<State> {

  nonReentrant = true;

  reduce() {
    this.dispatch(new NonReentrantSyncActionCallsItself());
    return new State(this.state.count + 1);
  }
}

class NonReentrantAsyncActionCallsItself extends KissAction<State> {

  nonReentrant = true;

  async reduce() {
    this.dispatch(new NonReentrantSyncActionCallsItself());
    return (state: State) => new State(state.count + 1);
  }
}

class NonReentrantAsyncAction extends KissAction<State> {

  constructor(
    public increment: number,
    public delayMillis: number,
  ) {
    super();
  }

  nonReentrant = true;

  async reduce() {
    await delayMillis(this.delayMillis);
    return (state: State) => new State(state.count + this.increment);
  }
}

Bdd(feature)
  .scenario('dispatchAndWait does not start a non-reentrant action while one of the same type is running.')
  .given('An ASYNC action takes some time to finish.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .and('Two other actions of the same type are dispatched with dispatchAndWait before the first one finished.')
  .then('The reducer runs only once.')
  .and('The dispatchAndWait calls resolve, with a status saying the action was not dispatched.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    store.dispatch(new NonReentrantAsyncAction(10, 100));
    expect(store.isWaiting(NonReentrantAsyncAction)).toBe(true);

    const status1 = await store.dispatchAndWait(new NonReentrantAsyncAction(50, 10));
    const status2 = await store.dispatchAndWait(new NonReentrantAsyncAction(500, 10));
    expect(status1.isDispatched).toBe(false);
    expect(status2.isDispatched).toBe(false);

    await store.waitAllActions([]);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('dispatchSync does not start a non-reentrant action while one of the same type is running.')
  .given('A SYNC action that calls itself with dispatchSync.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched with dispatchSync.')
  .then('It runs once.')
  .and('Does not result in a stack overflow.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    store.dispatchSync(new NonReentrantSyncActionCallsItselfWithDispatchSync());
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('An action calling dispatchAndWait on itself does not start a non-reentrant action twice.')
  .given('An ASYNC action that calls itself with dispatchAndWait.')
  .and('The action is non-reentrant.')
  .when('The action is dispatched.')
  .then('It runs once.')
  .and('It finishes, instead of waiting for itself forever.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State(1), logger: logger,
    });

    const status = await store.dispatchAndWait(new NonReentrantAsyncActionCallsItselfWithDispatchAndWait());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });

/** A promise that the test resolves or rejects when it wants. */
class Deferred<T = any> {
  resolve!: (value: T) => void;
  reject!: (error: any) => void;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

/** A non-reentrant action that waits for the given promise, and logs when it runs. */
class Save extends KissAction<State> {
  nonReentrant = true;

  constructor(readonly events: string[], readonly name: string, readonly wait: Promise<any>) {
    super();
  }

  async reduce() {
    this.events.push(this.name);
    await this.wait;
    return null;
  }
}

class SaveWithExtras extends Save {
}

Bdd(feature)
  .scenario('A non-reentrant action is not aborted by a running action of a subclass.')
  .given('A non-reentrant action, and a subclass of it.')
  .when('The subclass action is dispatched.')
  .and('The superclass action is dispatched while the subclass action is running.')
  .then('Both actions run.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new SaveWithExtras(log, 'sub', server.promise));
    store.dispatch(new Save(log, 'base', server.promise));
    expect(log).toEqual(['sub', 'base']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('A non-reentrant action is not aborted by a running action of its superclass.')
  .given('A non-reentrant action, and a subclass of it.')
  .when('The superclass action is dispatched.')
  .and('The subclass action is dispatched while the superclass action is running.')
  .then('Both actions run.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new Save(log, 'base', server.promise));
    store.dispatch(new SaveWithExtras(log, 'sub', server.promise));
    expect(log).toEqual(['base', 'sub']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('Non-reentrant actions with different key params run at the same time.')
  .given('A non-reentrant action that uses the item id as its non-reentrant key params.')
  .when('The action is dispatched for item A, and again for item A, and for item B, while the first one is running.')
  .then('The second action for item A is aborted.')
  .and('The action for item B runs.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();

    class SaveItem extends Save {
      constructor(readonly itemId: string) {
        super(log, itemId, server.promise);
      }

      nonReentrantKeyParams() {
        return this.itemId;
      }
    }

    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new SaveItem('A'));
    store.dispatch(new SaveItem('A'));
    store.dispatch(new SaveItem('B'));
    expect(log).toEqual(['A', 'B']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('Key params that are arrays or plain objects are compared by their contents.')
  .given('A non-reentrant action that uses an array as its non-reentrant key params.')
  .when('The action is dispatched twice, with different arrays with the same contents.')
  .and('Then dispatched with an array with different contents.')
  .then('The second action is aborted.')
  .and('The third action runs.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();

    class SaveItem extends Save {
      constructor(readonly key: string[]) {
        super(log, key.join(), server.promise);
      }

      nonReentrantKeyParams() {
        return this.key;
      }
    }

    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new SaveItem(['A', 'B']));
    store.dispatch(new SaveItem(['A', 'B']));
    store.dispatch(new SaveItem(['A', 'C']));
    expect(log).toEqual(['A,B', 'A,C']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('Different non-reentrant actions with the same key block each other.')
  .given('Two different non-reentrant actions, that compute the same non-reentrant key for the same user.')
  .when('The first action is dispatched for a user.')
  .and('The second action is dispatched for the same user, and then for another user, while the first one is running.')
  .then('The second action for the same user is aborted.')
  .and('The second action for the other user runs.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();

    class SaveUser extends Save {
      constructor(readonly userId: string) {
        super(log, 'save ' + userId, server.promise);
      }

      computeNonReentrantKey() {
        return this.userId;
      }
    }

    class DeleteUser extends Save {
      constructor(readonly userId: string) {
        super(log, 'delete ' + userId, server.promise);
      }

      computeNonReentrantKey() {
        return this.userId;
      }
    }

    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new SaveUser('123'));
    store.dispatch(new DeleteUser('123'));
    store.dispatch(new DeleteUser('456'));
    expect(log).toEqual(['save 123', 'delete 456']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('A non-reentrant action and an optimistic command with the same key block each other.')
  .given('A non-reentrant action and an optimistic command, that compute the same non-reentrant key.')
  .when('The non-reentrant action is dispatched.')
  .and('The optimistic command is dispatched while the non-reentrant action is running.')
  .then('The optimistic command is aborted.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();

    class SaveUser extends Save {
      constructor() {
        super(log, 'save', server.promise);
      }

      computeNonReentrantKey() {
        return 'user';
      }
    }

    class DeleteUser extends OptimisticCommand<State, number> {
      optimisticValue() { return 0; }
      getValueFromState(state: State) { return state.count; }
      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer() {
        log.push('delete');
      }

      computeNonReentrantKey() {
        return 'user';
      }
    }

    const store = new Store<State>({ initialState: new State(1), logger: logger });

    store.dispatch(new SaveUser());
    store.dispatch(new DeleteUser());
    expect(log).toEqual(['save']);
    expect(store.state.count).toBe(1);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('The non-reentrant key is released when the action fails.')
  .given('A non-reentrant action that fails.')
  .when('The action is dispatched and fails.')
  .and('The action is dispatched again.')
  .then('The second action runs.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: logger });

    const failure = new Deferred();
    failure.reject(new UserException('Failed.'));
    await store.dispatchAndWait(new Save(log, 'first', failure.promise));

    await store.dispatchAndWait(new Save(log, 'second', Promise.resolve()));
    expect(log).toEqual(['first', 'second']);
  });

class NonReentrantSyncActionCallsItselfWithDispatchSync extends KissAction<State> {

  nonReentrant = true;

  reduce() {
    this.dispatchSync(new NonReentrantSyncActionCallsItselfWithDispatchSync());
    return new State(this.state.count + 1);
  }
}

class NonReentrantAsyncActionCallsItselfWithDispatchAndWait extends KissAction<State> {

  nonReentrant = true;

  async reduce() {
    await this.dispatchAndWait(new NonReentrantAsyncActionCallsItselfWithDispatchAndWait());
    return (state: State) => new State(state.count + 1);
  }
}

