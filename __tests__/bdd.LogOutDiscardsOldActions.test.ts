import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Persistor, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('LogOut discards the actions dispatched before it');

class State {
  constructor(readonly user: string | null, readonly n: number = 0) {
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

/** A persistor that keeps the saved state in memory. */
class MemPersistor extends Persistor<State> {
  stored: State | null = null;

  async readState() {
    return null;
  }

  async deleteState() {
    this.stored = null;
  }

  async persistDifference(_last: State | null, newState: State) {
    this.stored = newState;
  }

  get throttle() {
    return 0;
  }
}

/** Sets the user, synchronously. */
class SetUser extends KissAction<State> {
  constructor(readonly user: string | null) {
    super();
  }

  reduce() {
    return new State(this.user, this.state.n);
  }
}

/** Sets `n`, synchronously. */
class SetN extends KissAction<State> {
  constructor(readonly n: number) {
    super();
  }

  reduce() {
    return new State(this.state.user, this.n);
  }
}

/** Loads the user 'bob' when the gate opens: in an ASYNC `reduce`. */
class LoadUserInReduce extends KissAction<State> {
  constructor(readonly gate: Deferred) {
    super();
  }

  async reduce() {
    await this.gate.promise;
    return (state: State) => new State('bob', state.n);
  }
}

/** Loads the user 'bob' when the gate opens: an ASYNC `before`, and a SYNC `reduce`. */
class LoadUserInBefore extends KissAction<State> {
  constructor(readonly gate: Deferred) {
    super();
  }

  async before() {
    await this.gate.promise;
  }

  reduce() {
    return new State('bob', this.state.n);
  }
}

/** Fails when the gate opens. */
class FailsLater extends KissAction<State> {
  constructor(readonly gate: Deferred, readonly error: any) {
    super();
  }

  async reduce(): Promise<(state: State) => State> {
    await this.gate.promise;
    throw this.error;
  }
}

/** When the gate opens, dispatches the given child action with the given method. */
class DispatchesLater extends KissAction<State> {
  constructor(readonly gate: Deferred, readonly method: string, readonly child: KissAction<State>) {
    super();
  }

  async reduce() {
    await this.gate.promise;
    const child = this.child;
    switch (this.method) {
      case 'dispatch':
        this.dispatch(child);
        break;
      case 'dispatchAndWait':
        await this.dispatchAndWait(child);
        break;
      case 'dispatchSync':
        this.dispatchSync(child);
        break;
      case 'dispatchAll':
        this.dispatchAll([child]);
        break;
      case 'dispatchAndWaitAll':
        await this.dispatchAndWaitAll([child]);
        break;
      case 'dispatchWhen':
        this.dispatchWhen(child, () => true, {timeoutMillis: 0});
        break;
      default:
        throw new Error(`Unknown method: ${this.method}`);
    }
    return null;
  }
}

/** Calls `dispatchWhen` for the given child action, and finishes right away. */
class RegistersDispatchWhen extends KissAction<State> {
  constructor(readonly child: KissAction<State>) {
    super();
  }

  reduce() {
    this.dispatchWhen(this.child, (state) => state.n === 5, {timeoutMillis: 0});
    return null;
  }
}

/** Saves the user name in the server, and puts the server response in the state. */
class SaveUserName extends OptimisticCommand<State, string | null> {
  constructor(readonly serverResponse: Deferred<string>) {
    super();
  }

  optimisticValue() {
    return 'bob (saving)';
  }

  getValueFromState(state: State) {
    return state.user;
  }

  applyValueToState(state: State, value: string | null) {
    return new State(value, state.n);
  }

  async sendCommandToServer(_value: string | null) {
    return this.serverResponse.promise;
  }

  applyServerResponseToState(state: State, serverResponse: any) {
    return new State(serverResponse, state.n);
  }
}

/** Calls logOut and waits for it. Then changes the state, and dispatches an action. */
class LogOutAndThenContinue extends KissAction<State> {
  constructor(readonly child: KissAction<State>) {
    super();
  }

  async reduce() {
    await this.store.logOut({initialState: new State(null), throttle: 0, actionsThrottle: 0});
    this.dispatch(this.child);
    return (state: State) => new State('after logOut', state.n);
  }
}

/** Dispatches the given child action with `this.dispatch`. */
class DispatchesChild extends KissAction<State> {
  constructor(readonly child: KissAction<State>) {
    super();
  }

  reduce() {
    this.dispatch(this.child);
    return null;
  }
}

function createStore(options: { persistor?: Persistor<State>, errors?: any[], shown?: UserException[] } = {}) {
  return new Store<State>({
    initialState: new State(null),
    logger: null,
    persistor: options.persistor,
    errorObserver: ({error}) => {
      options.errors?.push(error);
      return error;
    },
    showUserException: (exception, _count, next) => {
      options.shown?.push(exception);
      next();
    },
  });
}

const logOut = (store: Store<State>) =>
  store.logOut({initialState: new State(null), throttle: 0, actionsThrottle: 0});

function createLoadUser(kind: string, gate: Deferred): KissAction<State> {
  switch (kind) {
    case 'ASYNC reduce':
      return new LoadUserInReduce(gate);
    case 'ASYNC before, SYNC reduce':
      return new LoadUserInBefore(gate);
    default:
      throw new Error(`Unknown kind: ${kind}`);
  }
}

Bdd(feature)
  .scenario('An action dispatched before logOut does not change the state when it finishes after logOut.')
  .given('A store with a persistor.')
  .and('An action that loads the user "bob", with an [Kind].')
  .and('The action was dispatched, and is still running.')
  .when('logOut runs and finishes, and only then the action finishes.')
  .then('The state is still the initial-state of logOut.')
  .and('The persisted state is also the initial-state of logOut.')
  .and('The action finishes as aborted, not as failed.')
  .example(val('Kind', 'ASYNC reduce'))
  .example(val('Kind', 'ASYNC before, SYNC reduce'))
  .run(async (ctx) => {
    const persistor = new MemPersistor();
    const store = createStore({persistor});
    await store.ready();

    const gate = new Deferred();
    const action = createLoadUser(ctx.example.val('Kind'), gate);
    const promise = store.dispatchAndWait(action);

    await logOut(store);
    expect(store.state.user).toBeNull();

    gate.resolve(undefined);
    const status = await promise;
    await delayMillis(20);

    expect(store.state.user).toBeNull();
    expect(persistor.stored).toEqual(new State(null));
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isFailed(action.constructor as any)).toBe(false);
  });

Bdd(feature)
  .scenario('An action dispatched before logOut that fails after logOut does not fail, and its error is not shown.')
  .given('An action that fails with [Error] when it finishes.')
  .and('The action was dispatched, and is still running.')
  .when('logOut runs and finishes, and only then the action fails.')
  .then('The action finishes as aborted, not as failed.')
  .and('The error is not given to the errorObserver.')
  .and('No error is shown to the user.')
  .and('The action does not count as failed.')
  .example(val('Error', 'an Error'))
  .example(val('Error', 'a UserException'))
  .run(async (ctx) => {
    const errors: any[] = [];
    const shown: UserException[] = [];
    const store = createStore({errors, shown});

    const gate = new Deferred();
    const error = ctx.example.val('Error') === 'an Error'
      ? new Error('Could not load bob.')
      : new UserException('Could not load bob.');
    const action = new FailsLater(gate, error);
    const promise = store.dispatchAndWait(action);

    await logOut(store);
    gate.resolve(undefined);
    const status = await promise;

    expect(status.isDispatchAborted).toBe(true);
    expect(errors).toEqual([]);
    expect(shown).toEqual([]);
    expect(store.isFailed(FailsLater)).toBe(false);
  });

Bdd(feature)
  .scenario('An action dispatched before logOut cannot dispatch other actions after logOut.')
  .given('An action that, when it finishes, dispatches another action with [Method].')
  .and('The action was dispatched, and is still running.')
  .when('logOut runs and finishes, and only then the action dispatches the other action.')
  .then('The other action is not dispatched.')
  .and('The state is still the initial-state of logOut.')
  .example(val('Method', 'dispatch'))
  .example(val('Method', 'dispatchAndWait'))
  .example(val('Method', 'dispatchSync'))
  .example(val('Method', 'dispatchAll'))
  .example(val('Method', 'dispatchAndWaitAll'))
  .example(val('Method', 'dispatchWhen'))
  .run(async (ctx) => {
    const store = createStore();

    const gate = new Deferred();
    const child = new SetUser('bob');
    const promise = store.dispatchAndWait(new DispatchesLater(gate, ctx.example.val('Method'), child));

    await logOut(store);
    gate.resolve(undefined);
    await promise;
    await delayMillis(10);

    expect(child.status.isDispatched).toBe(false);
    expect(store.state.user).toBeNull();
  });

Bdd(feature)
  .scenario('A dispatchWhen called by an action before logOut does not dispatch after logOut.')
  .given('An action that called dispatchWhen, to dispatch another action when n is 5.')
  .and('The action finished, before logOut.')
  .when('logOut runs and finishes, and then the state changes to n = 5.')
  .then('The other action is not dispatched.')
  .run(async (_) => {
    const store = createStore();

    const child = new SetN(7);
    store.dispatch(new RegistersDispatchWhen(child));

    await logOut(store);
    store.dispatch(new SetN(5));

    expect(child.status.isDispatched).toBe(false);
    expect(store.state.n).toBe(5);
  });

Bdd(feature)
  .scenario('An OptimisticCommand dispatched before logOut does not apply the server response after logOut.')
  .given('An OptimisticCommand that saves the user name, and puts the server response in the state.')
  .and('The command was dispatched, and its optimistic value was applied.')
  .when('logOut runs and finishes, and only then the server responds.')
  .then('The server response is not applied.')
  .and('The state is still the initial-state of logOut.')
  .and('The command finishes as aborted, not as failed.')
  .run(async (_) => {
    const store = createStore();

    const serverResponse = new Deferred<string>();
    const command = new SaveUserName(serverResponse);
    const promise = store.dispatchAndWait(command);
    expect(store.state.user).toBe('bob (saving)');

    await logOut(store);
    expect(store.state.user).toBeNull();

    serverResponse.resolve('bob (saved)');
    const status = await promise;

    expect(store.state.user).toBeNull();
    expect(status.isDispatchAborted).toBe(true);
    expect(store.isFailed(SaveUserName)).toBe(false);
  });

Bdd(feature)
  .scenario('An action that calls logOut and waits for it cannot change the state, or dispatch actions, after it.')
  .given('An action that calls logOut and waits for it.')
  .and('After logOut, the action dispatches another action, and changes the state.')
  .when('The action is dispatched.')
  .then('The other action is not dispatched.')
  .and('The state is the initial-state of logOut.')
  .and('The action finishes as aborted, since it was dispatched before logOut.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new SetUser('bob'));

    const child = new SetN(7);
    const status = await store.dispatchAndWait(new LogOutAndThenContinue(child));

    expect(child.status.isDispatched).toBe(false);
    expect(store.state).toEqual(new State(null));
    expect(status.isDispatchAborted).toBe(true);
  });

Bdd(feature)
  .scenario('Actions dispatched after logOut run normally, and so do the actions they dispatch.')
  .given('A logOut that already finished.')
  .when('An action is dispatched, which dispatches another action.')
  .then('Both actions run, and change the state.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new SetUser('bob'));
    await logOut(store);

    const child = new SetUser('alice');
    const parent = new DispatchesChild(child);
    store.dispatch(parent);

    expect(parent.status.isCompletedOk).toBe(true);
    expect(child.status.isCompletedOk).toBe(true);
    expect(store.state.user).toBe('alice');
  });

Bdd(feature)
  .scenario('An action dispatched before logOut, which finished before logOut, is not affected.')
  .given('An ASYNC action that loads the user "bob".')
  .when('The action finishes, and only then logOut runs.')
  .then('The action completed OK, and changed the state before logOut.')
  .and('After logOut, the state is the initial-state of logOut.')
  .run(async (_) => {
    const store = createStore();

    const gate = new Deferred();
    gate.resolve(undefined);
    const status = await store.dispatchAndWait(new LoadUserInReduce(gate));
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.user).toBe('bob');

    await logOut(store);
    expect(store.state.user).toBeNull();
  });
