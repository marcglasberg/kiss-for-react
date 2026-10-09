import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';

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
