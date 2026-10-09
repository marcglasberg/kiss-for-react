import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, StoreException, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Retry and wrapReduce');

type St = { n: number };

Bdd(feature)
  .scenario('A custom wrapReduce still runs when retry is on.')
  .given('An ASYNC action with retry on.')
  .and('The action has a custom wrapReduce that discards the reducer result.')
  .when('The action is dispatched.')
  .then('The custom wrapReduce runs.')
  .and('The state does not change, because wrapReduce discarded the result.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });
    let wrapCalled = false;

    class DiscardResult extends KissAction<St> {
      retry = { on: true, initialDelay: 0 };

      wrapReduce(reduce: () => any) {
        return () => {
          wrapCalled = true;
          reduce();
          return null;
        };
      }

      async reduce() {
        return (s: St) => ({ n: s.n + 1 });
      }
    }

    await store.dispatchAndWait(new DiscardResult());
    expect(wrapCalled).toBe(true);
    expect(store.state.n).toBe(0);
  });

Bdd(feature)
  .scenario('A custom wrapReduce can change the result of an action with retry.')
  .given('An ASYNC action with retry on, whose reducer adds 1.')
  .and('The action has a custom wrapReduce that adds another 10 to the result.')
  .when('The action is dispatched.')
  .then('The state gets both changes.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    class AddOneThenTen extends KissAction<St> {
      retry = { on: true, initialDelay: 0 };

      wrapReduce(reduce: () => any) {
        return async () => {
          const fn = await reduce();
          return (s: St) => ({ n: fn(s).n + 10 });
        };
      }

      async reduce() {
        return (s: St) => ({ n: s.n + 1 });
      }
    }

    await store.dispatchAndWait(new AddOneThenTen());
    expect(store.state.n).toBe(11);
  });

Bdd(feature)
  .scenario('A custom wrapReduce runs on every retry attempt.')
  .given('An ASYNC action with retry on, and a custom wrapReduce.')
  .and('The reducer fails the first 2 times, and then succeeds.')
  .when('The action is dispatched.')
  .then('The custom wrapReduce runs once per attempt, 3 times in total.')
  .and('The state changes once.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });
    let wrapCalls = 0;
    let reduceCalls = 0;

    class FailsTwice extends KissAction<St> {
      retry = { on: true, initialDelay: 0, maxRetries: 5 };

      wrapReduce(reduce: () => any) {
        return () => {
          wrapCalls++;
          return reduce();
        };
      }

      async reduce() {
        reduceCalls++;
        if (reduceCalls <= 2) throw new UserException('fail');
        return (s: St) => ({ n: s.n + 1 });
      }
    }

    await store.dispatchAndWait(new FailsTwice());
    expect(reduceCalls).toBe(3);
    expect(wrapCalls).toBe(3);
    expect(store.state.n).toBe(1);
  });

Bdd(feature)
  .scenario('Dispatching an action with retry does not replace its wrapReduce method.')
  .given('An ASYNC action with retry on, and a custom wrapReduce.')
  .when('The action is dispatched.')
  .then('The action still has its own wrapReduce method.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });

    class MyAction extends KissAction<St> {
      retry = { on: true, initialDelay: 0 };

      wrapReduce(reduce: () => any) {
        return reduce;
      }

      async reduce() {
        return (s: St) => ({ n: s.n + 1 });
      }
    }

    const action = new MyAction();
    await store.dispatchAndWait(action);
    expect(action.wrapReduce).toBe(MyAction.prototype.wrapReduce);
    expect(store.state.n).toBe(1);
  });

Bdd(feature)
  .scenario('When a custom wrapReduce throws synchronously, the action fails with its error.')
  .given('An ASYNC action with retry on.')
  .and('The action has a custom wrapReduce that throws an error synchronously, without calling the reducer.')
  .when('The action is dispatched.')
  .then('The action fails with the error thrown by wrapReduce.')
  .and('It is not retried, since the reducer is ASYNC, and never ran.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 } });
    const error = new UserException('wrapReduce failed');
    let wrapCalls = 0;
    let reduceCalls = 0;

    class WrapThrows extends KissAction<St> {
      retry = { on: true, initialDelay: 0 };

      wrapReduce() {
        return () => {
          wrapCalls++;
          throw error;
        };
      }

      async reduce() {
        reduceCalls++;
        return (s: St) => ({ n: s.n + 1 });
      }
    }

    const action = new WrapThrows();
    await store.dispatchAndWait(action);
    expect(action.status.originalError).toBe(error);
    expect(wrapCalls).toBe(1);
    expect(reduceCalls).toBe(0);
    expect(store.state.n).toBe(0);
  });

Bdd(feature)
  .scenario('A SYNC reducer with retry fails, even when a custom wrapReduce calls it asynchronously.')
  .given('A SYNC action with retry on, whose reducer always fails.')
  .and('The action has a custom wrapReduce that waits a little, and only then calls the reducer.')
  .when('The action is dispatched.')
  .then('The reducer runs only once.')
  .and('It fails with a StoreException saying retry needs an ASYNC reducer.')
  .run(async (_) => {
    const store = new Store<St>({ initialState: { n: 0 }, errorObserver: () => false });
    let reduceCalls = 0;

    class WrapCallsSyncReducerLater extends KissAction<St> {
      retry = { on: true, initialDelay: 0 };

      wrapReduce(reduce: () => any) {
        return async () => {
          await Promise.resolve();
          return reduce();
        };
      }

      reduce(): St {
        reduceCalls++;
        throw new UserException('Failed');
      }
    }

    const action = new WrapCallsSyncReducerLater();
    await store.dispatchAndWait(action);
    expect(reduceCalls).toBe(1);
    expect(action.status.originalError).toBeInstanceOf(StoreException);
    expect(action.status.originalError.message).toContain('uses retry, but its reducer is SYNC');
  });
