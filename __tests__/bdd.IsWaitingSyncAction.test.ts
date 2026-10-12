import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('isWaiting with sync actions');

type St = { n: number };

class SyncA extends KissAction<St> {
  static seen: boolean | undefined;

  reduce() {
    SyncA.seen = this.isWaiting(SyncA);
    return { n: this.state.n + 1 };
  }
}

class AsyncA extends KissAction<St> {
  async reduce() {
    await delayMillis(10);
    return (state: St) => ({ n: state.n + 1 });
  }
}

Bdd(feature)
  .scenario('Outside the action, isWaiting is always false for a sync action.')
  .given('A sync action.')
  .when('The action is dispatched.')
  .then('isWaiting for its type is false before the dispatch, and false when the dispatch returns.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState: { n: 0 }, logger: null });
    expect(store.isWaiting(SyncA)).toBe(false);

    // When:
    store.dispatch(new SyncA());

    // Then:
    expect(store.state.n).toBe(1);
    expect(store.isWaiting(SyncA)).toBe(false);
  });

Bdd(feature)
  .scenario('Inside a sync action, isWaiting for its own type is true, since it is being processed.')
  .given('A sync action whose reducer checks isWaiting for its own type.')
  .when('The action is dispatched.')
  .then('isWaiting is true inside the reducer.')
  .and('It is false when the dispatch returns.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState: { n: 0 }, logger: null });
    SyncA.seen = undefined;

    // When:
    store.dispatch(new SyncA());

    // Then:
    expect(SyncA.seen).toBe(true);
    expect(store.isWaiting(SyncA)).toBe(false);
  });

Bdd(feature)
  .scenario('Outside the action, isWaiting is true for an async action, until it finishes.')
  .given('An async action.')
  .when('The action is dispatched.')
  .then('isWaiting for its type is true while it runs.')
  .and('It is false when the action finishes.')
  .run(async (_) => {
    // Given:
    const store = new Store<St>({ initialState: { n: 0 }, logger: null });

    // When:
    const promise = store.dispatchAndWait(new AsyncA());

    // Then:
    expect(store.isWaiting(AsyncA)).toBe(true);
    await promise;
    expect(store.isWaiting(AsyncA)).toBe(false);
    expect(store.state.n).toBe(1);
  });
