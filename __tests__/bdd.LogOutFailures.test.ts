import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut failures');

/** What the `errorObserver` does with the errors. */
type Observer = 'no errorObserver' | 'returns null' | 'returns the error' | 'returns another error';

Bdd(feature)
  .scenario('If deleting the persisted state fails, logOut still resets the state, and then rejects.')
  .given('A store with a persistor, and a saved state.')
  .and('The persistor fails to delete the saved state.')
  .and('The store has <Observer>.')
  .when('We call logOut with a new initial-state.')
  .then('The store state is the initial-state.')
  .and('The initial-state is saved, and the old state is not saved again.')
  .and('The errorObserver got the delete error, with a null action, before logOut rejected.')
  .and('logOut rejects with the delete error.')
  .and('There is no unhandled promise rejection.')
  .example(val('Observer', 'no errorObserver'))
  .example(val('Observer', 'returns null'))
  .example(val('Observer', 'returns the error'))
  .example(val('Observer', 'returns another error'))
  .run(async (ctx) => {
    const observer: Observer = ctx.example.val('Observer');

    // Given:
    const persistor = new FailingPersistor();
    const { store, observed } = await createStore(persistor, observer);
    store.dispatch(new Increment());
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.savedState?.count).toBe(2);
    persistor.failDelete = true;
    persistor.record = [];

    // When:
    const { rejection, unhandled, observedWhenRejected } = await logOutAndCatch(store, observed);

    // Then:
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);
    expect(persistor.record).toEqual(['delete (failed)', 'persist 0']);
    if (observer === 'no errorObserver') expect(observedWhenRejected).toEqual([]);
    else {
      expect(observedWhenRejected.map(o => o.error.message)).toEqual(['delete failed']);
      expect(observedWhenRejected[0].action).toBeNull();
    }
    expect(rejection?.error.message).toBe('delete failed');
    expect(unhandled).toEqual([]);
  });

Bdd(feature)
  .scenario('If saving the initial-state fails, logOut still resets the state, and then rejects.')
  .given('A store with a persistor, and a saved state.')
  .and('The persistor deletes the saved state, but fails to save the initial-state.')
  .and('The store has <Observer>.')
  .when('We call logOut with a new initial-state.')
  .then('The store state is the initial-state.')
  .and('The errorObserver got the save error, with a null action, before logOut rejected.')
  .and('logOut rejects with the save error.')
  .and('There is no unhandled promise rejection.')
  .and('When persistence resumes after logOut, it tries again, and saves the initial-state.')
  .example(val('Observer', 'no errorObserver'))
  .example(val('Observer', 'returns null'))
  .example(val('Observer', 'returns the error'))
  .example(val('Observer', 'returns another error'))
  .run(async (ctx) => {
    const observer: Observer = ctx.example.val('Observer');

    // Given:
    const persistor = new FailingPersistor();
    const { store, observed } = await createStore(persistor, observer);
    store.dispatch(new Increment());
    expect(persistor.savedState?.count).toBe(1);
    persistor.failPersist = 1;
    persistor.record = [];

    // When:
    const { rejection, unhandled, observedWhenRejected } = await logOutAndCatch(store, observed);

    // Then:
    expect(store.state.count).toBe(0);
    if (observer === 'no errorObserver') expect(observedWhenRejected).toEqual([]);
    else {
      expect(observedWhenRejected.map(o => o.error.message)).toEqual(['disk full']);
      expect(observedWhenRejected[0].action).toBeNull();
    }
    expect(rejection?.error.message).toBe('disk full');
    expect(unhandled).toEqual([]);
    expect(persistor.record).toEqual(['delete', 'persist 0 (failed)', 'persist 0']);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('If deleting the state and saving the initial-state both fail, logOut rejects with the delete error.')
  .given('A store with a persistor, and a saved state.')
  .and('The persistor fails to delete the saved state, and fails to save the initial-state.')
  .and('The store has an errorObserver.')
  .when('We call logOut with a new initial-state.')
  .then('The store state is the initial-state.')
  .and('The errorObserver got the delete error and then the save error, before logOut rejected.')
  .and('logOut rejects with the delete error.')
  .run(async (_) => {
    // Given:
    const persistor = new FailingPersistor();
    const { store, observed } = await createStore(persistor, 'returns null');
    store.dispatch(new Increment());
    expect(persistor.savedState?.count).toBe(1);
    persistor.failDelete = true;
    persistor.failPersist = 1;
    persistor.record = [];

    // When:
    const { rejection, observedWhenRejected } = await logOutAndCatch(store, observed);

    // Then:
    expect(store.state.count).toBe(0);
    expect(observedWhenRejected.map(o => o.error.message)).toEqual(['delete failed', 'disk full']);
    expect(rejection?.error.message).toBe('delete failed');
  });

Bdd(feature)
  .scenario('logOut rejects with the save error as processed by the persistor wrapError.')
  .given('A store with a persistor that fails to save the initial-state.')
  .and('The persistor wrapError wraps the save error in another error.')
  .when('We call logOut.')
  .then('logOut rejects with the wrapped error.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    persistor.wrap = (error: any) => new Error('wrapped: ' + error.message);
    const { store, observed } = await createStore(persistor, 'returns null');
    persistor.failPersist = 1;

    const { rejection } = await logOutAndCatch(store, observed);

    expect(rejection?.error.message).toBe('wrapped: disk full');
  });

Bdd(feature)
  .scenario('logOut does not reject when the persistor wrapError swallows the save error.')
  .given('A store with a persistor that fails to save the initial-state.')
  .and('The persistor wrapError returns null.')
  .when('We call logOut.')
  .then('logOut resolves, and the store state is the initial-state.')
  .and('The errorObserver gets no error.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    persistor.wrap = () => null;
    const { store, observed } = await createStore(persistor, 'returns null');
    store.dispatch(new Increment());
    persistor.failPersist = 1;

    const { rejection } = await logOutAndCatch(store, observed);

    expect(rejection).toBeNull();
    expect(store.state.count).toBe(0);
    expect(observed).toEqual([]);
  });

Bdd(feature)
  .scenario('logOut does not reject when deleteState reports an error with addError instead of throwing.')
  .given('A store with a persistor whose deleteState adds an error with addError, and does not throw.')
  .when('We call logOut.')
  .then('logOut resolves, and the store state is the initial-state.')
  .and('The errorObserver got the added error.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    const { store, observed } = await createStore(persistor, 'returns null');
    store.dispatch(new Increment());
    persistor.addErrorOnDelete = true;

    const { rejection } = await logOutAndCatch(store, observed);

    expect(rejection).toBeNull();
    expect(store.state.count).toBe(0);
    expect(persistor.savedState?.count).toBe(0);
    expect(observed.map(o => o.error.message)).toEqual(['delete had a problem']);
  });

// ----------------------------------------------

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

async function createStore(persistor: FailingPersistor, observer: Observer)
  : Promise<{ store: Store<State>, observed: any[] }> {
  const observed: any[] = [];
  const store = new Store<State>({
    initialState: new State(0),
    logger: (_: any) => {
    },
    logStateChanges: false,
    persistor,
    errorObserver: (observer === 'no errorObserver') ? undefined
      : (params: any) => {
        observed.push(params);
        if (observer === 'returns null') return null;
        if (observer === 'returns the error') return params.error;
        return new Error('other');
      },
  });
  await store.ready();
  await delayMillis(10); // Waits for the initial-state to be saved.
  return { store, observed };
}

/**
 * Calls logOut, and returns how it rejected (or `null` if it resolved), the errors the
 * errorObserver got until then, and the unhandled promise rejections thrown until 30 ms
 * after it finished. Jest itself fails the test when there is an unhandled rejection, so this
 * spies on `Promise.reject`, which the store uses to throw them, and marks them as handled.
 */
async function logOutAndCatch(store: Store<State>, observed: any[]) {
  const unhandled: any[] = [];
  const originalReject = Promise.reject;
  const spy = jest.spyOn(Promise, 'reject').mockImplementation((reason?: any) => {
    unhandled.push(reason);
    const rejected = originalReject.call(Promise, reason);
    rejected.catch(() => {});
    return rejected as any;
  });

  let rejection: { error: any } | null = null;
  let observedWhenRejected: any[] = [];
  try {
    await store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 })
      .catch((error) => {
        rejection = { error };
        observedWhenRejected = [...observed];
      });
    await delayMillis(30);
  } finally {
    spy.mockRestore();
  }
  return { rejection: rejection as { error: any } | null, unhandled, observedWhenRejected };
}

class FailingPersistor extends Persistor<State> {
  savedState: State | null = null;
  record: string[] = [];
  failDelete = false;
  failPersist = 0; // How many saves fail, from now on.
  addErrorOnDelete = false;
  wrap: ((error: any) => any) | null = null;

  async readState(): Promise<State | null> {
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    if (this.failDelete) {
      this.record.push('delete (failed)');
      throw new Error('delete failed');
    }
    this.record.push('delete');
    if (this.addErrorOnDelete) this.addError(new Error('delete had a problem'));
    this.savedState = null;
  }

  async persistDifference(_: State | null, newState: State) {
    if (this.failPersist > 0) {
      this.failPersist--;
      this.record.push('persist ' + newState.count + ' (failed)');
      throw new Error('disk full');
    }
    this.record.push('persist ' + newState.count);
    this.savedState = newState;
  }

  wrapError(error: any): any {
    return (this.wrap === null) ? error : this.wrap(error);
  }

  get throttle(): number | null {
    return null;
  }
}
