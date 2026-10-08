import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, StoreException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Dispatching the same action twice');

const logger = (_: string) => {};

class State {
  constructor(readonly count: number) {
  }
}

class SyncIncrement extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class AsyncIncrement extends KissAction<State> {
  async reduce() {
    await new Promise(resolve => setTimeout(resolve, 20));
    return (state: State) => new State(state.count + 1);
  }
}

function createAction(kind: string): KissAction<State> {
  return kind === 'sync' ? new SyncIncrement() : new AsyncIncrement();
}

// Dispatches the action with the given method.
function dispatchWith(store: Store<State>, method: string, action: KissAction<State>): void {
  if (method === 'dispatchAndWait') store.dispatchAndWait(action);
  else if (method === 'dispatchSync') store.dispatchSync(action);
  else store.dispatch(action);
}

function createStore() {
  const counts: number[] = [];
  const store = new Store<State>({
    initialState: new State(0),
    logger,
    actionObserver: (_action, dispatchCount, ini) => {
      if (ini) counts.push(dispatchCount);
    },
  });
  return {store, counts};
}

Bdd(feature)
  .scenario('Dispatching an action that already finished throws right away.')
  .given('A SYNC or ASYNC action that was already dispatched and finished.')
  .when('The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.')
  .then('The dispatch call itself throws a StoreException (it does not return a rejected promise).')
  .and('The action does not run again.')
  .and('The failed dispatch still counts as a dispatch, but is not seen by the actionObserver.')
  .example(val('Kind', 'sync'), val('Method', 'dispatch'))
  .example(val('Kind', 'sync'), val('Method', 'dispatchSync'))
  .example(val('Kind', 'sync'), val('Method', 'dispatchAndWait'))
  .example(val('Kind', 'async'), val('Method', 'dispatch'))
  .example(val('Kind', 'async'), val('Method', 'dispatchSync'))
  .example(val('Kind', 'async'), val('Method', 'dispatchAndWait'))
  .run(async (ctx) => {
    const kind = ctx.example.val('Kind') as string;
    const method = ctx.example.val('Method') as string;

    // Given
    const {store, counts} = createStore();
    const action = createAction(kind);
    await store.dispatchAndWait(action);
    expect(store.state.count).toBe(1);

    // When / Then
    expect(() => dispatchWith(store, method, action)).toThrow(StoreException);
    expect(() => dispatchWith(store, method, action))
      .toThrow('The action was already dispatched. Please, create a new action each time.');

    await new Promise(resolve => setTimeout(resolve, 50));
    expect(store.state.count).toBe(1);
    expect(store.dispatchCount).toBe(3);
    expect(counts).toEqual([1]);
  });

Bdd(feature)
  .scenario('Dispatching an action that is still running throws, and the first dispatch is not affected.')
  .given('An ASYNC action that was dispatched with dispatchAndWait, and is still running.')
  .when('The same action instance is dispatched again with dispatch or dispatchAndWait.')
  .then('The second dispatch throws a StoreException right away.')
  .and('The first dispatchAndWait still finishes, and the action runs only once.')
  .example(val('Method', 'dispatch'))
  .example(val('Method', 'dispatchAndWait'))
  .run(async (ctx) => {
    const method = ctx.example.val('Method') as string;

    // Given
    const {store} = createStore();
    const action = new AsyncIncrement();
    const first = store.dispatchAndWait(action);

    // When / Then
    expect(() => dispatchWith(store, method, action)).toThrow(StoreException);

    const status = await first;
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('The already-dispatched error is not processed like an action failure.')
  .given('A store with an errorObserver and a globalWrapError.')
  .and('An action that was already dispatched.')
  .when('The same action instance is dispatched again.')
  .then('The StoreException is thrown to the caller.')
  .and('The errorObserver and the globalWrapError are not called.')
  .run(async (_) => {
    // Given
    const seen: any[] = [];
    const store = new Store<State>({
      initialState: new State(0),
      logger,
      errorObserver: (error) => {
        seen.push(error);
        return false;
      },
      globalWrapError: (error) => {
        seen.push(error);
        return null;
      },
    });
    const action = new SyncIncrement();
    store.dispatch(action);

    // When / Then
    expect(() => store.dispatchAndWait(action)).toThrow(StoreException);
    expect(seen).toEqual([]);
  });
