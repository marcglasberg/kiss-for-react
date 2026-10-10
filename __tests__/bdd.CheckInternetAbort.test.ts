import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, OptimisticCommand, Store, StoreException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Abort when there is no internet');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Async action that aborts when there is no internet. The internet is simulated with `online`.
class Increment extends KissAction<State> {
  checkInternet = { abort: true };

  constructor(readonly online: boolean, readonly trace: string[] = []) { super(); }

  protected async hasInternet() { return this.online; }

  async reduce() {
    this.trace.push('reduce');
    return (state: State) => new State(state.count + 1);
  }

  after() {
    this.trace.push('after');
  }
}

Bdd(feature)
  .scenario('An action with checkInternet abort is aborted silently when there is no internet.')
  .given('An ASYNC action with checkInternet set to abort.')
  .and('There is no internet.')
  .when('The action is dispatched.')
  .then('The reduce method does not run, and the state does not change.')
  .and('The after method runs.')
  .and('The dispatch is aborted, and the action does not fail.')
  .and('No error is shown to the user.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.isFailed(Increment);
    const status = await store.dispatchAndWait(new Increment(false, trace));

    expect(trace).toEqual(['after']);
    expect(store.state.count).toBe(0);

    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(store.isFailed(Increment)).toBe(false);
    expect(store.userExceptionsQueue.length).toBe(0);
  });

Bdd(feature)
  .scenario('An action with checkInternet abort runs normally when there is internet.')
  .given('An ASYNC action with checkInternet set to abort.')
  .and('There is internet.')
  .when('The action is dispatched.')
  .then('The action runs, and changes the state.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const status = await store.dispatchAndWait(new Increment(true));

    expect(status.isCompletedOk).toBe(true);
    expect(status.isDispatchAborted).toBe(false);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Only one of dialog and abort can be used in checkInternet.')
  .given('An action whose checkInternet has both a dialog and abort.')
  .when('The action is dispatched.')
  .then('It throws a StoreException.')
  .example(val('dialog', true))
  .example(val('dialog', false))
  .run(async (ctx) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class Invalid extends KissAction<State> {
      checkInternet = { abort: true, dialog: ctx.example.val('dialog') as boolean };

      async reduce() { return null; }
    }

    expect(() => store.dispatch(new Invalid())).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('A sequential action aborted for having no internet releases the queue.')
  .given('An ASYNC sequential action with checkInternet set to abort.')
  .and('There is no internet.')
  .when('It is dispatched, followed by another sequential action.')
  .then('The first action is aborted, and the second action runs normally.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class SequentialIncrement extends Increment {
      sequential = true;
    }

    const first = new SequentialIncrement(false);
    store.dispatch(first);
    const status = await store.dispatchAndWait(new SequentialIncrement(true));

    expect(first.status.isDispatchAborted).toBe(true);
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('An OptimisticCommand with checkInternet abort does nothing when there is no internet.')
  .given('An OptimisticCommand with checkInternet set to abort.')
  .and('There is no internet.')
  .when('The command is dispatched.')
  .then('The optimistic value is not applied, and the command is not sent.')
  .and('The dispatch is aborted.')
  .run(async (_) => {
    let sent = 0;
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class SetCount extends OptimisticCommand<State, number> {
      checkInternet = { abort: true };

      protected async hasInternet() { return false; }

      optimisticValue() { return 10; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer(_value: number) {
        sent++;
        await delayMillis(1);
        return null;
      }
    }

    const status = await store.dispatchAndWait(new SetCount());

    expect(sent).toBe(0);
    expect(store.state.count).toBe(0);
    expect(status.isDispatchAborted).toBe(true);
  });
