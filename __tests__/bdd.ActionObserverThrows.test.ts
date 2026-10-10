import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ActionObserver that throws');

class State {
  constructor(readonly count: number) {
  }
}

class IncrementSync extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class IncrementAsync extends KissAction<State> {
  async reduce() {
    await delayMillis(10);
    return (state: State) => new State(state.count + 1);
  }
}

class FailSync extends KissAction<State> {
  reduce(): State {
    throw new Error('action error');
  }
}

class FailAsync extends KissAction<State> {
  async reduce(): Promise<(state: State) => State> {
    await delayMillis(10);
    throw new Error('action error');
  }
}

function createAction(kind: string): KissAction<State> {
  switch (kind) {
    case 'SYNC':
      return new IncrementSync();
    case 'ASYNC':
      return new IncrementAsync();
    case 'failing SYNC':
      return new FailSync();
    case 'failing ASYNC':
      return new FailAsync();
    default:
      throw new Error(`Unknown kind: ${kind}`);
  }
}

// Creates a store whose `actionObserver` records its calls, and throws when called
// with the given `ini` value.
function createStore(throwWhenIni: boolean, calls: string[]): Store<State> {
  return new Store<State>({
    initialState: new State(1),
    logger: null,
    actionObserver: (action, _dispatchCount, ini) => {
      calls.push(`${action}:${ini ? 'ini' : 'end'}`);
      if (ini === throwWhenIni) throw new Error('observer error');
    },
  });
}

// Returns a promise that settles when the given promise settles, or after 500 ms.
// It resolves with how the given promise settled.
function settlesWithin500ms(promise: Promise<any>): Promise<{ settled: boolean, value?: any, error?: any }> {
  return Promise.race([
    promise.then(
      (value) => ({settled: true, value}),
      (error) => ({settled: true, error}),
    ),
    delayMillis(500).then(() => ({settled: false})),
  ]);
}

Bdd(feature)
  .scenario('dispatchAndWait settles when the actionObserver throws as the action finishes.')
  .given('An actionObserver that throws when the action finishes (ini false).')
  .and('A [Kind] action that changes the state.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The promise resolves with the action status "completed OK".')
  .and('The state is changed.')
  .and('The action is no longer in progress.')
  .example(val('Kind', 'SYNC'))
  .example(val('Kind', 'ASYNC'))
  .run(async (ctx) => {
    const calls: string[] = [];
    const store = createStore(false, calls);
    const action = createAction(ctx.example.val('Kind'));

    const result = await settlesWithin500ms(store.dispatchAndWait(action));

    expect(result.settled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.value.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
    expect(store.actionsInProgress().size).toBe(0);
    expect(calls).toEqual([`${action}:ini`, `${action}:end`]);
  });

Bdd(feature)
  .scenario('A failing action still rejects with its own error when the actionObserver throws as it finishes.')
  .given('An actionObserver that throws when the action finishes (ini false).')
  .and('A [Kind] action that fails with an error.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The promise rejects with the error of the action, not the error of the actionObserver.')
  .and('The action is no longer in progress.')
  .example(val('Kind', 'failing SYNC'))
  .example(val('Kind', 'failing ASYNC'))
  .run(async (ctx) => {
    const calls: string[] = [];
    const store = createStore(false, calls);
    const action = createAction(ctx.example.val('Kind'));

    const result = await settlesWithin500ms(store.dispatchAndWait(action));

    expect(result.settled).toBe(true);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('action error');
    expect(action.status.isCompletedFailed).toBe(true);
    expect(store.actionsInProgress().size).toBe(0);
  });

Bdd(feature)
  .scenario('dispatch does not throw when the actionObserver throws as a SYNC action finishes.')
  .given('An actionObserver that throws when the action finishes (ini false).')
  .and('A SYNC action that changes the state.')
  .when('The action is dispatched with dispatch.')
  .then('The dispatch does not throw.')
  .and('The state is changed.')
  .run(async (_) => {
    const calls: string[] = [];
    const store = createStore(false, calls);

    expect(() => store.dispatch(new IncrementSync())).not.toThrow();
    expect(store.state.count).toBe(2);
  });

Bdd(feature)
  .scenario('The action still runs when the actionObserver throws as the action starts.')
  .given('An actionObserver that throws when the action starts (ini true).')
  .and('A [Kind] action that changes the state.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The promise resolves with the action status "completed OK".')
  .and('The state is changed.')
  .and('The actionObserver is also called when the action finishes.')
  .example(val('Kind', 'SYNC'))
  .example(val('Kind', 'ASYNC'))
  .run(async (ctx) => {
    const calls: string[] = [];
    const store = createStore(true, calls);
    const action = createAction(ctx.example.val('Kind'));

    let promise: Promise<any>;
    try {
      promise = store.dispatchAndWait(action);
    } catch (error) {
      promise = Promise.reject(error);
    }
    const result = await settlesWithin500ms(promise);

    expect(result.settled).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.value.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(2);
    expect(store.actionsInProgress().size).toBe(0);
    expect(calls).toEqual([`${action}:ini`, `${action}:end`]);
  });
