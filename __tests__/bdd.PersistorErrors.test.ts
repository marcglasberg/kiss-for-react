import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import {
  KissAction,
  Persistor,
  PersistorPrinterDecorator,
  Store,
  UserException,
} from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Persistor errors');

Bdd(feature)
  .scenario('A failed save does not cause an unhandled rejection.')
  .given('A store with a persistor whose persistDifference throws.')
  .when('An action changes the state.')
  .then('There is no unhandled promise rejection.')
  .and('The store keeps working.')
  .run(async (_) => {
    const unhandled: any[] = [];
    const listener = (reason: any) => unhandled.push(reason);
    process.on('unhandledRejection', listener);

    try {
      const persistor = new FailingPersistor();
      const store = await createStore(persistor);
      persistor.failPersist = true;

      store.dispatch(new Increment());
      await delayMillis(50);

      expect(persistor.record).toEqual(['persist 1 (failed)']);
      expect(unhandled).toEqual([]);

      store.dispatch(new Increment());
      expect(store.state.count).toBe(2);
    }
      //
    finally {
      process.off('unhandledRejection', listener);
    }
  });

Bdd(feature)
  .scenario('A state that failed to save is not considered saved.')
  .given('A store with a persistor.')
  .and('A save that failed.')
  .when('The state changes again, and is saved successfully.')
  .then('The persistor receives, as the last persisted state, the last state that was really saved.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    const store = await createStore(persistor);
    expect(persistor.savedState?.count).toBe(0);

    persistor.failPersist = true;
    store.dispatch(new Increment());
    await delayMillis(20);
    expect(persistor.savedState?.count).toBe(0);

    persistor.failPersist = false;
    store.dispatch(new Increment());
    await delayMillis(20);

    expect(persistor.savedState?.count).toBe(2);
    expect(persistor.lastPersistedStates.map(s => s?.count)).toEqual([0]);
  });

Bdd(feature)
  .scenario('A failed save is not retried with a timer.')
  .given('A store with a persistor with a throttle.')
  .and('A save that failed.')
  .when('Time passes, and the state does not change.')
  .then('The persistor is not called again.')
  .run(async (_) => {
    const persistor = new FailingPersistor(30);
    const store = await createStore(persistor);
    await delayMillis(40);

    persistor.failPersist = true;
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.record).toEqual(['persist 1 (failed)']);

    persistor.failPersist = false;
    await delayMillis(150);
    expect(persistor.record).toEqual(['persist 1 (failed)']);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('After a failed save, the next state change saves the newest state.')
  .given('A store with a persistor.')
  .and('A save that failed.')
  .when('The state changes again.')
  .then('The newest state is saved.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    const store = await createStore(persistor);

    persistor.failPersist = true;
    store.dispatch(new Increment());
    await delayMillis(10);

    persistor.failPersist = false;
    store.dispatch(new Increment());
    await delayMillis(10);

    expect(persistor.record).toEqual(['persist 1 (failed)', 'persist 2']);
    expect(persistor.savedState?.count).toBe(2);
  });

Bdd(feature)
  .scenario('Without an errorObserver, a save error is logged.')
  .given('A store with a persistor, and no errorObserver.')
  .when('A save fails.')
  .then('The error is logged with Store.log.')
  .run(async (_) => {
    const logs: string[] = [];
    const persistor = new FailingPersistor();
    const store = await createStore(persistor, { logger: (obj: any) => logs.push(String(obj)) });
    persistor.failPersist = true;

    store.dispatch(new Increment());
    await delayMillis(10);

    expect(logs.some(log => log.includes('disk full'))).toBe(true);
  });

Bdd(feature)
  .scenario('A save error is given to the errorObserver, with a null action.')
  .given('A store with a persistor, and an errorObserver.')
  .when('A save fails.')
  .then('The errorObserver is called with the error, a null action, and the store.')
  .run(async (_) => {
    const observed: any[] = [];
    const persistor = new FailingPersistor();
    const store: Store<State> = await createStore(persistor, {
      errorObserver: (error: any, action: KissAction<State> | null, store: Store<State>) => {
        observed.push({ error, action, store });
        return false;
      },
    });
    persistor.failPersist = true;

    store.dispatch(new Increment());
    await delayMillis(10);

    expect(observed.length).toBe(1);
    expect(observed[0].error.message).toBe('disk full');
    expect(observed[0].action).toBeNull();
    expect(observed[0].store).toBe(store);
  });

Bdd(feature)
  .scenario('The persistor wrapError can turn a save error into a UserException that is shown to the user.')
  .given('A persistor whose wrapError turns errors into UserExceptions.')
  .when('A save fails.')
  .then('The UserException is shown to the user.')
  .run(async (_) => {
    const shown: UserException[] = [];
    const persistor = new FailingPersistor();
    persistor.wrap = (error: any) => new UserException('Could not save your data.', { hardCause: error });

    const store = await createStore(persistor, {
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
    });
    persistor.failPersist = true;

    store.dispatch(new Increment());
    await delayMillis(10);

    expect(shown.length).toBe(1);
    expect(shown[0].message).toBe('Could not save your data.');
  });

Bdd(feature)
  .scenario('The persistor wrapError can swallow a save error by returning null.')
  .given('A persistor whose wrapError returns null.')
  .and('A store with an errorObserver.')
  .when('A save fails.')
  .then('The errorObserver is not called, and nothing is logged.')
  .and('The failed state is still not considered saved.')
  .run(async (_) => {
    const observed: any[] = [];
    const logs: string[] = [];
    const persistor = new FailingPersistor();
    persistor.wrap = (_: any) => null;

    const store = await createStore(persistor, {
      logger: (obj: any) => logs.push(String(obj)),
      errorObserver: (error: any) => {
        observed.push(error);
        return true;
      },
    });
    persistor.failPersist = true;

    store.dispatch(new Increment());
    await delayMillis(10);
    expect(observed).toEqual([]);
    expect(logs.some(log => log.includes('disk full'))).toBe(false);

    persistor.failPersist = false;
    store.dispatch(new Increment());
    await delayMillis(10);
    expect(persistor.lastPersistedStates.map(s => s?.count)).toEqual([0]);
  });

Bdd(feature)
  .scenario('If the persistor wrapError throws, the thrown error is used instead.')
  .given('A persistor whose wrapError throws a different error.')
  .and('A store with an errorObserver.')
  .when('A save fails.')
  .then('The errorObserver gets the error thrown by wrapError.')
  .run(async (_) => {
    const observed: any[] = [];
    const persistor = new FailingPersistor();
    persistor.wrap = (_: any) => {
      throw new Error('wrapped');
    };

    const store = await createStore(persistor, {
      errorObserver: (error: any) => {
        observed.push(error);
        return false;
      },
    });
    persistor.failPersist = true;

    store.dispatch(new Increment());
    await delayMillis(10);

    expect(observed.map(e => e.message)).toEqual(['wrapped']);
  });

Bdd(feature)
  .scenario('A persistor can report errors with addError, without throwing.')
  .given('A persistor whose readState finds corrupted data.')
  .and('It deletes it, reports a UserException with addError, and returns null.')
  .when('The store is created.')
  .then('The UserException is shown to the user.')
  .and('The initial-state is saved.')
  .run(async (_) => {
    const shown: UserException[] = [];
    const persistor = new FailingPersistor();
    persistor.corrupted = true;

    await createStore(persistor, {
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
    });

    expect(shown.map(e => e.message)).toEqual(['Could not read your data, so it was reset.']);
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('An error thrown by readState is given to the errorObserver.')
  .given('A persistor whose readState throws.')
  .and('A store with an errorObserver.')
  .when('The store is created.')
  .then('The errorObserver gets the error, with a null action.')
  .and('The initial-state is saved.')
  .run(async (_) => {
    const observed: any[] = [];
    const persistor = new FailingPersistor();
    persistor.failRead = true;

    await createStore(persistor, {
      errorObserver: (error: any, action: KissAction<State> | null) => {
        observed.push({ error, action });
        return false;
      },
    });

    expect(observed.map(o => o.error.message)).toEqual(['read failed']);
    expect(observed[0].action).toBeNull();
    expect(persistor.savedState?.count).toBe(0);
  });

Bdd(feature)
  .scenario('persistAndPausePersistor does not reject when the save fails.')
  .given('A store with a persistor whose persistDifference throws.')
  .and('A state that is not yet saved.')
  .when('We await persistAndPausePersistor.')
  .then('It resolves, and the error is given to the errorObserver.')
  .run(async (_) => {
    const observed: any[] = [];
    const persistor = new FailingPersistor(1000);
    const store = await createStore(persistor, {
      errorObserver: (error: any) => {
        observed.push(error);
        return false;
      },
    });
    persistor.failPersist = true;
    store.dispatch(new Increment()); // Waits for the throttle.

    await store.persistAndPausePersistor();

    expect(persistor.record).toEqual(['persist 1 (failed)']);
    expect(observed.map(e => e.message)).toEqual(['disk full']);
  });

Bdd(feature)
  .scenario('By default, saveInitialState saves the state with persistDifference.')
  .given('A persistor that does not override saveInitialState.')
  .when('saveInitialState is called.')
  .then('persistDifference is called with a null last persisted state.')
  .run(async (_) => {
    const persistor = new MinimalPersistor();
    await persistor.saveInitialState(new State(7));
    expect(persistor.calls).toEqual([{ last: null, count: 7 }]);
  });

Bdd(feature)
  .scenario('The PersistorPrinterDecorator keeps the wrapError and addError of the persistor it decorates.')
  .given('A persistor with a wrapError and errors added with addError.')
  .when('It is decorated with PersistorPrinterDecorator.')
  .then('The decorator uses the same wrapError, and returns the same added errors.')
  .run(async (_) => {
    const persistor = new FailingPersistor();
    persistor.wrap = (error: any) => 'wrapped ' + error;
    const decorator = new PersistorPrinterDecorator(persistor);

    expect(decorator.wrapError('x')).toBe('wrapped x');

    persistor.addError('a');
    decorator.addError('b');
    expect(decorator.getAndRemoveFirstError()).toBe('a');
    expect(persistor.getAndRemoveFirstError()).toBe('b');
    expect(decorator.getAndRemoveFirstError()).toBeNull();
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

async function createStore(persistor: Persistor<State>, options: any = {}): Promise<Store<State>> {
  const store = new Store<State>({
    initialState: new State(0),
    logger: (_: any) => {
    },
    logStateChanges: false,
    persistor,
    ...options,
  });
  await delayMillis(10); // Waits for the persisted state to be read.
  return store;
}

class FailingPersistor extends Persistor<State> {
  savedState: State | null = null;
  record: string[] = [];
  lastPersistedStates: (State | null)[] = [];
  failPersist = false;
  failRead = false;
  corrupted = false;
  wrap: ((error: any) => any) | null = null;

  constructor(readonly throttleMillis: number | null = null) {
    super();
  }

  async readState(): Promise<State | null> {
    if (this.failRead) throw new Error('read failed');
    if (this.corrupted) {
      await this.deleteState();
      this.addError(new UserException('Could not read your data, so it was reset.'));
      return null;
    }
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(lastPersistedState: State | null, newState: State) {
    if (this.failPersist) {
      this.record.push('persist ' + newState.count + ' (failed)');
      throw new Error('disk full');
    }
    this.record.push('persist ' + newState.count);
    this.lastPersistedStates.push(lastPersistedState);
    this.savedState = newState;
  }

  wrapError(error: any): any {
    return (this.wrap === null) ? error : this.wrap(error);
  }

  get throttle(): number | null {
    return this.throttleMillis;
  }
}

class MinimalPersistor extends Persistor<State> {
  calls: { last: number | null, count: number }[] = [];

  async readState(): Promise<State | null> {
    return null;
  }

  async deleteState() {
  }

  async persistDifference(lastPersistedState: State | null, newState: State) {
    this.calls.push({ last: lastPersistedState?.count ?? null, count: newState.count });
  }
}
