import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Misconfigured actions whose dispatch would be aborted');

class State {
  constructor(readonly value: string) {
  }
}

/** A promise that the test resolves when it wants. */
class Deferred<T = any> {
  resolve!: (value: T) => void;
  readonly promise = new Promise<T>((resolve) => {
    this.resolve = resolve;
  });
}

/**
 * Optimistic command whose server call waits for the given promise.
 * All its subclasses share the same non-reentrant key, 'k'.
 */
class SaveValue extends OptimisticCommand<State, string> {
  constructor(readonly server: Promise<any> = Promise.resolve()) {
    super();
  }

  computeNonReentrantKey() {
    return 'k';
  }

  optimisticValue() {
    return 'new';
  }

  getValueFromState(state: State) {
    return state.value;
  }

  applyValueToState(_state: State, value: string) {
    return new State(value);
  }

  async sendCommandToServer() {
    return this.server;
  }
}

/** Misconfigured: an optimistic command can't use `nonReentrant`. */
class SaveNonReentrant extends SaveValue {
  nonReentrant = true;

  optimisticValue() {
    return 'misconfigured';
  }
}

/** Misconfigured: an optimistic command can't use unlimited retries. */
class SaveUnlimited extends SaveValue {
  retry = { maxRetries: -1 };

  optimisticValue() {
    return 'misconfigured';
  }
}

Bdd(feature)
  .scenario('An optimistic command with nonReentrant throws, even when its key is already running.')
  .given('An optimistic command with key "k", whose server call is still running.')
  .and('Another optimistic command with the same key "k", that also sets nonReentrant to true.')
  .when('The second command is dispatched.')
  .then('The dispatch throws a StoreException, instead of being silently aborted.')
  .and('The state does not change.')
  .run(async (_) => {
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveValue(server.promise));
    expect(store.state.value).toBe('new');

    expect(() => store.dispatch(new SaveNonReentrant())).toThrow(StoreException);
    expect(store.state.value).toBe('new');

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('An optimistic command with unlimited retries throws, even when its key is already running.')
  .given('An optimistic command with key "k", whose server call is still running.')
  .and('Another optimistic command with the same key "k", that has unlimited retries.')
  .when('The second command is dispatched.')
  .then('The dispatch throws a StoreException, instead of being silently aborted.')
  .and('The state does not change.')
  .run(async (_) => {
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveValue(server.promise));

    expect(() => store.dispatch(new SaveUnlimited())).toThrow(StoreException);
    expect(store.state.value).toBe('new');

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('With dispatchAndWait, a misconfigured optimistic command rejects, even when its key is already running.')
  .given('An optimistic command with key "k", whose server call is still running.')
  .and('Another optimistic command with the same key "k", that also sets nonReentrant to true.')
  .when('The second command is dispatched with dispatchAndWait.')
  .then('The promise rejects with a StoreException, instead of resolving as aborted.')
  .run(async (_) => {
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveValue(server.promise));

    await expect(store.dispatchAndWait(new SaveNonReentrant())).rejects.toBeInstanceOf(StoreException);
    expect(store.state.value).toBe('new');

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('A misconfigured optimistic command throws, even when it aborts its own dispatch.')
  .given('An optimistic command that sets nonReentrant to true.')
  .and('Its abortDispatch returns true.')
  .when('The command is dispatched.')
  .then('The dispatch throws a StoreException, instead of being silently aborted.')
  .and('The state does not change.')
  .run(async (_) => {
    class SaveAborted extends SaveNonReentrant {
      abortDispatch() {
        return true;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    expect(() => store.dispatch(new SaveAborted())).toThrow(StoreException);
    expect(store.state.value).toBe('old');
  });

Bdd(feature)
  .scenario('Any misconfigured action throws, even when its dispatch would be aborted.')
  .given('An action with throttle, that also has an invalid retry option.')
  .and('Another action with the same throttle lock just ran.')
  .when('The misconfigured action is dispatched, inside the throttle period.')
  .then('The dispatch throws a StoreException, instead of being silently aborted.')
  .run(async (_) => {
    class Load extends KissAction<State> {
      throttle = 10000;

      throttleLockBuilder() {
        return 'lock';
      }

      async reduce() {
        return (state: State) => new State(state.value + '+');
      }
    }

    class LoadWithInvalidRetry extends Load {
      retry = { maxRetries: -5 };
    }

    const store = new Store<State>({ initialState: new State('old') });

    await store.dispatchAndWait(new Load());
    expect(store.state.value).toBe('old+');

    expect(() => store.dispatch(new LoadWithInvalidRetry())).toThrow(StoreException);
    expect(store.state.value).toBe('old+');
  });
