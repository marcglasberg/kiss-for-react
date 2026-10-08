import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Async after method');

/** Collects unhandled promise rejections while `fn` runs, plus a few ticks after it. */
async function collectUnhandledRejections(fn: () => Promise<void>): Promise<unknown[]> {
  const rejections: unknown[] = [];
  const listener = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await fn();
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.off('unhandledRejection', listener);
  }
  return rejections;
}

Bdd(feature)
  .scenario('An async after method that throws does not cause an unhandled rejection.')
  .given('A sync action whose after method is async and throws an error.')
  .when('The action is dispatched.')
  .then('The error does not become an unhandled promise rejection.')
  .and('The error is logged.')
  .and('The action completes OK.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });
    const action = new SyncActionWithAsyncAfterThatThrows();

    const rejections = await collectUnhandledRejections(async () => {
      await store.dispatchAndWait(action);
    });

    expect(rejections).toEqual([]);
    expect(logs.some((log) => log.includes('After failed (sync action)'))).toBe(true);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('An async after method that throws, in an async action, does not cause an unhandled rejection.')
  .given('An async action whose after method is async and throws an error.')
  .when('The action is dispatched.')
  .then('The error does not become an unhandled promise rejection.')
  .and('The error is logged.')
  .and('The action completes OK.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });
    const action = new AsyncActionWithAsyncAfterThatThrows();

    const rejections = await collectUnhandledRejections(async () => {
      await store.dispatchAndWait(action);
    });

    expect(rejections).toEqual([]);
    expect(logs.some((log) => log.includes('After failed (async action)'))).toBe(true);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('An async after method that does not throw works normally.')
  .given('An action whose after method is async and does not throw.')
  .when('The action is dispatched.')
  .then('The after method runs, and nothing is logged as an error.')
  .run(async (_) => {
    const logs: string[] = [];
    const store = new Store<State>({ initialState: new State(1), logger: (obj) => logs.push(String(obj)) });
    const action = new ActionWithAsyncAfterThatWorks();

    const rejections = await collectUnhandledRejections(async () => {
      await store.dispatchAndWait(action);
    });

    expect(rejections).toEqual([]);
    expect(action.afterRan).toBe(true);
    expect(logs.some((log) => log.includes('after() method'))).toBe(false);
    expect(action.status.isCompletedOk).toBe(true);
  });

class State {
  constructor(readonly count: number) {
  }
}

class SyncActionWithAsyncAfterThatThrows extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }

  async after() {
    throw new Error('After failed (sync action)');
  }
}

class AsyncActionWithAsyncAfterThatThrows extends KissAction<State> {
  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return (state: State) => new State(state.count + 1);
  }

  async after() {
    await new Promise((resolve) => setTimeout(resolve, 1));
    throw new Error('After failed (async action)');
  }
}

class ActionWithAsyncAfterThatWorks extends KissAction<State> {
  afterRan = false;

  reduce() {
    return new State(this.state.count + 1);
  }

  async after() {
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.afterRan = true;
  }
}
