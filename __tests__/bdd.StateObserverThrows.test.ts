import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Persistor, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('StateObserver that throws');

class State {
  constructor(readonly n: number) {
  }
}

class SetNSync extends KissAction<State> {
  constructor(readonly value: number) {
    super();
  }

  reduce() {
    return new State(this.value);
  }
}

class SetNAsync extends KissAction<State> {
  constructor(readonly value: number) {
    super();
  }

  async reduce() {
    await delayMillis(10);
    return (_state: State) => new State(this.value);
  }
}

class DoNothingSync extends KissAction<State> {
  reduce() {
    return null;
  }
}

class FailSync extends KissAction<State> {
  wrapErrorCalls = 0;

  reduce(): State {
    throw new Error('action error');
  }

  wrapError(error: any) {
    this.wrapErrorCalls++;
    return new Error('wrapped ' + error.message);
  }
}

class FailAsync extends KissAction<State> {
  wrapErrorCalls = 0;

  async reduce(): Promise<(state: State) => State> {
    await delayMillis(10);
    throw new Error('action error');
  }

  wrapError(error: any) {
    this.wrapErrorCalls++;
    return new Error('wrapped ' + error.message);
  }
}

function createAction(kind: string): KissAction<State> {
  switch (kind) {
    case 'SYNC':
      return new SetNSync(5);
    case 'ASYNC':
      return new SetNAsync(5);
    case 'SYNC unchanged':
      return new DoNothingSync();
    case 'failing SYNC':
      return new FailSync();
    case 'failing ASYNC':
      return new FailAsync();
    default:
      throw new Error(`Unknown kind: ${kind}`);
  }
}

/** A persistor that keeps the saved state in memory. */
class MemPersistor extends Persistor<State> {
  stored: State | null = null;

  constructor(private readonly throttleMillis: number) {
    super();
  }

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
    return this.throttleMillis;
  }
}

// Creates a store whose `stateObserver` always throws. The `errorObserver` records the errors
// it gets, and returns them unchanged.
function createStore(errors: any[], persistor?: Persistor<State>): Store<State> {
  return new Store<State>({
    initialState: new State(0),
    logger: null,
    persistor,
    stateObserver: () => {
      throw new Error('observer error');
    },
    errorObserver: ({error}) => {
      errors.push(error);
      return error;
    },
  });
}

// Dispatches with `dispatchAndWait`, and returns how the promise settled (or how the
// dispatch threw), or `{settled: false}` if it didn't settle within 500 ms.
async function dispatchAndSettle(store: Store<State>, action: KissAction<State>)
  : Promise<{ settled: boolean, value?: any, error?: any }> {
  let promise: Promise<any>;
  try {
    promise = store.dispatchAndWait(action);
  } catch (error) {
    promise = Promise.reject(error);
  }
  return Promise.race([
    promise.then(
      (value) => ({settled: true, value}),
      (error) => ({settled: true, error}),
    ),
    delayMillis(500).then(() => ({settled: false})),
  ]);
}

Bdd(feature)
  .scenario('An action completes normally when the stateObserver throws.')
  .given('A stateObserver that throws.')
  .and('A [Kind] action.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The promise resolves with the action status "completed OK".')
  .and('The state is the one returned by the action.')
  .and('The error of the stateObserver is not given to the errorObserver.')
  .and('The action is no longer in progress.')
  .example(val('Kind', 'SYNC'), val('Expected n', 5))
  .example(val('Kind', 'ASYNC'), val('Expected n', 5))
  .example(val('Kind', 'SYNC unchanged'), val('Expected n', 0))
  .run(async (ctx) => {
    const errors: any[] = [];
    const store = createStore(errors);
    const action = createAction(ctx.example.val('Kind'));

    const result = await dispatchAndSettle(store, action);

    expect(result.settled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.value.isCompletedOk).toBe(true);
    expect(store.state.n).toBe(ctx.example.val('Expected n'));
    expect(errors).toEqual([]);
    expect(store.actionsInProgress().size).toBe(0);
  });

Bdd(feature)
  .scenario('dispatch does not throw when the stateObserver throws for a SYNC action.')
  .given('A stateObserver that throws.')
  .and('A SYNC action that changes the state.')
  .when('The action is dispatched with dispatch.')
  .then('The dispatch does not throw.')
  .and('The state is changed.')
  .and('The action does not count as failed.')
  .run(async (_) => {
    const errors: any[] = [];
    const store = createStore(errors);
    const action = new SetNSync(5);

    expect(() => store.dispatch(action)).not.toThrow();
    expect(store.state.n).toBe(5);
    expect(action.status.isCompletedOk).toBe(true);
    expect(store.isFailed(SetNSync)).toBe(false);
  });

Bdd(feature)
  .scenario('A failing action still goes through wrapError and fails with its own error when the stateObserver throws.')
  .given('A stateObserver that throws.')
  .and('A [Kind] action that fails, and whose wrapError wraps the error.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The wrapError of the action is called once.')
  .and('The errorObserver gets the wrapped error.')
  .and('The promise rejects with the wrapped error, not with the error of the stateObserver.')
  .example(val('Kind', 'failing SYNC'))
  .example(val('Kind', 'failing ASYNC'))
  .run(async (ctx) => {
    const errors: any[] = [];
    const store = createStore(errors);
    const action = createAction(ctx.example.val('Kind')) as FailSync | FailAsync;

    const result = await dispatchAndSettle(store, action);

    expect(action.wrapErrorCalls).toBe(1);
    expect(errors.map(e => e.message)).toEqual(['wrapped action error']);
    expect(result.settled).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('wrapped action error');
    expect(action.status.isCompletedFailed).toBe(true);
    expect(store.actionsInProgress().size).toBe(0);
  });

Bdd(feature)
  .scenario('The state is persisted when the stateObserver throws.')
  .given('A stateObserver that throws.')
  .and('A persistor with no throttle.')
  .when('A [Kind] action changes the state.')
  .then('The persistor saves the new state.')
  .example(val('Kind', 'SYNC'))
  .example(val('Kind', 'ASYNC'))
  .run(async (ctx) => {
    const errors: any[] = [];
    const persistor = new MemPersistor(0);
    const store = createStore(errors, persistor);
    await store.ready();

    await dispatchAndSettle(store, createAction(ctx.example.val('Kind')));
    await delayMillis(20);

    expect(persistor.stored).toEqual(new State(5));
  });

Bdd(feature)
  .scenario('persistAndPausePersistor saves a state that was applied while the stateObserver threw.')
  .given('A stateObserver that throws.')
  .and('A persistor with a long throttle, so the state is not saved right away.')
  .and('A SYNC action changed the state.')
  .when('persistAndPausePersistor is called.')
  .then('The persistor saves the new state.')
  .run(async (_) => {
    const errors: any[] = [];
    const persistor = new MemPersistor(60_000);
    const store = createStore(errors, persistor);
    await store.ready();
    expect(persistor.stored).toEqual(new State(0));

    try {
      store.dispatch(new SetNSync(5));
    } catch {
      // Ignored here. The scenarios above check that dispatch does not throw.
    }

    await store.persistAndPausePersistor();

    expect(persistor.stored).toEqual(new State(5));
  });

Bdd(feature)
  .scenario('waitCondition sees a state change made while the stateObserver threw.')
  .given('A stateObserver that throws.')
  .and('A waitCondition for the state n === 5.')
  .when('A [Kind] action changes the state to n = 5.')
  .then('The waitCondition resolves.')
  .example(val('Kind', 'SYNC'))
  .example(val('Kind', 'ASYNC'))
  .run(async (ctx) => {
    const errors: any[] = [];
    const store = createStore(errors);

    const wait = store.waitCondition(s => s.n === 5, {timeoutMillis: 300});

    await dispatchAndSettle(store, createAction(ctx.example.val('Kind')));

    expect(await wait.then(() => 'resolved', () => 'rejected')).toBe('resolved');
  });

Bdd(feature)
  .scenario('dispatchWhen dispatches its action when the stateObserver throws.')
  .given('A stateObserver that throws.')
  .and('A dispatchWhen action, waiting for the state n === 5.')
  .when('A [Kind] action changes the state to n = 5.')
  .then('The dispatchWhen action is dispatched.')
  .example(val('Kind', 'SYNC'))
  .example(val('Kind', 'ASYNC'))
  .run(async (ctx) => {
    const errors: any[] = [];
    const store = createStore(errors);

    const whenAction = new SetNSync(7);
    store.dispatchWhen(whenAction, s => s.n === 5, {timeoutMillis: 300});

    await dispatchAndSettle(store, createAction(ctx.example.val('Kind')));

    expect(whenAction.status.isDispatched).toBe(true);
    expect(store.state.n).toBe(7);
  });
