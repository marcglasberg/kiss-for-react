import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException, UpdateStateAction, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic command actions');

class State {
  constructor(readonly value: string, readonly failed: boolean = false) {
  }
}

/** A promise that the test resolves or rejects when it wants. */
class Deferred<T = any> {
  resolve!: (value: T) => void;
  reject!: (error: any) => void;
  readonly promise = new Promise<T>((resolve, reject) => {
    this.resolve = resolve;
    this.reject = reject;
  });
}

/** Lets pending promises and timers run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

type Opts = {
  value?: string;
  send?: (value: string) => Promise<any>;
  reload?: () => Promise<any>;
  log?: string[];
};

/**
 * Configurable optimistic command, used by most scenarios.
 * By default, its optimistic value is 'new', and its server command succeeds with no response.
 */
class SaveValue extends OptimisticCommand<State, string> {
  constructor(readonly opts: Opts = {}) {
    super();
    if (opts.reload !== undefined) {
      this.reloadFromServer = async () => {
        opts.log?.push('reload: ' + this.state.value);
        return opts.reload!();
      };
    }
  }

  optimisticValue() {
    return this.opts.value ?? 'new';
  }

  getValueFromState(state: State) {
    return state.value;
  }

  applyValueToState(state: State, value: string) {
    return new State(value, state.failed);
  }

  async sendCommandToServer(value: string) {
    this.opts.log?.push('send: ' + this.state.value);
    return this.opts.send?.(value);
  }
}

/** Applies the server response to the state. */
class SaveValueWithResponse extends SaveValue {
  applyServerResponseToState(state: State, serverResponse: any) {
    return new State('response:' + serverResponse, state.failed);
  }
}

const fail = (message = 'Command failed.') => async () => {
  throw new UserException(message);
};

// ----------------------------------------------------------------------------

Bdd(feature)
  .scenario('The optimistic value is applied right away, before the command is sent to the server.')
  .given('An optimistic command whose server call takes some time.')
  .when('The command is dispatched.')
  .then('The state has the optimistic value right away.')
  .and('The server call sees the optimistic value in the state.')
  .and('While the command runs, the action is in progress.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveValue({ send: () => server.promise, log }));

    expect(store.state.value).toBe('new');
    expect(log).toEqual(['send: new']);
    expect(store.isWaiting(SaveValue)).toBe(true);

    server.resolve(undefined);
    await store.waitAllActions([]);
    expect(store.isWaiting(SaveValue)).toBe(false);
  });

Bdd(feature)
  .scenario('When the command succeeds, the optimistic value is kept, and there is no reload.')
  .given('An optimistic command whose server call succeeds with no response.')
  .and('The command can reload from the server.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value.')
  .and('There is no reload, since by default it only reloads on error.')
  .and('The action completes OK.')
  .run(async (_) => {
    const log: string[] = [];
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveValue({ reload: async () => 'server', log });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('new');
    expect(log).toEqual(['send: new']);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('When the server returns a response, it can be applied to the state.')
  .given('An optimistic command that applies the server response to the state.')
  .and('Its server call returns a response.')
  .when('The command is dispatched.')
  .then('The state has the server response.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('old') });

    await store.dispatchAndWait(new SaveValueWithResponse({ send: async () => 'abc' }));

    expect(store.state.value).toBe('response:abc');
  });

Bdd(feature)
  .scenario('By default, the server response is not applied to the state.')
  .given('An optimistic command that does not say how to apply the server response.')
  .and('Its server call returns a response.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('old') });

    await store.dispatchAndWait(new SaveValue({ send: async () => 'abc' }));

    expect(store.state.value).toBe('new');
  });

Bdd(feature)
  .scenario('When the server returns no response, the server response is not applied.')
  .given('An optimistic command that applies the server response to the state.')
  .and('Its server call returns null or undefined.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value.')
  .run(async (_) => {
    for (const response of [null, undefined]) {
      const store = new Store<State>({ initialState: new State('old') });
      await store.dispatchAndWait(new SaveValueWithResponse({ send: async () => response }));
      expect(store.state.value).toBe('new');
    }
  });

Bdd(feature)
  .scenario('When the server response is applied, the action can choose to not change the state.')
  .given('An optimistic command whose method to apply the server response returns null.')
  .and('Its server call returns a response.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value.')
  .run(async (_) => {
    class SaveIgnoringResponse extends SaveValue {
      applyServerResponseToState() {
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveIgnoringResponse({ send: async () => 'abc' }));
    expect(store.state.value).toBe('new');
  });

Bdd(feature)
  .scenario('When the command fails, the state is rolled back, and the action fails with the command error.')
  .given('An optimistic command whose server call throws a UserException.')
  .and('The command does not reload from the server.')
  .when('The command is dispatched.')
  .then('The state goes back to the value it had when the command was dispatched.')
  .and('The action fails with the command error.')
  .and('The action is marked as failed in the store.')
  .and('The error is shown to the user.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State('old'),
      showUserException: (exception: UserException, _count: number, next: () => void) => {
        shown.push(exception);
        next();
      },
    });
    const action = new SaveValue({ send: async () => { throw error; } });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('old');
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(store.isFailed(SaveValue)).toBe(true);
    expect(shown).toEqual([error]);
  });

Bdd(feature)
  .scenario('When the command fails, but the value was changed meanwhile, there is no rollback.')
  .given('An optimistic command whose server call fails.')
  .and('While the server call runs, another action changes the same value.')
  .when('The command is dispatched.')
  .then('The state keeps the value set by the other action.')
  .and('The action fails with the command error.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveValue({
      send: async () => {
        store.dispatch(new UpdateStateAction(() => new State('other')));
        throw error;
      },
    });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('other');
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('When the command fails, the rollback happens before the reload, so the reloaded value wins.')
  .given('An optimistic command whose server call fails.')
  .and('The command reloads the value from the server.')
  .when('The command is dispatched.')
  .then('The state is rolled back before reloading.')
  .and('The final state has the reloaded value.')
  .and('The action fails with the command error.')
  .run(async (_) => {
    const log: string[] = [];
    const error = new UserException('Command failed.');
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveValue({ send: async () => { throw error; }, reload: async () => 'server', log });

    await store.dispatchAndWait(action);

    expect(log).toEqual(['send: new', 'reload: old']);
    expect(store.state.value).toBe('server');
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('When the command fails, and the reload also fails, the action fails with the command error.')
  .given('An optimistic command whose server call fails.')
  .and('Its reload also fails.')
  .when('The command is dispatched.')
  .then('The action fails with the command error, not with the reload error.')
  .and('The state is rolled back.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveValue({
      send: async () => { throw error; },
      reload: fail('Reload failed.'),
    });

    await store.dispatchAndWait(action);

    expect(action.status.originalError).toBe(error);
    expect(store.state.value).toBe('old');
  });

Bdd(feature)
  .scenario('The action can choose to reload also when the command succeeds.')
  .given('An optimistic command whose server call succeeds.')
  .and('The command always reloads the value from the server.')
  .when('The command is dispatched.')
  .then('The reload runs after the server call.')
  .and('The final state has the reloaded value.')
  .run(async (_) => {
    class SaveAlwaysReload extends SaveValue {
      shouldReload() {
        return true;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveAlwaysReload({ reload: async () => 'server', log });

    await store.dispatchAndWait(action);

    expect(log).toEqual(['send: new', 'reload: new']);
    expect(store.state.value).toBe('server');
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('When the command succeeds, but the reload fails, the action fails with the reload error.')
  .given('An optimistic command whose server call succeeds.')
  .and('The command always reloads the value from the server.')
  .and('Its reload fails.')
  .when('The command is dispatched.')
  .then('The action fails with the reload error.')
  .and('The state keeps the optimistic value.')
  .run(async (_) => {
    class SaveAlwaysReload extends SaveValue {
      shouldReload() {
        return true;
      }
    }

    const reloadError = new UserException('Reload failed.');
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveAlwaysReload({ reload: async () => { throw reloadError; } });

    await store.dispatchAndWait(action);

    expect(action.status.originalError).toBe(reloadError);
    expect(store.state.value).toBe('new');
  });

Bdd(feature)
  .scenario('The action can choose to not apply the reloaded value.')
  .given('An optimistic command whose server call fails.')
  .and('The command reloads from the server, but does not apply the reload when the value changed meanwhile.')
  .and('While reloading, another action changes the same value.')
  .when('The command is dispatched.')
  .then('The reloaded value is not applied.')
  .and('The state keeps the value set by the other action.')
  .run(async (_) => {
    class SaveCarefulReload extends SaveValue {
      shouldApplyReload({ currentValue, lastAppliedValue }: { currentValue: string, lastAppliedValue: string }) {
        return currentValue === lastAppliedValue;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveCarefulReload({
      send: fail(),
      reload: async () => {
        store.dispatch(new UpdateStateAction(() => new State('other')));
        return 'server';
      },
    });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('other');
  });

Bdd(feature)
  .scenario('The reload result can have a different shape than the value.')
  .given('An optimistic command whose server call fails.')
  .and('Its reload returns an object, which the command knows how to apply to the state.')
  .when('The command is dispatched.')
  .then('The final state has the value from the reloaded object.')
  .run(async (_) => {
    class SaveReloadObject extends SaveValue {
      applyReloadResultToState(state: State, reloadResult: any) {
        return new State(reloadResult.text, state.failed);
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveReloadObject({ send: fail(), reload: async () => ({ text: 'server' }) }));
    expect(store.state.value).toBe('server');
  });

Bdd(feature)
  .scenario('Applying the reload result can be skipped by returning no state.')
  .given('An optimistic command whose server call fails.')
  .and('Its method to apply the reload result returns null.')
  .when('The command is dispatched.')
  .then('The state stays rolled back.')
  .run(async (_) => {
    class SaveIgnoreReload extends SaveValue {
      applyReloadResultToState() {
        return null;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveIgnoreReload({ send: fail(), reload: async () => 'server' }));
    expect(store.state.value).toBe('old');
  });

Bdd(feature)
  .scenario('The rollback can be customized.')
  .given('An optimistic command whose server call fails.')
  .and('Its rollback keeps the optimistic value, but marks it as failed.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value, marked as failed.')
  .and('The rollback receives the initial value, the optimistic value, and the command error.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    let received: any;

    class SaveMarkFailed extends SaveValue {
      rollbackState(params: { initialValue: string, optimisticValue: string, error: any }) {
        received = params;
        return new State(this.state.value, true);
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveMarkFailed({ send: async () => { throw error; } }));

    expect(store.state).toEqual(new State('new', true));
    expect(received).toEqual({ initialValue: 'old', optimisticValue: 'new', error });
  });

Bdd(feature)
  .scenario('The rollback can be skipped by returning no state.')
  .given('An optimistic command whose server call fails.')
  .and('Its rollback returns null.')
  .when('The command is dispatched.')
  .then('The state keeps the optimistic value.')
  .and('The action fails with the command error.')
  .run(async (_) => {
    class SaveNoRollback extends SaveValue {
      rollbackState() {
        return null;
      }
    }

    const error = new UserException('Command failed.');
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveNoRollback({ send: async () => { throw error; } });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('new');
    expect(action.status.originalError).toBe(error);
  });

Bdd(feature)
  .scenario('The decision to roll back can be customized.')
  .given('An optimistic command whose server call fails.')
  .and('The command always rolls back, even if the value was changed meanwhile.')
  .and('While the server call runs, another action changes the same value.')
  .when('The command is dispatched.')
  .then('The state is rolled back anyway.')
  .and('The decision receives the current value, the initial value, the optimistic value, and the command error.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    let received: any;

    class SaveAlwaysRollback extends SaveValue {
      shouldRollback(params: { currentValue: string, initialValue: string, optimisticValue: string, error: any }) {
        received = params;
        return true;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveAlwaysRollback({
      send: async () => {
        store.dispatch(new UpdateStateAction(() => new State('other')));
        throw error;
      },
    }));

    expect(store.state.value).toBe('old');
    expect(received).toEqual({ currentValue: 'other', initialValue: 'old', optimisticValue: 'new', error });
  });

Bdd(feature)
  .scenario('The decision to reload gets the values applied by the command, and the command error.')
  .given('An optimistic command that records what its reload decision receives.')
  .when('The command succeeds with a server response that is applied to the state.')
  .and('Another command fails and is rolled back.')
  .then('On success, the last applied value is the server response, there is no rollback value, and no error.')
  .and('On failure, the last applied value is the rollback value, and the error is the command error.')
  .run(async (_) => {
    const received: any[] = [];

    class SaveRecordReload extends SaveValueWithResponse {
      shouldReload(params: any) {
        received.push(params);
        return false;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    await store.dispatchAndWait(new SaveRecordReload({ send: async () => 'abc', reload: async () => 'server' }));
    expect(received[0]).toEqual({
      currentValue: 'response:abc',
      lastAppliedValue: 'response:abc',
      optimisticValue: 'new',
      rollbackValue: undefined,
      error: null,
    });

    const error = new UserException('Command failed.');
    await store.dispatchAndWait(new SaveRecordReload({ send: async () => { throw error; }, reload: async () => 'server' }));
    expect(received[1]).toEqual({
      currentValue: 'response:abc',
      lastAppliedValue: 'response:abc',
      optimisticValue: 'new',
      rollbackValue: 'response:abc',
      error,
    });
  });

Bdd(feature)
  .scenario('The decision to apply the reload gets the reload result.')
  .given('An optimistic command whose server call fails.')
  .and('The command records what its decision to apply the reload receives.')
  .when('The command is dispatched.')
  .then('The decision receives the current value, the applied values, the reload result, and the command error.')
  .run(async (_) => {
    const error = new UserException('Command failed.');
    let received: any;

    class SaveRecordApplyReload extends SaveValue {
      shouldApplyReload(params: any) {
        received = params;
        return true;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    await store.dispatchAndWait(new SaveRecordApplyReload({ send: async () => { throw error; }, reload: async () => 'server' }));

    expect(received).toEqual({
      currentValue: 'old',
      lastAppliedValue: 'old',
      optimisticValue: 'new',
      rollbackValue: 'old',
      reloadResult: 'server',
      error,
    });
    expect(store.state.value).toBe('server');
  });

// ----------------------------------------------------------------------------
// Non-reentrant

Bdd(feature)
  .scenario('An optimistic command is non-reentrant.')
  .given('An optimistic command is running.')
  .when('The same command is dispatched again, before the first one finishes.')
  .then('The second dispatch is aborted.')
  .and('The server call runs only once.')
  .and('After the first command finishes, the command can be dispatched again.')
  .run(async (_) => {
    const log: string[] = [];
    const server = new Deferred();
    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveValue({ value: 'first', send: () => server.promise, log }));
    const second = new SaveValue({ value: 'second', log });
    store.dispatch(second);

    expect(second.status.isDispatched).toBe(false);
    expect(store.state.value).toBe('first');

    server.resolve(undefined);
    await store.waitAllActions([]);
    expect(log).toEqual(['send: first']);

    await store.dispatchAndWait(new SaveValue({ value: 'third', log }));
    expect(log).toEqual(['send: first', 'send: third']);
    expect(store.state.value).toBe('third');
  });

Bdd(feature)
  .scenario('An optimistic command can be dispatched again after it fails.')
  .given('An optimistic command failed.')
  .when('The same command is dispatched again.')
  .then('It runs.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State('old') });

    await store.dispatchAndWait(new SaveValue({ send: fail() }));
    expect(store.state.value).toBe('old');

    await store.dispatchAndWait(new SaveValue({ value: 'again' }));
    expect(store.state.value).toBe('again');
  });

Bdd(feature)
  .scenario('Optimistic commands with different key params run at the same time.')
  .given('An optimistic command that uses the item id as its non-reentrant key params.')
  .when('The command is dispatched for item A, and again for item A, and for item B, while the first one is running.')
  .then('The second command for item A is aborted.')
  .and('The command for item B runs.')
  .run(async (_) => {
    const sent: string[] = [];
    const server = new Deferred();

    class SaveItem extends SaveValue {
      constructor(readonly itemId: string) {
        super({ value: itemId, send: () => { sent.push(itemId); return server.promise; } });
      }

      nonReentrantKeyParams() {
        return this.itemId;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveItem('A'));
    store.dispatch(new SaveItem('A'));
    store.dispatch(new SaveItem('B'));

    expect(sent).toEqual(['A', 'B']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('Key params that are arrays or plain objects are compared by their contents.')
  .given('An optimistic command that uses an object as its non-reentrant key params.')
  .when('The command is dispatched twice, with different objects with the same contents.')
  .and('Then dispatched with an object with different contents.')
  .then('The second command is aborted.')
  .and('The third command runs.')
  .run(async (_) => {
    const sent: any[] = [];
    const server = new Deferred();

    class SaveItem extends SaveValue {
      constructor(readonly key: any) {
        super({ send: () => { sent.push(key); return server.promise; } });
      }

      nonReentrantKeyParams() {
        return this.key;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveItem({ id: 1, tags: ['a'] }));
    store.dispatch(new SaveItem({ id: 1, tags: ['a'] }));
    store.dispatch(new SaveItem({ id: 1, tags: ['b'] }));

    expect(sent).toEqual([{ id: 1, tags: ['a'] }, { id: 1, tags: ['b'] }]);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('Different optimistic commands with the same key block each other.')
  .given('Two different optimistic commands, that compute the same non-reentrant key for the same user.')
  .when('The first command is dispatched for a user.')
  .and('The second command is dispatched for the same user, and then for another user, while the first one is running.')
  .then('The second command for the same user is aborted.')
  .and('The second command for the other user runs.')
  .run(async (_) => {
    const sent: string[] = [];
    const server = new Deferred();

    class SaveUser extends SaveValue {
      constructor(readonly userId: string) {
        super({ send: () => { sent.push('save ' + userId); return server.promise; } });
      }

      computeNonReentrantKey() {
        return this.userId;
      }
    }

    class DeleteUser extends SaveValue {
      constructor(readonly userId: string) {
        super({ send: () => { sent.push('delete ' + userId); return server.promise; } });
      }

      computeNonReentrantKey() {
        return this.userId;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveUser('123'));
    store.dispatch(new DeleteUser('123'));
    store.dispatch(new DeleteUser('456'));

    expect(sent).toEqual(['save 123', 'delete 456']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('By default, different optimistic command classes do not block each other.')
  .given('Two different optimistic command classes.')
  .when('Both are dispatched at the same time.')
  .then('Both run.')
  .run(async (_) => {
    const sent: string[] = [];
    const server = new Deferred();

    class SaveA extends SaveValue {
      constructor() {
        super({ send: () => { sent.push('A'); return server.promise; } });
      }
    }

    class SaveB extends SaveValue {
      constructor() {
        super({ send: () => { sent.push('B'); return server.promise; } });
      }
    }

    const store = new Store<State>({ initialState: new State('old') });

    store.dispatch(new SaveA());
    store.dispatch(new SaveB());

    expect(sent).toEqual(['A', 'B']);

    server.resolve(undefined);
    await store.waitAllActions([]);
  });

Bdd(feature)
  .scenario('An optimistic command can also abort its own dispatch.')
  .given('An optimistic command whose abortDispatch returns true.')
  .when('The command is dispatched.')
  .then('It does not run, and the state does not change.')
  .run(async (_) => {
    class SaveAborted extends SaveValue {
      abortDispatch() {
        return true;
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveAborted({ log });

    store.dispatch(action);
    await flush();

    expect(action.status.isDispatched).toBe(false);
    expect(store.state.value).toBe('old');
    expect(log).toEqual([]);
  });

Bdd(feature)
  .scenario('An optimistic command cannot use the nonReentrant property.')
  .given('An optimistic command that sets nonReentrant to true.')
  .when('The command is dispatched.')
  .then('The dispatch throws a StoreException.')
  .and('The state does not change.')
  .run(async (_) => {
    class SaveNonReentrant extends SaveValue {
      nonReentrant = true;
    }

    const store = new Store<State>({ initialState: new State('old') });

    expect(() => store.dispatch(new SaveNonReentrant())).toThrow(StoreException);
    expect(store.state.value).toBe('old');
  });

// ----------------------------------------------------------------------------
// Retry

Bdd(feature)
  .scenario('With retry, only the server call is retried, while the optimistic value stays in the state.')
  .given('An optimistic command with retry on.')
  .and('Its server call fails twice, then succeeds.')
  .when('The command is dispatched.')
  .then('The server call runs 3 times.')
  .and('The optimistic value is applied only once, and is never rolled back.')
  .and('The action completes OK, after 2 retry attempts.')
  .run(async (_) => {
    const changes: string[] = [];
    let calls = 0;

    class SaveWithRetry extends SaveValue {
      retry = { initialDelay: 1, maxRetries: 3 };
    }

    const store = new Store<State>({
      initialState: new State('old'),
      stateObserver: (_action: KissAction<State>, prevState: State, newState: State) => {
        if (prevState !== newState) changes.push(newState.value);
      },
    });

    const action = new SaveWithRetry({
      send: async () => {
        calls++;
        if (calls < 3) throw new UserException('Command failed.');
      },
    });

    await store.dispatchAndWait(action);

    expect(calls).toBe(3);
    expect(changes).toEqual(['new']);
    expect(action.attempts).toBe(2);
    expect(action.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('With retry, the rollback happens only after all attempts fail.')
  .given('An optimistic command with retry on, and 2 retries at most.')
  .and('Its server call always fails.')
  .when('The command is dispatched.')
  .then('The server call runs 3 times.')
  .and('The state is rolled back only once, at the end.')
  .and('The action fails with the last command error.')
  .run(async (_) => {
    const changes: string[] = [];
    let calls = 0;
    let lastError: any;

    class SaveWithRetry extends SaveValue {
      retry = { initialDelay: 1, maxRetries: 2 };
    }

    const store = new Store<State>({
      initialState: new State('old'),
      stateObserver: (_action: KissAction<State>, prevState: State, newState: State) => {
        if (prevState !== newState) changes.push(newState.value);
      },
    });

    const action = new SaveWithRetry({
      send: async () => {
        calls++;
        lastError = new UserException('Command failed ' + calls);
        throw lastError;
      },
    });

    await store.dispatchAndWait(action);

    expect(calls).toBe(3);
    expect(changes).toEqual(['new', 'old']);
    expect(action.attempts).toBe(3);
    expect(action.status.originalError).toBe(lastError);
  });

Bdd(feature)
  .scenario('With retry, the server call waits for the retry delays between attempts.')
  .given('An optimistic command with retry options "initialDelay: 100", "multiplier: 2", "maxRetries: 3" and "maxDelay: 300".')
  .and('Its server call always fails.')
  .when('The command is dispatched.')
  .then('The server call waits 100, 200 and 300 millis between attempts.')
  .and('While it waits to retry, the command is in progress.')
  .run(async (_) => {
    const times: number[] = [];

    class SaveWithRetry extends SaveValue {
      retry = { initialDelay: 100, multiplier: 2, maxRetries: 3, maxDelay: 300 };
    }

    jest.useFakeTimers();
    try {
      const store = new Store<State>({ initialState: new State('old') });
      const action = new SaveWithRetry({
        send: async () => {
          times.push(Date.now());
          throw new UserException('Command failed.');
        },
      });

      const promise = store.dispatchAndWait(action);
      await jest.advanceTimersByTimeAsync(50);
      expect(times.length).toBe(1);
      expect(store.isWaiting(SaveWithRetry)).toBe(true);
      expect(store.state.value).toBe('new');

      await jest.runAllTimersAsync();
      await promise;

      expect(times.slice(1).map((t, i) => t - times[i])).toEqual([100, 200, 300]);
      expect(store.isWaiting(SaveWithRetry)).toBe(false);
      expect(store.state.value).toBe('old');
    } finally {
      jest.useRealTimers();
    }
  });

Bdd(feature)
  .scenario('With retry, a command that succeeds the first time is not retried.')
  .given('An optimistic command with retry on.')
  .and('Its server call succeeds the first time.')
  .when('The command is dispatched.')
  .then('The server call runs once, with no retry attempts.')
  .run(async (_) => {
    class SaveWithRetry extends SaveValue {
      retry = { initialDelay: 1 };
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveWithRetry({ log });
    await store.dispatchAndWait(action);

    expect(log).toEqual(['send: new']);
    expect(action.attempts).toBe(0);
    expect(store.state.value).toBe('new');
  });

Bdd(feature)
  .scenario('An optimistic command cannot use unlimited retries.')
  .given('An optimistic command with unlimited retries (maxRetries -1, or unlimitedRetries true).')
  .when('The command is dispatched.')
  .then('The dispatch throws a StoreException.')
  .and('The state does not change.')
  .run(async (_) => {
    for (const retry of [{ maxRetries: -1 }, { unlimitedRetries: true }]) {
      class SaveUnlimited extends SaveValue {
        retry = retry;
      }

      const store = new Store<State>({ initialState: new State('old') });

      expect(() => store.dispatch(new SaveUnlimited())).toThrow(StoreException);
      expect(store.state.value).toBe('old');
    }
  });

// ----------------------------------------------------------------------------
// Check internet

Bdd(feature)
  .scenario('With checkInternet, when there is no internet, nothing is applied or sent.')
  .given('An optimistic command that checks for internet.')
  .and('There is no internet.')
  .when('The command is dispatched.')
  .then('No optimistic value is applied.')
  .and('The server call does not run.')
  .and('The action fails.')
  .and('When the internet is back, the command can be dispatched again.')
  .run(async (_) => {
    let online = false;

    class SaveCheckInternet extends SaveValue {
      checkInternet = { dialog: false };

      protected hasInternet(): Promise<boolean> {
        return Promise.resolve(online);
      }
    }

    const log: string[] = [];
    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveCheckInternet({ log });

    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('old');
    expect(log).toEqual([]);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(UserException);

    online = true;
    await store.dispatchAndWait(new SaveCheckInternet({ log }));
    expect(store.state.value).toBe('new');
    expect(log).toEqual(['send: new']);
  });
