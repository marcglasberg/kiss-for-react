import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store, StoreException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchAndWaitAll when a dispatch throws right away');

const logger = (_: string) => {};

class State {
  constructor(readonly count: number) {
  }
}

class AsyncIncrement extends KissAction<State> {
  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 20));
    return (state: State) => new State(state.count + 1);
  }
}

class AsyncFail extends KissAction<State> {
  constructor(readonly error: Error) {
    super();
  }

  async reduce(): Promise<null> {
    await new Promise(resolve => setTimeout(resolve, 10));
    throw this.error;
  }
}

class Mocked extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 100);
  }
}

/** Collects unhandled promise rejections while `fn` runs, plus a few ticks after it. */
async function collectUnhandledRejections(fn: () => Promise<void>): Promise<unknown[]> {
  const rejections: unknown[] = [];
  const listener = (reason: unknown) => rejections.push(reason);
  process.on('unhandledRejection', listener);
  try {
    await fn();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    process.off('unhandledRejection', listener);
  }
  return rejections;
}

/**
 * Returns an action whose dispatch throws right away, for the given cause,
 * and the error that the dispatch throws (or a check for it).
 */
async function actionThatCantBeDispatched(store: Store<State>, cause: string)
  : Promise<{ action: KissAction<State>, check: (error: any) => void }> {
  if (cause === 'was already dispatched') {
    const action = new AsyncIncrement();
    await store.dispatchAndWait(action);
    return {
      action,
      check: (error) => {
        expect(error).toBeInstanceOf(StoreException);
        expect(error.message)
          .toBe('The action was already dispatched. Please, create a new action each time.');
      },
    };
  }
  //
  else if (cause === 'is mocked by a function that throws') {
    const mockError = new Error('Mock error');
    store.mocks.add(Mocked, () => {
      throw mockError;
    });
    return {action: new Mocked(), check: (error) => expect(error).toBe(mockError)};
  }
  //
  else if (cause === 'is mocked as an action that was already dispatched') {
    const used = new AsyncIncrement();
    await store.dispatchAndWait(used);
    store.mocks.add(Mocked, () => used);
    return {
      action: new Mocked(),
      check: (error) => {
        expect(error).toBeInstanceOf(StoreException);
        expect(error.message)
          .toBe('The action was already dispatched. Please, create a new action each time.');
      },
    };
  }
  //
  else throw new Error(`Unknown cause: ${cause}`);
}

Bdd(feature)
  .scenario('dispatchAndWaitAll dispatches all actions, even when one of them can\'t be dispatched.')
  .given('A list of three actions.')
  .and('The first and the last actions are ok.')
  .and('The dispatch of the middle action throws right away, because the middle action <Cause>.')
  .when('The actions are dispatched with dispatchAndWaitAll, and awaited.')
  .then('The first and the last actions are dispatched and finish OK.')
  .and('Only then dispatchAndWaitAll rejects, with the error thrown by the dispatch of the middle action.')
  .example(val('Cause', 'was already dispatched'))
  .example(val('Cause', 'is mocked by a function that throws'))
  .example(val('Cause', 'is mocked as an action that was already dispatched'))
  .run(async (ctx) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const {action: middle, check} = await actionThatCantBeDispatched(store, ctx.example.val('Cause'));
    const countBefore = store.state.count;
    const first = new AsyncIncrement();
    const last = new AsyncIncrement();

    // When
    let caught: any = null;
    let lastFinishedWhenRejected: boolean | null = null;
    await store.dispatchAndWaitAll([first, middle, last]).catch((error) => {
      caught = error;
      lastFinishedWhenRejected = last.status.isCompletedOk;
    });

    // Then
    expect(first.status.isDispatched).toBe(true);
    expect(last.status.isDispatched).toBe(true);
    expect(first.status.isCompletedOk).toBe(true);
    expect(last.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(countBefore + 2);

    expect(caught).not.toBeNull();
    check(caught);
    expect(lastFinishedWhenRejected).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchAndWaitAll dispatches all actions, even when the same action appears twice in the list.')
  .given('A list of three actions, where the last one is the same action instance as the first.')
  .when('The actions are dispatched with dispatchAndWaitAll, and awaited.')
  .then('The first and the middle actions are dispatched and finish OK, and the first runs only once.')
  .and('Only then dispatchAndWaitAll rejects, with a StoreException saying the action was already dispatched.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const first = new AsyncIncrement();
    const middle = new AsyncIncrement();

    // When
    let caught: any = null;
    let middleFinishedWhenRejected: boolean | null = null;
    await store.dispatchAndWaitAll([first, middle, first]).catch((error) => {
      caught = error;
      middleFinishedWhenRejected = middle.status.isCompletedOk;
    });

    // Then
    expect(first.status.isCompletedOk).toBe(true);
    expect(middle.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);

    expect(caught).toBeInstanceOf(StoreException);
    expect(caught.message)
      .toBe('The action was already dispatched. Please, create a new action each time.');
    expect(middleFinishedWhenRejected).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchAndWaitAll rejects with the error of the first failed action in the list.')
  .given('A list with an ok action, an action that fails while running, and an action that can\'t be dispatched.')
  .and('The action that fails while running comes <Order> the action that can\'t be dispatched.')
  .when('The actions are dispatched with dispatchAndWaitAll, and awaited.')
  .then('All actions that can be dispatched are dispatched and finish.')
  .and('dispatchAndWaitAll rejects with the error of the one that comes first in the list.')
  .example(val('Order', 'before'))
  .example(val('Order', 'after'))
  .run(async (ctx) => {
    const order = ctx.example.val('Order') as string;

    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const used = new AsyncIncrement();
    await store.dispatchAndWait(used);
    const runError = new Error('Run error');
    const failing = new AsyncFail(runError);
    const ok = new AsyncIncrement();
    const actions = (order === 'before') ? [failing, used, ok] : [used, failing, ok];

    // When
    let caught: any = null;
    await store.dispatchAndWaitAll(actions).catch((error) => caught = error);

    // Then
    expect(failing.status.isCompletedFailed).toBe(true);
    expect(failing.status.originalError).toBe(runError);
    expect(ok.status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);

    if (order === 'before') {
      expect(caught).toBe(runError);
    } else {
      expect(caught).toBeInstanceOf(StoreException);
      expect(caught.message)
        .toBe('The action was already dispatched. Please, create a new action each time.');
    }
  });

Bdd(feature)
  .scenario('When a dispatch of dispatchAndWaitAll throws right away, failed actions don\'t cause unhandled rejections.')
  .given('A list of three actions.')
  .and('The first action fails while running.')
  .and('The dispatch of the middle action throws right away, because it was already dispatched.')
  .and('The last action is ok.')
  .when('The actions are dispatched with dispatchAndWaitAll, and its rejection is handled.')
  .then('There are no unhandled promise rejections.')
  .and('dispatchAndWaitAll rejects with the error of the first action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({initialState: new State(0), logger});
    const used = new AsyncIncrement();
    await store.dispatchAndWait(used);
    const runError = new Error('Run error');
    const failing = new AsyncFail(runError);
    const ok = new AsyncIncrement();

    // When
    let caught: any = null;
    const rejections = await collectUnhandledRejections(async () => {
      await store.dispatchAndWaitAll([failing, used, ok]).catch((error) => caught = error);
    });

    // Then
    expect(rejections).toEqual([]);
    expect(caught).toBe(runError);
    expect(ok.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchAndWaitAll returns a rejected Promise (it doesn\'t throw) when the store is not ready.')
  .given('A store that is not ready yet, because it is still reading the persisted state.')
  .when('Two actions are dispatched with dispatchAndWaitAll.')
  .then('dispatchAndWaitAll doesn\'t throw, but returns a Promise that rejects with a StoreException.')
  .and('No action runs.')
  .run(async (_) => {
    // Given
    const persistor = new NeverReadyPersistor();
    const store = new Store<State>({initialState: new State(0), persistor, logger});
    const action1 = new AsyncIncrement();
    const action2 = new AsyncIncrement();

    // When
    let promise: Promise<any> | null = null;
    expect(() => promise = store.dispatchAndWaitAll([action1, action2])).not.toThrow();

    // Then
    let caught: any = null;
    await promise!.catch((error: any) => caught = error);
    expect(caught).toBeInstanceOf(StoreException);
    expect(action1.status.isDispatched).toBe(false);
    expect(action2.status.isDispatched).toBe(false);
    expect(store.state.count).toBe(0);
  });

/** A persistor that never finishes reading the state, so the store is never ready. */
class NeverReadyPersistor extends Persistor<State> {
  async readState(): Promise<State | null> {
    return new Promise<State | null>(() => {});
  }

  async saveInitialState(_state: State) {
  }

  async deleteState() {
  }

  async persistDifference(_lastPersistedState: State | null, _newState: State) {
  }

  get throttle(): number | null {
    return null;
  }
}
