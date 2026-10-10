import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, PersistAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Persistor that throws synchronously');

/**
 * How `persistDifference` fails:
 * - `throws`: it's not `async`, and throws before returning its promise.
 * - `rejects`: it returns a rejected promise.
 */
type Failure = 'throws' | 'rejects';

/** What starts the save that fails. */
type SaveStartedBy = 'a state change' | 'the throttle timer' | 'a PersistAction';

Bdd(feature)
  .scenario('persistAndPausePersistor completes after a save failed.')
  .given('A store with a persistor that saves to a synchronous storage.')
  .and('The storage is full, so a save fails, and the persistor <Failure>.')
  .and('The save was started by <Save started by>.')
  .when('The storage is no longer full, and we await persistAndPausePersistor.')
  .then('It completes, and the app does not freeze.')
  .and('The current state is saved.')
  .and('The error of the save that failed is given to the errorObserver.')
  .example(val('Failure', 'throws'), val('Save started by', 'a state change'))
  .example(val('Failure', 'throws'), val('Save started by', 'the throttle timer'))
  .example(val('Failure', 'throws'), val('Save started by', 'a PersistAction'))
  .example(val('Failure', 'rejects'), val('Save started by', 'a state change'))
  .example(val('Failure', 'rejects'), val('Save started by', 'the throttle timer'))
  .example(val('Failure', 'rejects'), val('Save started by', 'a PersistAction'))
  .run(async (ctx) => {
    const failure: Failure = ctx.example.val('Failure');
    const saveStartedBy: SaveStartedBy = ctx.example.val('Save started by');

    // Given:
    const throttle =
      saveStartedBy === 'a state change' ? null
        : saveStartedBy === 'the throttle timer' ? 30
          : 10_000; // A PersistAction saves right away, ignoring the throttle.

    const persistor = new SyncStoragePersistor(failure, throttle);
    const { store, errors } = await createStore(persistor);
    persistor.full = true;

    store.dispatch(new Increment());
    if (saveStartedBy === 'a PersistAction') store.dispatch(new PersistAction<State>());
    await delayMillis(saveStartedBy === 'the throttle timer' ? 60 : 10);
    expect(persistor.record).toEqual(['persist 1 (failed)']);

    // When:
    persistor.full = false;
    await expectNotToFreeze(() => store.persistAndPausePersistor());

    // Then:
    expect(persistor.record).toEqual(['persist 1 (failed)', 'persist 1']);
    expect(persistor.saved?.count).toBe(1);
    expect(errors.map(e => e.message)).toEqual(['Storage is full.']);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor can be called again, after its own save failed.')
  .given('A store with a persistor that saves to a synchronous storage.')
  .and('A state change that is not yet saved, because of the throttle.')
  .and('The storage is full.')
  .and('We awaited persistAndPausePersistor, and its save failed, because the persistor <Failure>.')
  .when('The storage is no longer full, and we await persistAndPausePersistor again.')
  .then('It completes, and the app does not freeze.')
  .and('The current state is saved.')
  .example(val('Failure', 'throws'))
  .example(val('Failure', 'rejects'))
  .run(async (ctx) => {
    const failure: Failure = ctx.example.val('Failure');

    // Given:
    const persistor = new SyncStoragePersistor(failure, 10_000);
    const { store, errors } = await createStore(persistor);
    store.dispatch(new Increment()); // Not saved yet, because of the throttle.
    persistor.full = true;

    // Here we only check that it completes, not if it resolves or rejects.
    await expectNotToFreeze(() => store.persistAndPausePersistor().catch(() => {}));
    expect(persistor.record).toEqual(['persist 1 (failed)']);
    expect(errors.map(e => e.message)).toEqual(['Storage is full.']);

    // When:
    persistor.full = false;
    await expectNotToFreeze(() => store.persistAndPausePersistor());

    // Then:
    expect(persistor.record).toEqual(['persist 1 (failed)', 'persist 1']);
    expect(persistor.saved?.count).toBe(1);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor completes after logOut failed to save the initial state.')
  .given('A store with a persistor that saves to a synchronous storage.')
  .and('The storage is full.')
  .and('We logged out, and saving the initial state failed, because the persistor <Failure>.')
  .when('The storage is no longer full, and we await persistAndPausePersistor.')
  .then('It completes, and the app does not freeze.')
  .and('The initial state is saved.')
  .example(val('Failure', 'throws'))
  .example(val('Failure', 'rejects'))
  .run(async (ctx) => {
    const failure: Failure = ctx.example.val('Failure');

    // Given:
    const persistor = new SyncStoragePersistor(failure, null);
    const { store, errors } = await createStore(persistor);
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.saved?.count).toBe(1);

    persistor.full = true;
    await expectNotToFreeze(() =>
      store.logOut({ initialState: new State(0), throttle: 0, actionsThrottle: 0 }).catch(() => {}));
    await delayMillis(10);
    expect(store.state.count).toBe(0);
    expect(persistor.saved).toBeNull();
    expect(persistor.record).toContain('persist 0 (failed)');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(e => e.message === 'Storage is full.')).toBe(true);

    // When:
    persistor.full = false;
    await expectNotToFreeze(() => store.persistAndPausePersistor());

    // Then:
    expect(persistor.record[persistor.record.length - 1]).toBe('persist 0');
    expect(persistor.saved?.count).toBe(0);
  });

Bdd(feature)
  .scenario('After a save failed, the next state change is saved.')
  .given('A store with a persistor that saves to a synchronous storage.')
  .and('The storage is full, so a save fails, and the persistor <Failure>.')
  .when('The storage is no longer full, and the state changes again.')
  .then('The newest state is saved.')
  .and('The persistor receives, as the last persisted state, the last state that was really saved.')
  .example(val('Failure', 'throws'))
  .example(val('Failure', 'rejects'))
  .run(async (ctx) => {
    const failure: Failure = ctx.example.val('Failure');

    // Given:
    const persistor = new SyncStoragePersistor(failure, null);
    const { store, errors } = await createStore(persistor);
    persistor.full = true;
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.record).toEqual(['persist 1 (failed)']);

    // When:
    persistor.full = false;
    store.dispatch(new Increment());
    await delayMillis(10);

    // Then:
    expect(persistor.record).toEqual(['persist 1 (failed)', 'persist 2']);
    expect(persistor.saved?.count).toBe(2);
    expect(persistor.lastPersistedStates).toEqual([0]);
    expect(errors.map(e => e.message)).toEqual(['Storage is full.']);
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

async function createStore(persistor: Persistor<State>) {
  const errors: any[] = [];
  const store = new Store<State>({
    initialState: new State(0),
    logger: () => {
    },
    logStateChanges: false,
    persistor,
    errorObserver: ({ error }) => {
      errors.push(error);
      return null;
    },
  });
  await store.ready();
  return { store, errors };
}

/**
 * Saves to a synchronous storage, like `localStorage`. When the storage is full, the save fails,
 * like `localStorage.setItem` does with a `QuotaExceededError`. Then, if `failure` is `throws`,
 * `persistDifference` throws before returning its promise. That's what happens with a common
 * persistor that is not `async`, like `return storage.set('k', JSON.stringify(state))`.
 * If `failure` is `rejects`, it returns a rejected promise instead.
 */
class SyncStoragePersistor extends Persistor<State> {
  saved: State | null = null;
  full = false;
  record: string[] = [];
  lastPersistedStates: (number | null)[] = [];

  constructor(readonly failure: Failure, readonly throttleMillis: number | null) {
    super();
  }

  async readState(): Promise<State | null> {
    return this.saved;
  }

  async saveInitialState(state: State) {
    this.saved = state;
  }

  async deleteState() {
    this.saved = null;
  }

  persistDifference(lastPersistedState: State | null, newState: State): Promise<void> {
    if (this.full) {
      this.record.push('persist ' + newState.count + ' (failed)');
      const error = new Error('Storage is full.');
      if (this.failure === 'throws') throw error;
      return Promise.reject(error);
    }
    this.record.push('persist ' + newState.count);
    this.lastPersistedStates.push(lastPersistedState?.count ?? null);
    this.saved = newState;
    return Promise.resolve();
  }

  get throttle(): number | null {
    return this.throttleMillis;
  }
}

/**
 * Runs `run` and awaits its promise, but fails the test if that freezes the app.
 *
 * Code that keeps awaiting a promise that is already settled, in a loop, freezes the app: each
 * pass is only a microtask, so timers and I/O never run again, and not even Jest's own timeout
 * fires. To detect that, this counts the calls to `Promise.prototype.then` (which `catch` and
 * `finally` also call) while waiting, and fails if there are too many. When it fails, it makes
 * the next call throw, which breaks the loop.
 */
async function expectNotToFreeze(run: () => Promise<unknown>): Promise<void> {
  const maxCalls = 10_000;
  const originalThen = Promise.prototype.then;
  let calls = 0;
  let froze = false;

  Promise.prototype.then = function (this: Promise<unknown>, ...args: any[]) {
    if (++calls > maxCalls) {
      froze = true;
      Promise.prototype.then = originalThen;
      throw new Error('The app froze.');
    }
    return originalThen.apply(this, args as any);
  } as any;

  try {
    await run();
  }
    //
  catch (error) {
    if (!froze) throw error;
  }
    //
  finally {
    Promise.prototype.then = originalThen;
  }

  if (froze) throw new Error(`The app froze: more than ${maxCalls} promise callbacks while waiting.`);
}
