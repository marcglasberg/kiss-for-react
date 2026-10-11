import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchAll and dispatchAndWaitAll inside actions');

class State {
  constructor(readonly log: string[]) {}
}

/** A SYNC action that adds its name to the log. */
class SyncAction extends KissAction<State> {
  constructor(readonly name: string) { super(); }

  reduce() {
    return new State([...this.state.log, this.name]);
  }
}

/** An ASYNC action that waits a bit, and then adds its name to the log. */
class AsyncAction extends KissAction<State> {
  constructor(readonly name: string, readonly millis = 10) { super(); }

  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, this.millis));
    return (state: State) => new State([...state.log, this.name]);
  }
}

/** An ASYNC action that waits a bit, and then fails. */
class AsyncFail extends KissAction<State> {
  constructor(readonly name: string, readonly millis = 10) { super(); }

  async reduce(): Promise<null> {
    await new Promise((resolve) => setTimeout(resolve, this.millis));
    throw new Error('Failed: ' + this.name);
  }
}

/** A SYNC action that dispatches the given actions with `this.dispatchAll`. */
class DispatchAllAction extends KissAction<State> {
  result: KissAction<State>[] | undefined;

  constructor(readonly actions: KissAction<State>[]) { super(); }

  reduce() {
    this.result = this.dispatchAll(this.actions);
    return null;
  }
}

/** An ASYNC action that dispatches the given actions with `this.dispatchAndWaitAll`. */
class DispatchAndWaitAllAction extends KissAction<State> {
  result: KissAction<State>[] | undefined;

  constructor(readonly actions: KissAction<State>[]) { super(); }

  async reduce() {
    this.result = await this.dispatchAndWaitAll(this.actions);
    return (state: State) => new State([...state.log, 'Done']);
  }
}

function createStore() {
  return new Store<State>({ initialState: new State([]), logger: () => {} });
}

Bdd(feature)
  .scenario('An action can dispatch all given actions with dispatchAll.')
  .given('Two SYNC actions and one ASYNC action.')
  .when('An action dispatches the three actions with this.dispatchAll.')
  .then('All three actions are dispatched.')
  .and('The SYNC actions changed the state right away.')
  .and('It returns the same list of actions.')
  .and('The ASYNC action changes the state when it finishes.')
  .run(async (_) => {
    // Given: three actions.
    const store = createStore();
    const actions = [new SyncAction('A'), new AsyncAction('B'), new SyncAction('C')];

    // When: an action dispatches them with this.dispatchAll.
    const action = new DispatchAllAction(actions);
    store.dispatch(action);

    // Then: all were dispatched, the SYNC ones already changed the state, and it returns them.
    for (const a of actions) expect(a.status.isDispatched).toBe(true);
    expect(store.state.log).toEqual(['A', 'C']);
    expect(action.result).toBe(actions);

    // And: the ASYNC action changes the state when it finishes.
    await store.waitAllActions(actions, { completeImmediately: true, timeoutMillis: 1000 });
    expect(store.state.log).toEqual(['A', 'C', 'B']);
  });

Bdd(feature)
  .scenario('An action can dispatch all given actions, and wait for them, with dispatchAndWaitAll.')
  .given('A SYNC action and two ASYNC actions, which take different times to finish.')
  .when('An action dispatches the three actions with this.dispatchAndWaitAll.')
  .then('It waits until all three actions finished.')
  .and('It gets the same list of actions.')
  .run(async (_) => {
    // Given: three actions.
    const store = createStore();
    const actions = [new AsyncAction('Slow', 30), new SyncAction('Sync'), new AsyncAction('Fast', 5)];

    // When: an action dispatches them with this.dispatchAndWaitAll.
    const action = new DispatchAndWaitAllAction(actions);
    const status = await store.dispatchAndWait(action);

    // Then: the action only finished after all of them finished.
    expect(status.isCompletedOk).toBe(true);
    for (const a of actions) expect(a.status.isCompletedOk).toBe(true);
    expect(store.state.log).toEqual(['Sync', 'Fast', 'Slow', 'Done']);

    // And: it got the same list.
    expect(action.result).toBe(actions);
  });

Bdd(feature)
  .scenario('Inside an action, dispatchAndWaitAll rejects with the error of the first failed action, after all actions finish.')
  .given('Two ASYNC actions that fail, and an ASYNC action that succeeds and takes longer to finish.')
  .when('An action dispatches the three actions with this.dispatchAndWaitAll.')
  .then('The action fails only after all three actions finished.')
  .and('It fails with the error of the first failed action in the list.')
  .run(async (_) => {
    // Given: three actions.
    const store = createStore();
    const fail1 = new AsyncFail('First', 10);
    const fail2 = new AsyncFail('Second', 5);
    const slowOk = new AsyncAction('Slow', 30);

    // When: an action dispatches them with this.dispatchAndWaitAll.
    const action = new DispatchAndWaitAllAction([slowOk, fail1, fail2]);
    let error: unknown;
    await store.dispatchAndWait(action).catch((e) => { error = e; });

    // Then: it failed only after all of them finished.
    expect(action.status.isCompletedFailed).toBe(true);
    expect(slowOk.status.isCompletedOk).toBe(true);
    expect(fail1.status.isCompletedFailed).toBe(true);
    expect(fail2.status.isCompletedFailed).toBe(true);
    expect(store.state.log).toEqual(['Slow']);

    // And: with the error of the first failed action in the list (not the first that failed in time).
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Failed: First');
  });
