import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, Store, StoreException, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('Sequential');
const logger = (_obj: any) => {};

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Sequential async action that adds `value` to the count, logging when it starts and ends.
class Add extends KissAction<State> {
  sequential = true;

  constructor(readonly value: number, readonly trace: string[], readonly millis = 10) { super(); }

  async reduce() {
    this.trace.push(`start ${this.value}`);
    await delayMillis(this.millis);
    this.trace.push(`end ${this.value}`);
    return (state: State) => new State(state.count + this.value);
  }
}

// Another sequential action class, with the same behavior as `Add`.
class AddOther extends Add {
}

// Sequential async action that fails with a `UserException`.
class Fail extends KissAction<State> {
  sequential = true;

  constructor(readonly trace: string[], readonly discard = false) { super(); }

  discardQueueOnError(_error: any) { return this.discard; }

  async reduce(): Promise<(state: State) => State> {
    this.trace.push('start fail');
    await delayMillis(10);
    this.trace.push('end fail');
    throw new UserException('Failed');
  }
}

// Sequential async action with a queue per `user`.
class SaveUser extends KissAction<State> {
  sequential = true;

  constructor(readonly user: string, readonly trace: string[]) { super(); }

  sequentialKeyParams(): any { return this.user; }

  async reduce() {
    this.trace.push(`start ${this.user}`);
    await delayMillis(10);
    this.trace.push(`end ${this.user}`);
    return null;
  }
}

Bdd(feature)
  .scenario('Sequential actions run one at a time, in the order they were dispatched.')
  .given('An ASYNC sequential action.')
  .when('The action is dispatched 3 times in quick succession.')
  .then('Each action only starts after the previous one finished.')
  .and('All the actions run, in the dispatch order.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    // The first action is slower, so it would finish last if they ran in parallel.
    store.dispatch(new Add(1, trace, 30));
    store.dispatch(new Add(10, trace));
    store.dispatch(new Add(100, trace));
    await store.waitAllActions([]);

    expect(trace).toEqual(['start 1', 'end 1', 'start 10', 'end 10', 'start 100', 'end 100']);
    expect(store.state.count).toBe(111);
  });

Bdd(feature)
  .scenario('Sequential actions of different classes share the same queue by default.')
  .given('Two different ASYNC sequential action classes.')
  .when('Actions of both classes are dispatched in quick succession.')
  .then('They run one at a time, in the dispatch order.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new Add(1, trace, 30));
    store.dispatch(new AddOther(10, trace));
    store.dispatch(new Add(100, trace));
    await store.waitAllActions([]);

    expect(trace).toEqual(['start 1', 'end 1', 'start 10', 'end 10', 'start 100', 'end 100']);
  });

Bdd(feature)
  .scenario('Sequential actions with different keys run in parallel.')
  .given('An ASYNC sequential action, with a queue per user.')
  .when('Actions for users "A", "B" and "A" are dispatched in quick succession.')
  .then('The actions of user "A" run one at a time.')
  .and('The action of user "B" runs in parallel with the first action of user "A".')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    store.dispatch(new SaveUser('A', trace));
    store.dispatch(new SaveUser('B', trace));
    store.dispatch(new SaveUser('A', trace));
    await store.waitAllActions([]);

    expect(trace.slice(0, 2)).toEqual(['start A', 'start B']);
    expect(trace.indexOf('end A')).toBeLessThan(trace.lastIndexOf('start A'));
    expect(trace.filter(t => t === 'start A').length).toBe(2);
  });

Bdd(feature)
  .scenario('Keys that are arrays or plain objects are compared by their contents.')
  .given('An ASYNC sequential action, whose key is an array with the user.')
  .when('Two actions for the same user are dispatched in quick succession.')
  .then('They run one at a time.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class SaveUserArrayKey extends SaveUser {
      sequentialKeyParams() { return [this.user]; }
    }

    store.dispatch(new SaveUserArrayKey('A', trace));
    store.dispatch(new SaveUserArrayKey('A', trace));
    await store.waitAllActions([]);

    expect(trace).toEqual(['start A', 'end A', 'start A', 'end A']);
  });

Bdd(feature)
  .scenario('Sequential actions are always ASYNC, even when their reducer is SYNC.')
  .given('A sequential action with a SYNC reducer.')
  .when('The action is dispatched.')
  .then('The state does not change right away.')
  .and('The state changes after the action finishes.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AddSync extends KissAction<State> {
      sequential = true;

      reduce() { return new State(this.state.count + 1); }
    }

    const promise = store.dispatchAndWait(new AddSync());
    expect(store.state.count).toBe(0);

    await promise;
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A sequential action cannot be dispatched with dispatchSync.')
  .given('A sequential action with a SYNC reducer.')
  .when('The action is dispatched with dispatchSync.')
  .then('It throws a StoreException.')
  .and('The queue is not blocked by it.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AddSync extends KissAction<State> {
      sequential = true;

      reduce() { return new State(this.state.count + 1); }
    }

    expect(() => store.dispatchSync(new AddSync())).toThrow(StoreException);
    expect(store.state.count).toBe(0);

    await store.dispatchAndWait(new Add(10, trace));
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('A sequential action cannot be combined with debounce.')
  .given('A sequential action that also uses debounce.')
  .when('The action is dispatched.')
  .then('It throws a StoreException.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class SequentialDebounce extends KissAction<State> {
      sequential = true;
      debounce = 100;

      async reduce() { return null; }
    }

    expect(() => store.dispatch(new SequentialDebounce())).toThrow(StoreException);
  });

Bdd(feature)
  .scenario('The before method of a sequential action only runs when it gets its turn.')
  .given('Two ASYNC sequential actions, which log when their before, reduce and after methods run.')
  .when('Both actions are dispatched in quick succession.')
  .then('The before, reduce and after methods of the second action run after the first action finished.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class WithLifecycle extends KissAction<State> {
      sequential = true;

      constructor(readonly name: string) { super(); }

      before() { trace.push(`before ${this.name}`); }

      async reduce() {
        trace.push(`reduce ${this.name}`);
        await delayMillis(10);
        return null;
      }

      after() { trace.push(`after ${this.name}`); }
    }

    store.dispatch(new WithLifecycle('1'));
    store.dispatch(new WithLifecycle('2'));
    await store.waitAllActions([]);

    expect(trace).toEqual(['before 1', 'reduce 1', 'after 1', 'before 2', 'reduce 2', 'after 2']);
  });

Bdd(feature)
  .scenario('The next sequential action runs even if the previous one failed.')
  .given('An ASYNC sequential action that fails, with the default discardQueueOnError.')
  .when('It is dispatched, followed by another sequential action.')
  .then('The second action runs after the first one fails.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    const fail = new Fail(trace);
    store.dispatch(fail);
    const status = await store.dispatchAndWait(new Add(10, trace));

    expect(fail.status.isCompletedFailed).toBe(true);
    expect(status.isCompletedOk).toBe(true);
    expect(trace).toEqual(['start fail', 'end fail', 'start 10', 'end 10']);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('A failed sequential action can discard the actions waiting behind it.')
  .given('An ASYNC sequential action that fails, and whose discardQueueOnError returns true.')
  .and('Two other sequential actions waiting behind it.')
  .when('The first action fails.')
  .then('The waiting actions are discarded, without running before or reduce.')
  .and('Their after method runs.')
  .and('They finish silently, with an AbortDispatchException, and their dispatch is aborted.')
  .and('They know they were discarded.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AddWithAfter extends Add {
      before() { trace.push(`before ${this.value}`); }

      after() { trace.push(`after ${this.value}`); }
    }

    const fail = new Fail(trace, true);
    const add1 = new AddWithAfter(1, trace);
    const add2 = new AddWithAfter(10, trace);

    store.dispatch(fail);
    const promise1 = store.dispatchAndWait(add1);
    const promise2 = store.dispatchAndWait(add2);

    const status1 = await promise1;
    const status2 = await promise2;

    expect(trace).toEqual(['start fail', 'end fail', 'after 1', 'after 10']);
    expect(store.state.count).toBe(0);

    expect(fail.wasDiscardedFromSequentialQueue).toBe(false);
    expect(add1.wasDiscardedFromSequentialQueue).toBe(true);
    expect(add2.wasDiscardedFromSequentialQueue).toBe(true);

    expect(status1.isDispatched).toBe(true);
    expect(status1.isDispatchAborted).toBe(true);
    expect(status1.isCompletedOk).toBe(false);
    expect(status1.originalError).toBeInstanceOf(AbortDispatchException);
    expect(status2.isDispatchAborted).toBe(true);

    expect(store.isFailed(AddWithAfter)).toBe(false);

    expect(store.isWaiting(AddWithAfter)).toBe(false);
  });

Bdd(feature)
  .scenario('Actions dispatched after a failure that discarded the queue are not affected.')
  .given('An ASYNC sequential action that fails, and whose discardQueueOnError returns true.')
  .when('The action fails.')
  .and('Another sequential action is dispatched afterwards.')
  .then('The new action runs normally.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    await store.dispatchAndWait(new Fail(trace, true));
    const add = new Add(10, trace);
    const status = await store.dispatchAndWait(add);

    expect(status.isCompletedOk).toBe(true);
    expect(add.wasDiscardedFromSequentialQueue).toBe(false);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('Discarding the queue only affects the queue with the same key.')
  .given('Sequential actions with a queue per user.')
  .and('An action of user "A" that fails and discards its queue.')
  .when('Other actions of users "A" and "B" are waiting.')
  .then('Only the waiting action of user "A" is discarded.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class FailUser extends SaveUser {
      discardQueueOnError(_error: any) { return true; }

      async reduce(): Promise<null> {
        await delayMillis(10);
        throw new UserException('Failed');
      }
    }

    const saveB1 = new SaveUser('B', trace);
    const saveA = new SaveUser('A', trace);
    const saveB2 = new SaveUser('B', trace);

    store.dispatch(new FailUser('A', trace));
    store.dispatch(saveB1);
    store.dispatch(saveA);
    store.dispatch(saveB2);
    await store.waitAllActions([]);

    expect(saveA.wasDiscardedFromSequentialQueue).toBe(true);
    expect(saveB1.status.isCompletedOk).toBe(true);
    expect(saveB2.status.isCompletedOk).toBe(true);
    expect(trace).toEqual(['start B', 'end B', 'start B', 'end B']);
  });

Bdd(feature)
  .scenario('discardQueueOnError receives the original error.')
  .given('An ASYNC sequential action that fails with a UserException.')
  .and('Its discardQueueOnError only discards the queue for errors that are not UserExceptions.')
  .when('The action fails, while another sequential action is waiting.')
  .then('discardQueueOnError gets the UserException.')
  .and('The waiting action runs.')
  .run(async (_) => {
    const trace: string[] = [];
    const errors: any[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class FailKeepQueue extends Fail {
      discardQueueOnError(error: any) {
        errors.push(error);
        return !(error instanceof UserException);
      }
    }

    store.dispatch(new FailKeepQueue(trace));
    await store.dispatchAndWait(new Add(10, trace));

    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(UserException);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('If discardQueueOnError throws, the queue continues.')
  .given('An ASYNC sequential action that fails, and whose discardQueueOnError throws an error.')
  .when('The action fails, while another sequential action is waiting.')
  .then('The waiting action runs.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class FailThrows extends Fail {
      discardQueueOnError(_error: any): boolean { throw new Error('Oops'); }
    }

    store.dispatch(new FailThrows(trace));
    const status = await store.dispatchAndWait(new Add(10, trace));

    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('Sequential actions waiting in the queue count as in progress.')
  .given('Two ASYNC sequential actions.')
  .when('Both are dispatched in quick succession.')
  .then('While the second action waits for its turn, it is waiting in the queue, and in progress.')
  .and('When it gets its turn, it is no longer waiting in the queue, but still in progress.')
  .and('After it finishes, it is no longer in progress.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    let finish!: () => void;
    const finished = new Promise<void>(resolve => finish = resolve);

    class Second extends KissAction<State> {
      sequential = true;

      async reduce() {
        await finished;
        return null;
      }
    }

    const first = new Add(1, trace, 30);
    const second = new Second();

    expect(second.isWaitingInSequentialQueue).toBe(false);

    store.dispatch(first);
    store.dispatch(second);

    expect(first.isWaitingInSequentialQueue).toBe(false);
    expect(second.isWaitingInSequentialQueue).toBe(true);
    expect(store.isWaiting(Second)).toBe(true);

    await store.waitAnyActionTypeFinishes([Add]);
    await delayMillis(1);

    expect(second.isWaitingInSequentialQueue).toBe(false);
    expect(store.isWaiting(Second)).toBe(true);

    finish();
    await store.waitAllActions([]);

    expect(store.isWaiting(Second)).toBe(false);
  });

Bdd(feature)
  .scenario('An aborted dispatch does not enter the queue.')
  .given('An ASYNC sequential action whose abortDispatch returns true.')
  .when('It is dispatched, followed by another sequential action.')
  .then('The aborted action does not block the queue.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class Aborted extends Add {
      abortDispatch() { return true; }
    }

    store.dispatch(new Aborted(1, trace));
    await store.dispatchAndWait(new Add(10, trace));

    expect(trace).toEqual(['start 10', 'end 10']);
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('A sequential and non-reentrant action drops duplicates while queued or running.')
  .given('An ASYNC action that is both sequential and non-reentrant.')
  .and('Another sequential action that is running.')
  .when('The non-reentrant action is dispatched twice, while the first one waits in the queue.')
  .then('The second dispatch is aborted.')
  .and('The first one runs after the running action.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AddNonReentrant extends Add {
      nonReentrant = true;
    }

    store.dispatch(new Add(1, trace));
    store.dispatch(new AddNonReentrant(10, trace));
    store.dispatch(new AddNonReentrant(100, trace));
    await store.waitAllActions([]);

    expect(trace).toEqual(['start 1', 'end 1', 'start 10', 'end 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('A sequential action that retries holds the queue while retrying.')
  .given('An ASYNC sequential action with retry, that fails the first time.')
  .when('It is dispatched, followed by another sequential action.')
  .then('The second action only runs after the retry succeeds.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class Flaky extends KissAction<State> {
      sequential = true;
      retry = { initialDelay: 10, maxRetries: 3 };

      async reduce() {
        trace.push(`attempt ${this.attempts}`);
        await delayMillis(1);
        if (this.attempts === 0) throw new Error('Flaky');
        return (state: State) => new State(state.count + 1);
      }
    }

    store.dispatch(new Flaky());
    await store.dispatchAndWait(new Add(10, trace));

    expect(trace).toEqual(['attempt 0', 'attempt 1', 'start 10', 'end 10']);
    expect(store.state.count).toBe(11);
  });

Bdd(feature)
  .scenario('A fresh action discarded from the queue does not keep its key fresh.')
  .given('An ASYNC sequential action with fresh.')
  .and('It waits in the queue behind an action that fails and discards the queue.')
  .when('It is discarded.')
  .then('Dispatching it again runs it, since its data was never loaded.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class AddFresh extends Add {
      fresh = 5000;
    }

    store.dispatch(new Fail(trace, true));
    const discarded = new AddFresh(1, trace);
    await store.dispatchAndWait(discarded);
    expect(discarded.wasDiscardedFromSequentialQueue).toBe(true);

    await store.dispatchAndWait(new AddFresh(10, trace));
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('A sequential action that aborts releases the queue.')
  .given('An ASYNC sequential action that throws an AbortDispatchException.')
  .and('Its discardQueueOnError discards the queue, except for an AbortDispatchException.')
  .when('It is dispatched, followed by another sequential action.')
  .then('discardQueueOnError gets the AbortDispatchException.')
  .and('The second action runs normally.')
  .run(async (_) => {
    const trace: string[] = [];
    const errors: any[] = [];
    const store = new Store<State>({ initialState: new State(0), logger: logger });

    class Aborts extends KissAction<State> {
      sequential = true;

      discardQueueOnError(error: any) {
        errors.push(error);
        return !(error instanceof AbortDispatchException);
      }

      async before() {
        await delayMillis(10);
        throw new AbortDispatchException();
      }

      reduce() { return null; }
    }

    const aborts = new Aborts();
    store.dispatch(aborts);
    const status = await store.dispatchAndWait(new Add(10, trace));

    expect(aborts.status.isDispatchAborted).toBe(true);
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(AbortDispatchException);
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.count).toBe(10);
  });
