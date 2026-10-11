import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('dispatchSync of an async action');

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

Bdd(feature)
  .scenario('dispatchSync of an action with an async reducer that fails throws, and the error does not go unhandled.')
  .given('An action whose async reducer fails.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('There is no unhandled rejection.')
  .and('The reducer error is logged.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        throw new Error('async reduce boom');
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(StoreException);
    expect(unhandled).toEqual([]);
    expect(logs.some(l => String(l).includes('async reduce boom'))).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async before that fails throws, and the error does not go unhandled.')
  .given('An action whose async before method fails.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('There is no unhandled rejection.')
  .and('The before error is logged.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});

    class A extends KissAction<number> {
      async before(): Promise<void> {
        throw new Error('async before boom');
      }

      reduce() {
        return 1;
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeInstanceOf(StoreException);
    expect(unhandled).toEqual([]);
    expect(logs.some(l => String(l).includes('async before boom'))).toBe(true);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async reducer that succeeds does not change the state.')
  .given('An action whose async reducer finishes and returns a new state.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The state stays the same, even after the async reducer finishes.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        await delayMillis(5);
        return (s) => s + 1;
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    await delayMillis(30);
    expect(store.state).toBe(0);
  });

Bdd(feature)
  .scenario('dispatchSync of an action with an async before that succeeds does not run the reducer.')
  .given('An action whose async before method finishes successfully.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The reducer never runs, and the state stays the same.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});
    let reduceCalled = false;

    class A extends KissAction<number> {
      async before(): Promise<void> {
        await delayMillis(5);
      }

      reduce() {
        reduceCalled = true;
        return 1;
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    await delayMillis(30);
    expect(reduceCalled).toBe(false);
    expect(store.state).toBe(0);
  });

// An action that is ASYNC for the given reason.
function asyncAction(reason: string): KissAction<number> {
  switch (reason) {
    case 'reduce returns a Promise':
      return new class AsyncReduce extends KissAction<number> {
        async reduce(): Promise<(s: number) => number> {
          return (s) => s + 1;
        }
      }();
    case 'before returns a Promise':
      return new class AsyncBefore extends KissAction<number> {
        async before(): Promise<void> {
        }

        reduce() {
          return this.state + 1;
        }
      }();
    case 'debounce':
      return new class Debounced extends KissAction<number> {
        debounce = 50;

        reduce() {
          return this.state + 1;
        }
      }();
    case 'sequential':
      return new class Sequential extends KissAction<number> {
        sequential = true;

        reduce() {
          return this.state + 1;
        }
      }();
    default:
      throw new Error(reason);
  }
}

Bdd(feature)
  .scenario('dispatchSync of an async action throws, even if the errorObserver swallows errors.')
  .given('An errorObserver that swallows all errors.')
  .and('An action that is ASYNC.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The errorObserver is not called.')
  .example(val('Async because', 'reduce returns a Promise'))
  .example(val('Async because', 'before returns a Promise'))
  .example(val('Async because', 'debounce'))
  .example(val('Async because', 'sequential'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      errorObserver: ({error}) => {
        observed.push(error);
        return null;
      },
    });

    const action = asyncAction(ctx.example.val('Async because'));

    expect(() => store.dispatchSync(action)).toThrow(StoreException);
    expect(observed).toEqual([]);
    await delayMillis(80);
  });

Bdd(feature)
  .scenario('dispatchSync of an async action throws, even if wrapError converts errors to UserException.')
  .given('An action with an async reducer.')
  .and('Its wrapError converts all errors to UserException.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The action is not failed.')
  .and('No UserException is shown to the user.')
  .run(async (_) => {
    const shown: UserException[] = [];
    const store = new Store<number>({initialState: 0, logger: null, showUserException: (e) => shown.push(e)});

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        return (s) => s + 1;
      }

      wrapError(error: any) {
        return new UserException('Something went wrong.').withHardCause(error);
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    expect(store.isFailed(A)).toBe(false);
    expect(store.exceptionFor(A)).toBeNull();
    expect(shown).toEqual([]);
  });

Bdd(feature)
  .scenario('dispatchSync of an async action throws its own error, even if the errorObserver converts errors.')
  .given('An errorObserver that converts all errors to another error.')
  .and('An action with an async reducer.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws the StoreException, not the converted error.')
  .and('No UserException is shown to the user.')
  .example(val('Converts to', 'UserException'))
  .example(val('Converts to', 'Error'))
  .run(async (ctx) => {
    const convertTo = ctx.example.val('Converts to');
    const shown: UserException[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      showUserException: (e) => shown.push(e),
      errorObserver: () => (convertTo === 'UserException')
        ? new UserException('Something went wrong.')
        : new Error('converted'),
    });

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        return (s) => s + 1;
      }
    }

    let thrown: any;
    try {
      store.dispatchSync(new A());
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(StoreException);
    expect(store.isFailed(A)).toBe(false);
    expect(shown).toEqual([]);
  });

Bdd(feature)
  .scenario('When dispatchSync throws for an async action, the action still finishes.')
  .given('An errorObserver that swallows all errors.')
  .and('An action with an async reducer.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The action\'s after method runs.')
  .and('The action is completed, and failed with that StoreException.')
  .and('The action is no longer in progress.')
  .and('The actionObserver is told the action ended.')
  .run(async (_) => {
    const observed: [string, boolean][] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      errorObserver: () => null,
      actionObserver: (action, _count, ini) => observed.push([action.constructor.name, ini]),
    });

    let afterRan = false;

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        return (s) => s + 1;
      }

      after() {
        afterRan = true;
      }
    }

    const action = new A();
    let thrown: any;
    try {
      store.dispatchSync(action);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(StoreException);
    expect(afterRan).toBe(true);
    expect(action.status.isCompleted).toBe(true);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(thrown);
    expect(action.status.wrappedError).toBe(thrown);
    expect(store.isWaiting(A)).toBe(false);
    expect(observed).toEqual([['A', true], ['A', false]]);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an action with retry, its reducer is not retried.')
  .given('An action with retry, whose async reducer always fails.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The reducer runs only once, and is not retried.')
  .and('The reducer error is logged.')
  .and('There is no unhandled rejection.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});
    let count = 0;

    class A extends KissAction<number> {
      retry = {initialDelay: 1, maxRetries: 3};

      async reduce(): Promise<(s: number) => number> {
        count++;
        throw new Error('retry boom');
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });
    await delayMillis(70);

    expect(thrown).toBeInstanceOf(StoreException);
    expect(count).toBe(1);
    expect(logs.some(l => String(l).includes('retry boom'))).toBe(true);
    expect(unhandled).toEqual([]);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an action with unlimitedRetryCheckInternet, its reducer never runs.')
  .given('An action with unlimitedRetryCheckInternet, which checks the internet before running its reducer.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The internet is checked only once, and the reducer never runs.')
  .and('There is no unhandled rejection.')
  .example(val('Internet', 'on'))
  .example(val('Internet', 'off'))
  .run(async (ctx) => {
    const isOnline = ctx.example.val('Internet') === 'on';
    const store = new Store<number>({initialState: 0, logger: null});
    let checks = 0;
    let count = 0;

    class A extends KissAction<number> {
      unlimitedRetryCheckInternet = {maxDelayNoInternet: 5};

      protected hasInternet(): Promise<boolean> {
        checks++;
        return Promise.resolve(isOnline);
      }

      async reduce(): Promise<(s: number) => number> {
        count++;
        return (s) => s + 1;
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });
    await delayMillis(70);

    expect(thrown).toBeInstanceOf(StoreException);
    expect(checks).toBe(1);
    expect(count).toBe(0);
    expect(store.state).toBe(0);
    expect(unhandled).toEqual([]);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an optimistic command with retry, its server call is not retried.')
  .given('An optimistic command with retry, whose server call always fails.')
  .when('The command is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The server call runs only once, and is not retried.')
  .and('There is no unhandled rejection.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});
    let calls = 0;

    class Save extends OptimisticCommand<number, number> {
      retry = {initialDelay: 1, maxRetries: 3};

      optimisticValue() {
        return 1;
      }

      getValueFromState(state: number) {
        return state;
      }

      applyValueToState(_state: number, value: number) {
        return value;
      }

      async sendCommandToServer(_value: number) {
        calls++;
        throw new UserException('Command failed.');
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new Save());
      } catch (e) {
        thrown = e;
      }
    });
    await delayMillis(70);

    expect(thrown).toBeInstanceOf(StoreException);
    expect(calls).toBe(1);
    expect(unhandled).toEqual([]);
  });

Bdd(feature)
  .scenario('dispatchSync of an async action throws, even if wrapError converts errors, whatever makes the action async.')
  .given('An action that is ASYNC.')
  .and('Its wrapError converts all errors to UserException.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The action is not failed.')
  .and('No UserException is shown to the user.')
  .example(val('Async because', 'reduce returns a Promise'))
  .example(val('Async because', 'before returns a Promise'))
  .example(val('Async because', 'debounce'))
  .example(val('Async because', 'sequential'))
  .run(async (ctx) => {
    const shown: UserException[] = [];
    const store = new Store<number>({initialState: 0, logger: null, showUserException: (e) => shown.push(e)});
    const action = asyncAction(ctx.example.val('Async because'));
    // The brackets give access to the protected `wrapError`.
    action['wrapError'] = (error: any) => new UserException('Something went wrong.').withHardCause(error);
    const type = action.constructor as new () => KissAction<number>;

    expect(() => store.dispatchSync(action)).toThrow(StoreException);
    expect(store.isFailed(type)).toBe(false);
    expect(shown).toEqual([]);
    await delayMillis(80);
  });

Bdd(feature)
  .scenario('dispatchSync of a SYNC action that fails still uses wrapError and the errorObserver.')
  .given('A SYNC action whose reducer fails.')
  .and('{Who} the error.')
  .when('The action is dispatched with dispatchSync.')
  .then('The error is {Result}.')
  .example(val('Who', 'The errorObserver swallows'), val('Result', 'swallowed, and dispatchSync does not throw'))
  .example(val('Who', 'wrapError converts to UserException'), val('Result', 'shown to the user, and dispatchSync does not throw'))
  .example(val('Who', 'Nobody changes'), val('Result', 'thrown by dispatchSync'))
  .run(async (ctx) => {
    const who = ctx.example.val('Who');
    const observed: any[] = [];
    const shown: UserException[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      showUserException: (e) => shown.push(e),
      errorObserver: ({error}) => {
        observed.push(error);
        return (who === 'The errorObserver swallows') ? null : error;
      },
    });

    class A extends KissAction<number> {
      reduce(): number {
        throw new Error('sync boom');
      }

      wrapError(error: any) {
        return (who === 'wrapError converts to UserException')
          ? new UserException('Something went wrong.')
          : error;
      }
    }

    let thrown: any = null;
    try {
      store.dispatchSync(new A());
    } catch (e) {
      thrown = e;
    }

    expect(observed.length).toBe(1);
    if (who === 'The errorObserver swallows') {
      expect(thrown).toBeNull();
      expect(store.isFailed(A)).toBe(false);
    } else if (who === 'wrapError converts to UserException') {
      expect(thrown).toBeNull();
      expect(store.isFailed(A)).toBe(true);
      expect(shown.length).toBe(1);
    } else {
      expect(thrown).toBeInstanceOf(Error);
      expect(thrown).not.toBeInstanceOf(StoreException);
      expect(thrown.message).toBe('sync boom');
    }
  });

Bdd(feature)
  .scenario('A StoreException thrown by an action itself still goes to the errorObserver.')
  .given('An errorObserver that swallows all errors.')
  .and('An action whose reducer throws a StoreException.')
  .when('The action is dispatched with {Method}.')
  .then('The errorObserver gets the StoreException, and swallows it.')
  .note('Only the StoreException that dispatchSync throws for an async action skips the errorObserver.')
  .example(val('Method', 'dispatch'))
  .example(val('Method', 'dispatchSync'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      errorObserver: ({error}) => {
        observed.push(error);
        return null;
      },
    });

    class A extends KissAction<number> {
      reduce(): number {
        throw new StoreException('thrown by the action');
      }
    }

    if (ctx.example.val('Method') === 'dispatch') store.dispatch(new A());
    else store.dispatchSync(new A());

    expect(observed.length).toBe(1);
    expect(observed[0]).toBeInstanceOf(StoreException);
    expect(observed[0].message).toBe('thrown by the action');
  });

Bdd(feature)
  .scenario('When dispatchSync throws for an async action, the stateObserver still sees the StoreException.')
  .given('A stateObserver.')
  .and('An action with an async reducer.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The stateObserver is called once, with that StoreException, and the state unchanged.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      stateObserver: (_action, prevState, newState, error) => observed.push({prevState, newState, error}),
    });

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        return (s) => s + 1;
      }
    }

    let thrown: any;
    try {
      store.dispatchSync(new A());
    } catch (e) {
      thrown = e;
    }
    await delayMillis(30);

    expect(thrown).toBeInstanceOf(StoreException);
    expect(observed).toEqual([{prevState: 0, newState: 0, error: thrown}]);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an async action, the later result of the async reducer is ignored.')
  .given('An errorObserver.')
  .and('An action whose async reducer {Result} after a delay.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException, and the action is already finished.')
  .and('When the async reducer finishes, the state does not change, the errorObserver is not called, and the action is not failed.')
  .example(val('Result', 'fails with a UserException'))
  .example(val('Result', 'fails with an Error'))
  .example(val('Result', 'succeeds'))
  .run(async (ctx) => {
    const result = ctx.example.val('Result');
    const observed: any[] = [];
    const shown: UserException[] = [];
    const store = new Store<number>({
      initialState: 0, logger: null,
      showUserException: (e) => shown.push(e),
      errorObserver: ({error}) => {
        observed.push(error);
        return error;
      },
    });
    let afterCount = 0;

    class A extends KissAction<number> {
      async reduce(): Promise<(s: number) => number> {
        await delayMillis(10);
        if (result === 'fails with a UserException') throw new UserException('Failed.');
        if (result === 'fails with an Error') throw new Error('Failed.');
        return (s) => s + 1;
      }

      after() {
        afterCount++;
      }
    }

    const action = new A();
    expect(() => store.dispatchSync(action)).toThrow(StoreException);
    expect(action.status.isCompleted).toBe(true);
    expect(afterCount).toBe(1);

    await delayMillis(50);
    expect(store.state).toBe(0);
    expect(observed).toEqual([]);
    expect(store.isFailed(A)).toBe(false);
    expect(shown).toEqual([]);
    expect(afterCount).toBe(1);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for a non-reentrant async action, the same action can be dispatched again.')
  .given('A nonReentrant action with an async reducer that takes a while.')
  .and('It was dispatched with dispatchSync, which threw a StoreException.')
  .when('The same action is dispatched again with dispatchAndWait, while the first reducer is still running.')
  .then('The new action is not aborted, and changes the state.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});

    class A extends KissAction<number> {
      nonReentrant = true;

      async reduce(): Promise<(s: number) => number> {
        await delayMillis(20);
        return (s) => s + 1;
      }
    }

    expect(() => store.dispatchSync(new A())).toThrow(StoreException);
    const status = await store.dispatchAndWait(new A());

    expect(status.isDispatchAborted).toBe(false);
    expect(status.isCompletedOk).toBe(true);
    expect(store.state).toBe(1);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an action with retry, the action is already finished, and a later success is ignored.')
  .given('An action with retry, whose async reducer {Result}.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The action is already finished, its after method ran once, and it is no longer in progress.')
  .and('The reducer runs only once, and the state does not change.')
  .example(val('Result', 'fails after a delay'))
  .example(val('Result', 'succeeds after a delay'))
  .run(async (ctx) => {
    const fails = ctx.example.val('Result') === 'fails after a delay';
    const store = new Store<number>({initialState: 0, logger: null});
    let count = 0;
    let afterCount = 0;

    class A extends KissAction<number> {
      retry = {initialDelay: 1, maxRetries: 3};

      async reduce(): Promise<(s: number) => number> {
        count++;
        await delayMillis(10);
        if (fails) throw new Error('retry boom');
        return (s) => s + 1;
      }

      after() {
        afterCount++;
      }
    }

    const action = new A();
    expect(() => store.dispatchSync(action)).toThrow(StoreException);
    expect(action.status.isCompleted).toBe(true);
    expect(afterCount).toBe(1);
    expect(store.isWaiting(A)).toBe(false);

    await delayMillis(80);
    expect(count).toBe(1);
    expect(afterCount).toBe(1);
    expect(store.state).toBe(0);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an action with unlimitedRetryCheckInternet whose internet check fails, it does not check again.')
  .given('An action with unlimitedRetryCheckInternet, whose internet check fails with an error.')
  .when('The action is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The internet is checked only once, and the reducer never runs.')
  .and('The internet check error is logged, and there is no unhandled rejection.')
  .run(async (_) => {
    const logs: any[] = [];
    const store = new Store<number>({initialState: 0, logger: (obj: any) => logs.push(obj)});
    let checks = 0;
    let count = 0;

    class A extends KissAction<number> {
      unlimitedRetryCheckInternet = {maxDelayNoInternet: 5};

      protected hasInternet(): Promise<boolean> {
        checks++;
        return Promise.reject(new Error('check boom'));
      }

      async reduce(): Promise<(s: number) => number> {
        count++;
        return (s) => s + 1;
      }
    }

    let thrown: any;
    const unhandled = await collectUnhandledRejections(() => {
      try {
        store.dispatchSync(new A());
      } catch (e) {
        thrown = e;
      }
    });
    await delayMillis(70);

    expect(thrown).toBeInstanceOf(StoreException);
    expect(checks).toBe(1);
    expect(count).toBe(0);
    expect(logs.some(l => String(l).includes('check boom'))).toBe(true);
    expect(unhandled).toEqual([]);
  });

Bdd(feature)
  .scenario('After dispatchSync throws for an optimistic command with retry, a failed server call still rolls back the optimistic value.')
  .given('An optimistic command with retry, whose server call fails.')
  .when('The command is dispatched with dispatchSync.')
  .then('dispatchSync throws a StoreException.')
  .and('The optimistic value was applied, since that is done before the reducer awaits.')
  .and('When the server call fails, it is not retried, and the optimistic value is rolled back.')
  .and('The command is not failed.')
  .run(async (_) => {
    const store = new Store<number>({initialState: 0, logger: null});
    let calls = 0;

    class Save extends OptimisticCommand<number, number> {
      retry = {initialDelay: 1, maxRetries: 3};

      optimisticValue() {
        return 1;
      }

      getValueFromState(state: number) {
        return state;
      }

      applyValueToState(_state: number, value: number) {
        return value;
      }

      async sendCommandToServer(_value: number) {
        calls++;
        await delayMillis(10);
        throw new UserException('Command failed.');
      }
    }

    expect(() => store.dispatchSync(new Save())).toThrow(StoreException);
    expect(store.state).toBe(1);

    await delayMillis(80);
    expect(calls).toBe(1);
    expect(store.state).toBe(0);
    expect(store.isFailed(Save)).toBe(false);
  });
