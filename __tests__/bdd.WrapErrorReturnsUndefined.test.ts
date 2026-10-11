import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('wrapError that returns undefined');

class State {
  constructor(readonly count: number) {
  }
}

// The examples hold the returned value as a string, since `undefined` can't be an example value.
function returnedValue(name: string): null | undefined {
  return (name === 'null') ? null : undefined;
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

class FailingSync extends KissAction<State> {
  constructor(readonly error: any, readonly returned: null | undefined) {
    super();
  }

  reduce(): State {
    throw this.error;
  }

  // Typed `any`, so that it compiles even when returning `undefined`, as in JavaScript.
  wrapError(_error: any): any {
    return this.returned;
  }
}

class FailingAsync extends KissAction<State> {
  constructor(readonly error: any, readonly returned: null | undefined) {
    super();
  }

  async reduce(): Promise<null> {
    await delayMillis(10);
    throw this.error;
  }

  // Typed `any`, so that it compiles even when returning `undefined`, as in JavaScript.
  wrapError(_error: any): any {
    return this.returned;
  }
}

function createAction(kind: string, error: any, returned: null | undefined): FailingSync | FailingAsync {
  return (kind === 'sync') ? new FailingSync(error, returned) : new FailingAsync(error, returned);
}

Bdd(feature)
  .scenario('A wrapError that returns undefined swallows the error, the same as returning null.')
  .given('A <Action> action that throws an error.')
  .and('Its wrapError returns <Returned>.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves with the action status, since the error was swallowed.')
  .and('The action status is "completed failed", since the reducer did not finish.')
  .and('The status has the original error, and no wrapped error.')
  .and('The action does not count as failed for isFailed and exceptionFor.')
  .and('The state is not changed.')
  .example(val('Action', 'sync'), val('Returned', 'null'))
  .example(val('Action', 'sync'), val('Returned', 'undefined'))
  .example(val('Action', 'async'), val('Returned', 'null'))
  .example(val('Action', 'async'), val('Returned', 'undefined'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});
    const error = new UserException('Failed.');
    const action = createAction(
      ctx.example.val('Action'), error, returnedValue(ctx.example.val('Returned')));

    // When:
    let thrown: any = 'nothing thrown';
    const status = await store.dispatchAndWait(action).catch(e => {
      thrown = e;
      return null;
    });

    // Then:
    expect(thrown).toBe('nothing thrown');
    expect(status).toBe(action.status);
    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(action.status.wrappedError).toBe(null);
    expect(store.isFailed(action.constructor as any)).toBe(false);
    expect(store.exceptionFor(action.constructor as any)).toBe(null);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A SYNC action whose wrapError returns undefined does not throw when dispatched with dispatch.')
  .given('A SYNC action that throws an error.')
  .and('Its wrapError returns undefined.')
  .when('The action is dispatched with dispatch.')
  .then('dispatch does not throw.')
  .and('The status has the original error, and no wrapped error.')
  .run(async (_) => {
    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});
    const error = new Error('boom');
    const action = new FailingSync(error, undefined);

    // When/Then:
    expect(() => store.dispatch(action)).not.toThrow();
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(action.status.wrappedError).toBe(null);
  });

Bdd(feature)
  .scenario('An ASYNC action whose wrapError returns undefined does not cause an unhandled rejection.')
  .given('An ASYNC action that throws an error.')
  .and('Its wrapError returns undefined.')
  .when('The action is dispatched with dispatch, and nobody waits for it.')
  .then('There is no unhandled rejection.')
  .and('The status has the original error, and no wrapped error.')
  .run(async (_) => {
    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});
    const error = new Error('boom');
    const action = new FailingAsync(error, undefined);

    // When:
    const unhandled = await collectUnhandledRejections(() => store.dispatch(action));

    // Then:
    expect(unhandled).toEqual([]);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(error);
    expect(action.status.wrappedError).toBe(null);
  });

Bdd(feature)
  .scenario('The errorObserver is not called when the action wrapError returns undefined.')
  .given('A <Action> action that throws an error, and has a wrapError that returns undefined.')
  .and('A store with an errorObserver that returns the error it gets.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The errorObserver is not called, the same as when wrapError returns null.')
  .and('dispatchAndWait resolves.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    // Given:
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: null,
      errorObserver: ({error}) => {
        observed.push(error);
        return error;
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('boom'), undefined);

    // When:
    const status = await store.dispatchAndWait(action);

    // Then:
    expect(observed.length).toBe(0);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.wrappedError).toBe(null);
  });

// Tells, at compile time, if `undefined` can be assigned to type `T`.
type AcceptsUndefined<T> = undefined extends T ? true : false;

// Tells, at compile time, if `null` can be assigned to type `T`.
type AcceptsNull<T> = null extends T ? true : false;

type WrapErrorReturn = ReturnType<KissAction<State>['wrapError']>;

Bdd(feature)
  .scenario('The type of wrapError does not allow returning undefined, but allows returning null.')
  .given('An action whose wrapError returns the error only for UserExceptions.')
  .and('For other errors it ends without a return, which returns undefined.')
  .when('The action is compiled.')
  .then('It does not compile, since wrapError may not return undefined.')
  .and('The type of wrapError allows returning null, or an error.')
  .and('If it still runs (for example, in JavaScript), the other errors are swallowed.')
  .and('The UserExceptions are not swallowed.')
  .run(async (_) => {
    // Given:
    class FallsThrough extends KissAction<State> {
      constructor(readonly error: any) {
        super();
      }

      reduce(): State {
        throw this.error;
      }

      // @ts-expect-error: wrapError may not return undefined.
      wrapError(error: any) {
        if (error instanceof UserException) return error;
      }
    }

    // When/Then (compile time): These lines only compile if the type is right.
    const acceptsUndefined: AcceptsUndefined<WrapErrorReturn> = false;
    const acceptsNull: AcceptsNull<WrapErrorReturn> = true;
    const acceptsError: WrapErrorReturn = new Error('error');
    expect(acceptsUndefined).toBe(false);
    expect(acceptsNull).toBe(true);
    expect(acceptsError).toBeInstanceOf(Error);

    // When/Then (run time): Cast to `any`, since the class doesn't compile, as if it was JavaScript.
    const store = new Store<State>({initialState: new State(1), logger: null});

    const swallowed: KissAction<State> = new FallsThrough(new Error('boom')) as any;
    const status = await store.dispatchAndWait(swallowed);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.wrappedError).toBe(null);

    const userException = new UserException('Failed.');
    const notSwallowed: KissAction<State> = new FallsThrough(userException) as any;
    await store.dispatchAndWait(notSwallowed);
    expect(notSwallowed.status.wrappedError).toBe(userException);
    expect(store.exceptionFor(FallsThrough as any)).toBe(userException);
  });
