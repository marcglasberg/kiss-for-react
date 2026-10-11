import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { AbortDispatchException, KissAction, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('AbortDispatchException in wrapError and errorObserver');

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return `State(${this.count})`;
  }
}

// Collects the unhandled rejections that happen while `fn` runs (and a bit after).
async function collectUnhandledRejections(fn: () => void): Promise<any[]> {
  const unhandled: any[] = [];
  const listener = (e: any) => unhandled.push(e);
  const old = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', listener);
  try {
    fn();
    await delayMillis(30);
  } finally {
    process.removeListener('unhandledRejection', listener);
    old.forEach(l => process.on('unhandledRejection', l as any));
  }
  return unhandled;
}

// A promise that only resolves when `open` is called. Used to choose when each action finishes.
class Gate {
  open!: () => void;
  readonly promise = new Promise<void>(resolve => this.open = resolve);
}

// Creates a store whose `errorObserver` records the errors it gets, and returns them unaltered,
// or returns what `observe` returns, if given. The `UserException`s shown to the user are
// recorded in `shown`.
function newStore(observed: any[], observe: ((error: any) => any) | null = null, shown: any[] = []): Store<State> {
  return new Store<State>({
    initialState: new State(0),
    logger: null,
    showUserException: (exception, _count, next) => {
      shown.push(exception);
      next();
    },
    errorObserver: ({error}) => {
      observed.push(error);
      return (observe === null) ? error : observe(error);
    },
  });
}

// Sync or async action that throws the given error, and whose `wrapError` records the errors it
// gets, and returns what `wrap` returns.
class FailingSync extends KissAction<State> {
  constructor(readonly error: any, readonly wrapped: any[], readonly wrap: (error: any) => any) {
    super();
  }

  reduce(): State {
    throw this.error;
  }

  wrapError(error: any): any {
    this.wrapped.push(error);
    return this.wrap(error);
  }
}

class FailingAsync extends KissAction<State> {
  constructor(readonly error: any, readonly wrapped: any[], readonly wrap: (error: any) => any) {
    super();
  }

  async before(): Promise<void> {
    await delayMillis(1);
    throw this.error;
  }

  async reduce(): Promise<(state: State) => State> {
    return (state: State) => new State(state.count + 1);
  }

  wrapError(error: any): any {
    this.wrapped.push(error);
    return this.wrap(error);
  }
}

function createAction(kind: string, error: any, wrapped: any[], wrap: (error: any) => any = e => e) {
  return (kind === 'sync') ? new FailingSync(error, wrapped, wrap) : new FailingAsync(error, wrapped, wrap);
}

// ---------------------------------------------------------------------------------------------
// An AbortDispatchException thrown by the action.

Bdd(feature)
  .scenario('A wrapError can turn an AbortDispatchException thrown by the action into another error.')
  .given('A <Action> action that throws an AbortDispatchException.')
  .and('Its wrapError turns it into a UserException.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The action is not aborted. It fails with the UserException instead.')
  .and('The UserException is shown to the user.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    // Given:
    const observed: any[] = [];
    const shown: any[] = [];
    const store = newStore(observed, null, shown);
    const wrapped: any[] = [];
    const abort = new AbortDispatchException();
    const userException = new UserException('Failed.');
    const action = createAction(ctx.example.val('Action'), abort, wrapped, () => userException);

    // When:
    const status = await store.dispatchAndWait(action);

    // Then:
    expect(wrapped).toEqual([abort]);
    expect(observed).toEqual([userException]);
    expect(status.isDispatchAborted).toBe(false);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBe(abort);
    expect(status.wrappedError).toBe(userException);
    expect(store.exceptionFor(action.constructor as any)).toBe(userException);
    expect(shown).toEqual([userException]);
  });

// ---------------------------------------------------------------------------------------------
// An AbortDispatchException returned by wrapError or the errorObserver.

Bdd(feature)
  .scenario('A wrapError that returns an AbortDispatchException aborts the action silently.')
  .given('A <Action> action that throws an error.')
  .and('Its wrapError returns an AbortDispatchException.')
  .and('A store with an errorObserver that returns the error it gets.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The errorObserver gets the AbortDispatchException.')
  .and('dispatchAndWait resolves, and the status says the dispatch was aborted.')
  .and('The action does not count as failed, and no error is shown to the user.')
  .and('The state is not changed.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    // Given:
    const observed: any[] = [];
    const shown: any[] = [];
    const store = newStore(observed, null, shown);
    const wrapped: any[] = [];
    const error = new Error('boom');
    const abort = new AbortDispatchException();
    const action = createAction(ctx.example.val('Action'), error, wrapped, () => abort);

    // When:
    let thrown: any = 'nothing thrown';
    const status = await store.dispatchAndWait(action).catch(e => {
      thrown = e;
      return action.status;
    });

    // Then:
    expect(thrown).toBe('nothing thrown');
    expect(wrapped).toEqual([error]);
    expect(observed).toEqual([abort]);
    expect(status.isDispatchAborted).toBe(true);
    expect(status.isCompletedOk).toBe(false);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBe(error);
    expect(status.wrappedError).toBeNull();
    expect(store.isFailed(action.constructor as any)).toBe(false);
    expect(shown).toEqual([]);
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('An errorObserver that returns an AbortDispatchException aborts the action silently.')
  .given('A <Action> action that throws an error, and has a wrapError that returns it unaltered.')
  .and('A store with an errorObserver that returns an AbortDispatchException.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves, and the status says the dispatch was aborted.')
  .and('The action does not count as failed, and no error is shown to the user.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    // Given:
    const observed: any[] = [];
    const abort = new AbortDispatchException();
    const shown: any[] = [];
    const store = newStore(observed, () => abort, shown);
    const error = new Error('boom');
    const action = createAction(ctx.example.val('Action'), error, []);

    // When:
    let thrown: any = 'nothing thrown';
    const status = await store.dispatchAndWait(action).catch(e => {
      thrown = e;
      return action.status;
    });

    // Then:
    expect(thrown).toBe('nothing thrown');
    expect(observed).toEqual([error]);
    expect(status.isDispatchAborted).toBe(true);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBe(error);
    expect(status.wrappedError).toBeNull();
    expect(store.isFailed(action.constructor as any)).toBe(false);
    expect(shown).toEqual([]);
  });

Bdd(feature)
  .scenario('An action whose wrapError returns an AbortDispatchException does not throw when dispatched with dispatch.')
  .given('A <Action> action that throws an error.')
  .and('Its wrapError returns an AbortDispatchException.')
  .when('The action is dispatched with dispatch, and nobody waits for it.')
  .then('dispatch does not throw, and there is no unhandled rejection.')
  .and('The status says the dispatch was aborted.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    // Given:
    const store = newStore([]);
    const action = createAction(ctx.example.val('Action'), new Error('boom'), [], () => new AbortDispatchException());

    // When:
    let thrown: any = 'nothing thrown';
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatch(action);
      } catch (e) {
        thrown = e;
      }
    });

    // Then:
    expect(thrown).toBe('nothing thrown');
    expect(unhandled).toEqual([]);
    expect(action.status.isDispatchAborted).toBe(true);
  });

// ---------------------------------------------------------------------------------------------
// The AbortDispatchExceptions created by Kiss itself.

// Turns all errors into a `UserException`, and records them.
function wrapAll(wrapped: any[], error: any): UserException {
  wrapped.push(error);
  return new UserException('Wrapped.').withHardCause(error);
}

// Aborts when there is no internet.
class NoInternet extends KissAction<State> {
  checkInternet = {abort: true};

  constructor(readonly wrapped: any[]) { super(); }

  protected async hasInternet() { return false; }

  async reduce() {
    return (state: State) => new State(state.count + 1);
  }

  wrapError(error: any) {
    return wrapAll(this.wrapped, error);
  }
}

// Sequential action that fails, and discards the actions waiting behind it. Its own error is
// swallowed, so that the errorObserver only gets the errors of the action being tested.
class FailAndDiscardQueue extends KissAction<State> {
  sequential = true;

  discardQueueOnError(_error: any) { return true; }

  async reduce(): Promise<null> {
    await delayMillis(10);
    throw new Error('Failed');
  }

  wrapError(_error: any): any {
    return null;
  }
}

// Sequential action, which waits in the queue behind `FailAndDiscardQueue`.
class Discarded extends FailAndDiscardQueue {
  constructor(readonly wrapped: any[]) { super(); }

  async reduce(): Promise<null> {
    return null;
  }

  wrapError(error: any) {
    return wrapAll(this.wrapped, error);
  }
}

// An `ignoreOld` action that, when its `gate` opens, returns a result, throws an error, or
// throws an `AbortDispatchException`.
class LoadOld extends KissAction<State> {
  ignoreOld = true;

  constructor(readonly outcome: string, readonly gate: Gate, readonly wrapped: any[]) { super(); }

  async reduce(): Promise<(state: State) => State> {
    await this.gate.promise;
    if (this.outcome === 'throws an error') throw new Error('boom');
    if (this.outcome === 'throws an AbortDispatchException') throw new AbortDispatchException();
    return (state: State) => new State(state.count + 1);
  }

  wrapError(error: any) {
    return wrapAll(this.wrapped, error);
  }
}

// Dispatches the action that Kiss aborts, and returns it.
async function dispatchAbortedByKiss(store: Store<State>, reason: string, wrapped: any[]): Promise<KissAction<State>> {
  switch (reason) {
    case 'there is no internet, with checkInternet abort': {
      const action = new NoInternet(wrapped);
      await store.dispatchAndWait(action);
      return action;
    }
    case 'it was discarded from its sequential queue': {
      const action = new Discarded(wrapped);
      store.dispatch(new FailAndDiscardQueue());
      await store.dispatchAndWait(action);
      return action;
    }
    default: {
      // An `ignoreOld` action that became old: a newer one finished first.
      const outcome = reason.replace('it is ignoreOld, became old, and ', '');
      const gate = new Gate();
      const action = new LoadOld(outcome, gate, wrapped);
      const promise = store.dispatchAndWait(action);
      const newer = new Gate();
      newer.open();
      await store.dispatchAndWait(new LoadOld('returns a result', newer, wrapped));
      gate.open();
      await promise;
      return action;
    }
  }
}

Bdd(feature)
  .scenario('The AbortDispatchExceptions created by Kiss itself are not given to wrapError or the errorObserver.')
  .given('An action that Kiss aborts, because <Reason>.')
  .and('Its wrapError turns all errors into a UserException.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched.')
  .then('The wrapError and the errorObserver are not called.')
  .and('The action is aborted silently, and no error is shown to the user.')
  .example(val('Reason', 'there is no internet, with checkInternet abort'))
  .example(val('Reason', 'it was discarded from its sequential queue'))
  .example(val('Reason', 'it is ignoreOld, became old, and returns a result'))
  .example(val('Reason', 'it is ignoreOld, became old, and throws an error'))
  .example(val('Reason', 'it is ignoreOld, became old, and throws an AbortDispatchException'))
  .run(async (ctx) => {
    // Given:
    const observed: any[] = [];
    const shown: any[] = [];
    const store = newStore(observed, null, shown);
    const wrapped: any[] = [];

    // When:
    const action = await dispatchAbortedByKiss(store, ctx.example.val('Reason'), wrapped);

    // Then:
    expect(wrapped).toEqual([]);
    expect(observed).toEqual([]);
    expect(action.status.isDispatchAborted).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(action.status.wrappedError).toBeNull();
    expect(shown).toEqual([]);
  });
