import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, OptimisticCommand, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('AbortDispatchException');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Async action that aborts from its async `before`, after an async check.
class AbortInBefore extends KissAction<State> {
  constructor(readonly trace: string[]) { super(); }

  async before() {
    this.trace.push('before');
    await delayMillis(1);
    throw new AbortDispatchException();
  }

  async reduce() {
    this.trace.push('reduce');
    return (state: State) => new State(state.count + 1);
  }

  after() {
    this.trace.push('after');
  }
}

// Sync action that aborts from its `reduce`.
class AbortInSyncReduce extends KissAction<State> {
  reduce(): State {
    throw new AbortDispatchException();
  }
}

Bdd(feature)
  .scenario('An action that throws an AbortDispatchException from its before method is aborted.')
  .given('An ASYNC action whose before method throws an AbortDispatchException after an async check.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The reduce method does not run, and the state does not change.')
  .and('The after method runs.')
  .and('The dispatchAndWait resolves with a status that says the dispatch was aborted.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const status = await store.dispatchAndWait(new AbortInBefore(trace));

    expect(trace).toEqual(['before', 'after']);
    expect(store.state.count).toBe(0);

    expect(status.isDispatched).toBe(true);
    expect(status.isDispatchAborted).toBe(true);
    expect(status.isCompleted).toBe(true);
    expect(status.isCompletedOk).toBe(false);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(status.wrappedError).toBeNull();
  });

Bdd(feature)
  .scenario('A sync action that throws an AbortDispatchException from its reduce method is aborted silently.')
  .given('A SYNC action whose reduce method throws an AbortDispatchException.')
  .when('The action is dispatched with dispatch and with dispatchSync.')
  .then('No error is thrown.')
  .and('The action status says the dispatch was aborted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const action1 = new AbortInSyncReduce();
    const action2 = new AbortInSyncReduce();
    expect(() => store.dispatch(action1)).not.toThrow();
    expect(() => store.dispatchSync(action2)).not.toThrow();

    expect(action1.status.isDispatchAborted).toBe(true);
    expect(action2.status.isDispatchAborted).toBe(true);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('An AbortDispatchException is not processed as an error.')
  .given('A store with an errorObserver.')
  .and('An action with a wrapError, that throws an AbortDispatchException.')
  .when('The action is dispatched.')
  .then('The wrapError and the errorObserver are not called.')
  .and('The action does not count as failed, and no error is shown to the user.')
  .run(async (_) => {
    const calls: string[] = [];
    const store = new Store<State>({
      initialState: new State(0),
      logger: logger,
      errorObserver: ({ error }) => {
        calls.push('errorObserver');
        return error;
      },
    });

    class AbortWithWrapError extends KissAction<State> {
      async reduce(): Promise<null> {
        await delayMillis(1);
        throw new AbortDispatchException();
      }

      wrapError(error: any) {
        calls.push('wrapError');
        return error;
      }
    }

    store.isFailed(AbortWithWrapError);
    const status = await store.dispatchAndWait(new AbortWithWrapError());

    expect(status.isDispatchAborted).toBe(true);
    expect(calls).toEqual([]);
    expect(store.isFailed(AbortWithWrapError)).toBe(false);
    expect(store.exceptionFor(AbortWithWrapError)).toBeNull();
    expect(store.userExceptionsQueue.length).toBe(0);
  });

Bdd(feature)
  .scenario('An action with retry is not retried when it throws an AbortDispatchException.')
  .given('An ASYNC action with retry, whose reduce method throws an AbortDispatchException.')
  .when('The action is dispatched.')
  .then('The reduce method runs only once.')
  .and('The dispatch is aborted.')
  .run(async (_) => {
    let attempts = 0;
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AbortWithRetry extends KissAction<State> {
      retry = { initialDelay: 10, maxRetries: 3 };

      async reduce(): Promise<null> {
        attempts++;
        await delayMillis(1);
        throw new AbortDispatchException();
      }
    }

    const status = await store.dispatchAndWait(new AbortWithRetry());

    expect(attempts).toBe(1);
    expect(status.isDispatchAborted).toBe(true);
  });

Bdd(feature)
  .scenario('An OptimisticCommand is not retried when its command throws an AbortDispatchException.')
  .given('An OptimisticCommand with retry, whose sendCommandToServer throws an AbortDispatchException.')
  .when('The command is dispatched.')
  .then('The command is sent only once.')
  .and('The optimistic value is rolled back.')
  .and('The dispatch is aborted.')
  .run(async (_) => {
    let sent = 0;
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class SetCount extends OptimisticCommand<State, number> {
      retry = { initialDelay: 10, maxRetries: 3 };

      optimisticValue() { return 10; }

      getValueFromState(state: State) { return state.count; }

      applyValueToState(_state: State, value: number) { return new State(value); }

      async sendCommandToServer(_value: number) {
        sent++;
        await delayMillis(1);
        throw new AbortDispatchException();
      }
    }

    const status = await store.dispatchAndWait(new SetCount());

    expect(sent).toBe(1);
    expect(store.state.count).toBe(0);
    expect(status.isDispatchAborted).toBe(true);
  });

Bdd(feature)
  .scenario('An action that throws an AbortDispatchException does not keep its data fresh.')
  .given('An ASYNC action with fresh, whose before method throws an AbortDispatchException.')
  .when('The action is dispatched, and then dispatched again within the fresh period, without aborting.')
  .then('The second dispatch runs.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class LoadFresh extends KissAction<State> {
      fresh = 5000;

      constructor(readonly abort: boolean) { super(); }

      before() {
        if (this.abort) throw new AbortDispatchException();
      }

      async reduce() {
        return (state: State) => new State(state.count + 1);
      }
    }

    const status1 = await store.dispatchAndWait(new LoadFresh(true));
    const status2 = await store.dispatchAndWait(new LoadFresh(false));

    expect(status1.isDispatchAborted).toBe(true);
    expect(status2.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A dispatch aborted before running also says it was aborted.')
  .given('Actions whose dispatch is aborted before they run.')
  .and('They are aborted by abortDispatch, nonReentrant, throttle, fresh, a null mock, and a shut down store.')
  .when('The actions are dispatched with dispatchAndWait.')
  .then('The returned status says the dispatch was aborted, and the action was not dispatched.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AbortDispatch extends KissAction<State> {
      abortDispatch() { return true; }

      reduce() { return null; }
    }

    class Slow extends KissAction<State> {
      nonReentrant = true;

      async reduce() {
        await delayMillis(20);
        return null;
      }
    }

    class Throttled extends KissAction<State> {
      throttle = 5000;

      reduce() { return null; }
    }

    class Fresh extends KissAction<State> {
      fresh = 5000;

      reduce() { return null; }
    }

    class Mocked extends KissAction<State> {
      reduce() { return null; }
    }

    const statuses = [];

    statuses.push(await store.dispatchAndWait(new AbortDispatch()));

    store.dispatch(new Slow());
    statuses.push(await store.dispatchAndWait(new Slow()));

    await store.dispatchAndWait(new Throttled());
    statuses.push(await store.dispatchAndWait(new Throttled()));

    await store.dispatchAndWait(new Fresh());
    statuses.push(await store.dispatchAndWait(new Fresh()));

    store.mocks.add(Mocked, null);
    statuses.push(await store.dispatchAndWait(new Mocked()));
    store.mocks.clear();

    store.setShutDown(true);
    statuses.push(await store.dispatchAndWait(new Mocked()));
    store.setShutDown(false);

    expect(statuses.length).toBe(6);
    for (const status of statuses) {
      expect(status.isDispatchAborted).toBe(true);
      expect(status.isDispatched).toBe(false);
    }
  });

Bdd(feature)
  .scenario('A dispatch that is not aborted does not say it was aborted.')
  .given('An action that succeeds, and an action that fails with a UserException.')
  .when('The actions are dispatched with dispatchAndWait.')
  .then('Their status does not say the dispatch was aborted.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class Succeeds extends KissAction<State> {
      reduce() { return new State(1); }
    }

    class Fails extends KissAction<State> {
      reduce(): State { throw new UserException('Failed'); }
    }

    const status1 = await store.dispatchAndWait(new Succeeds());
    const status2 = await store.dispatchAndWait(new Fails());

    expect(status1.isDispatchAborted).toBe(false);
    expect(status2.isCompletedFailed).toBe(true);
    expect(status2.isDispatchAborted).toBe(false);
  });
