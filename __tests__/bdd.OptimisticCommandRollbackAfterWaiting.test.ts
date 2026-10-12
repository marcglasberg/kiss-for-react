import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { OptimisticCommand, Store, UpdateStateAction, UserException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic command rollback after waiting');

class State {
  constructor(readonly name: string) {
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

/**
 * Sets the name. The server call of each name waits until the test resolves or rejects it.
 * Different names have different non-reentrant keys, so they can be dispatched together.
 * The rollbacks have the initial values given to `rollbackState`.
 */
class SetName extends OptimisticCommand<State, string> {
  constructor(readonly name: string, readonly server: Map<string, Deferred>, readonly rollbacks: string[] = []) {
    super();
    server.set(name, new Deferred());
  }

  nonReentrantKeyParams() {
    return this.name;
  }

  optimisticValue() {
    return this.name;
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(_: State, name: string) {
    return new State(name);
  }

  sendCommandToServer() {
    return this.server.get(this.name)!.promise;
  }

  rollbackState({ initialValue, optimisticValue, error }: { initialValue: string, optimisticValue: string, error: any }) {
    this.rollbacks.push(`rollback ${optimisticValue} to ${initialValue}`);
    return super.rollbackState({ initialValue, optimisticValue, error });
  }
}

/** A `SetName` that waits for its turn in the queue. */
class SetNameSequential extends SetName {
  sequential = true;
}

// ----------------------------------------------------------------------------

Bdd(feature)
  .scenario('A sequential command that fails rolls back to the value of the earlier command that succeeded.')
  .given('A sequential optimistic command, and the name is "initial".')
  .and('The command is dispatched with name "a", and then with name "b", so "b" waits for its turn.')
  .when('The server saves "a".')
  .and('Then "b" gets its turn, and the server fails to save "b".')
  .then('The name is rolled back to "a", the value it had when "b" got its turn.')
  .run(async (_) => {
    const server = new Map<string, Deferred>();
    const rollbacks: string[] = [];
    const store = new Store<State>({ initialState: new State('initial') });

    store.dispatch(new SetNameSequential('a', server, rollbacks));
    store.dispatch(new SetNameSequential('b', server, rollbacks));
    await flush();
    expect(store.state.name).toBe('a');

    server.get('a')!.resolve(null);
    await flush();
    expect(store.state.name).toBe('b');

    server.get('b')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('a');
    expect(rollbacks).toEqual(['rollback b to a']);
  });

Bdd(feature)
  .scenario('A sequential command that fails does not roll back to the value of an earlier command that also failed.')
  .given('A sequential optimistic command, and the name is "initial".')
  .and('The command is dispatched with name "a", and its optimistic value is applied.')
  .and('Then it\'s dispatched with name "b", which waits for its turn.')
  .when('The server fails to save "a", so the name is rolled back to "initial".')
  .and('Then "b" gets its turn, and the server fails to save "b".')
  .then('The name is rolled back to "initial", and not to "a", which was never saved.')
  .run(async (_) => {
    const server = new Map<string, Deferred>();
    const rollbacks: string[] = [];
    const store = new Store<State>({ initialState: new State('initial') });

    store.dispatch(new SetNameSequential('a', server, rollbacks));
    await flush();
    expect(store.state.name).toBe('a');

    store.dispatch(new SetNameSequential('b', server, rollbacks));
    await flush();

    server.get('a')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('b');

    server.get('b')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('initial');
    expect(rollbacks).toEqual(['rollback a to initial', 'rollback b to initial']);
  });

Bdd(feature)
  .scenario('A sequential command rolls back to a value changed by another action while it waited for its turn.')
  .given('A sequential optimistic command, and the name is "initial".')
  .and('The command is dispatched with name "a", and then with name "b", so "b" waits for its turn.')
  .when('Meanwhile, another action changes the name to "other".')
  .and('Then the server saves "a", "b" gets its turn, and the server fails to save "b".')
  .then('The name is rolled back to "other", the value it had when "b" got its turn.')
  .run(async (_) => {
    const server = new Map<string, Deferred>();
    const rollbacks: string[] = [];
    const store = new Store<State>({ initialState: new State('initial') });

    store.dispatch(new SetNameSequential('a', server, rollbacks));
    store.dispatch(new SetNameSequential('b', server, rollbacks));
    await flush();
    expect(store.state.name).toBe('a');

    store.dispatch(new UpdateStateAction(() => new State('other')));
    server.get('a')!.resolve(null);
    await flush();
    expect(store.state.name).toBe('b');

    server.get('b')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('other');
    expect(rollbacks).toEqual(['rollback b to other']);
  });

Bdd(feature)
  .scenario('A command that checks the internet rolls back to the value it had when the internet check finished.')
  .given('An optimistic command that checks the internet, and the name is "initial".')
  .and('The command is dispatched with name "a", and is waiting for the internet check.')
  .when('Meanwhile, the name is changed to "other".')
  .and('Then the internet check finds the internet, and the server fails to save "a".')
  .then('The name is rolled back to "other", and not to "initial".')
  .run(async (_) => {
    const internet = new Deferred<boolean>();

    class SetNameCheckInternet extends SetName {
      checkInternet = { dialog: false };

      protected hasInternet(): Promise<boolean> {
        return internet.promise;
      }
    }

    const server = new Map<string, Deferred>();
    const rollbacks: string[] = [];
    const store = new Store<State>({ initialState: new State('initial') });

    store.dispatch(new SetNameCheckInternet('a', server, rollbacks));
    store.dispatch(new UpdateStateAction(() => new State('other')));
    await flush();
    expect(store.state.name).toBe('other');

    internet.resolve(true);
    await flush();
    expect(store.state.name).toBe('a');

    server.get('a')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('other');
    expect(rollbacks).toEqual(['rollback a to other']);
  });

Bdd(feature)
  .scenario('A command that does not wait rolls back to the value it had when it was dispatched.')
  .given('An optimistic command, and the name is "initial".')
  .when('The command is dispatched with name "a", and the server fails to save "a".')
  .then('The name is rolled back to "initial".')
  .run(async (_) => {
    const server = new Map<string, Deferred>();
    const rollbacks: string[] = [];
    const store = new Store<State>({ initialState: new State('initial') });

    store.dispatch(new SetName('a', server, rollbacks));
    expect(store.state.name).toBe('a');

    server.get('a')!.reject(new UserException('fail'));
    await flush();
    expect(store.state.name).toBe('initial');
    expect(rollbacks).toEqual(['rollback a to initial']);
  });
