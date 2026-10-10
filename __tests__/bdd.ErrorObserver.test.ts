import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ErrorObserver');

Bdd(feature)
  .scenario('The errorObserver gets the error, the original error, the action, and the store.')
  .given('A <Action> action that throws an error, and has a wrapError that wraps it.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched.')
  .then('The errorObserver gets the error returned by the wrapError.')
  .and('It gets the error before the wrapError, as the originalError.')
  .and('It gets the action and the store.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: (params) => {
        observed.push(params);
        return null;
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    action.wrap = (error: any) => new Error('wrapped ' + error.message);

    await store.dispatchAndWait(action);

    expect(observed.length).toBe(1);
    expect(observed[0].error.message).toBe('wrapped original');
    expect(observed[0].originalError.message).toBe('original');
    expect(observed[0].action).toBe(action);
    expect(observed[0].store).toBe(store);
  });

Bdd(feature)
  .scenario('The error the errorObserver returns is the one dispatch throws.')
  .given('A <Action> action that throws an error which is not a UserException.')
  .and('An errorObserver that <Observer>.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait rejects with <Thrown>.')
  .and('The action status has <Thrown> as its wrapped error.')
  .example(val('Action', 'sync'), val('Observer', 'returns the error'), val('Thrown', 'original'))
  .example(val('Action', 'async'), val('Observer', 'returns the error'), val('Thrown', 'original'))
  .example(val('Action', 'sync'), val('Observer', 'returns another error'), val('Thrown', 'other'))
  .example(val('Action', 'async'), val('Observer', 'returns another error'), val('Thrown', 'other'))
  .example(val('Action', 'sync'), val('Observer', 'throws another error'), val('Thrown', 'other'))
  .example(val('Action', 'async'), val('Observer', 'throws another error'), val('Thrown', 'other'))
  .run(async (ctx) => {
    const observer = ctx.example.val('Observer');
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => {
        if (observer === 'returns the error') return error;
        if (observer === 'returns another error') return new Error('other');
        throw new Error('other');
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));

    let caught: any = null;
    try {
      await store.dispatchAndWait(action);
    } catch (error) {
      caught = error;
    }

    expect(caught?.message).toBe(ctx.example.val('Thrown'));
    expect(action.status.wrappedError?.message).toBe(ctx.example.val('Thrown'));
  });

Bdd(feature)
  .scenario('The errorObserver can swallow an error by returning null, or nothing.')
  .given('A <Action> action that throws an error which is not a UserException.')
  .and('An errorObserver that returns <Returns>.')
  .when('The action is dispatched.')
  .then('dispatch does not throw, and dispatchAndWait resolves with the action status.')
  .and('The action does not count as failed.')
  .example(val('Action', 'sync'), val('Returns', 'null'))
  .example(val('Action', 'async'), val('Returns', 'null'))
  .example(val('Action', 'sync'), val('Returns', 'undefined'))
  .example(val('Action', 'async'), val('Returns', 'undefined'))
  .run(async (ctx) => {
    const returns = ctx.example.val('Returns') === 'null' ? null : undefined;
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: () => returns,
    });

    const action1 = createAction(ctx.example.val('Action'), new Error('original'));
    expect(() => store.dispatch(action1)).not.toThrow();
    await delayMillis(20);

    const action2 = createAction(ctx.example.val('Action'), new Error('original'));
    const status = await store.dispatchAndWait(action2);

    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError.message).toBe('original');
    expect(status.wrappedError).toBeNull();
    expect(store.isFailed(FailingSync) || store.isFailed(FailingAsync)).toBe(false);
  });

Bdd(feature)
  .scenario('A UserException returned by the errorObserver is shown to the user, and is not thrown.')
  .given('A <Action> action that throws <Error>.')
  .and('An errorObserver that <Observer>.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves with the action status.')
  .and('The UserException is shown to the user.')
  .and('The action counts as failed, with that UserException.')
  .example(val('Action', 'sync'), val('Error', 'a UserException'), val('Observer', 'returns the error'))
  .example(val('Action', 'async'), val('Error', 'a UserException'), val('Observer', 'returns the error'))
  .example(val('Action', 'sync'), val('Error', 'an Error'), val('Observer', 'turns it into a UserException'))
  .example(val('Action', 'async'), val('Error', 'an Error'), val('Observer', 'turns it into a UserException'))
  .run(async (ctx) => {
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      showUserException: (exception, _count, next) => {
        shown.push(exception);
        next();
      },
      errorObserver: ({ error }) =>
        (error instanceof UserException) ? error : new UserException('Failed.').withHardCause(error),
    });
    const error = (ctx.example.val('Error') === 'a UserException')
      ? new UserException('Failed.')
      : new Error('original');
    const action = createAction(ctx.example.val('Action'), error);
    const actionType = action.constructor as typeof FailingSync;

    const status = await store.dispatchAndWait(action);

    expect(status.isCompletedFailed).toBe(true);
    expect(shown.map(e => e.message)).toEqual(['Failed.']);
    expect(store.isFailed(actionType)).toBe(true);
    expect(store.exceptionFor(actionType)?.message).toBe('Failed.');
  });

Bdd(feature)
  .scenario('The errorObserver can swallow a UserException.')
  .given('A <Action> action that throws a UserException.')
  .and('An errorObserver that returns null.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves with the action status.')
  .and('The UserException is not shown to the user.')
  .and('The action does not count as failed.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      showUserException: (exception, _count, next) => {
        shown.push(exception);
        next();
      },
      errorObserver: () => null,
    });
    const action = createAction(ctx.example.val('Action'), new UserException('Failed.'));
    const actionType = action.constructor as typeof FailingSync;

    const status = await store.dispatchAndWait(action);

    expect(status.isCompletedFailed).toBe(true);
    expect(shown).toEqual([]);
    expect(store.isFailed(actionType)).toBe(false);
  });

Bdd(feature)
  .scenario('The errorObserver is not called when the action wrapError returns null.')
  .given('A <Action> action that throws an error, and has a wrapError that returns null.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The errorObserver is not called.')
  .and('dispatchAndWait resolves with the action status.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => {
        observed.push(error);
        return error;
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    action.wrap = () => null;

    const status = await store.dispatchAndWait(action);

    expect(observed).toEqual([]);
    expect(status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('The errorObserver is not called for actions that succeed.')
  .given('A store with an errorObserver.')
  .when('Sync and async actions that succeed are dispatched.')
  .then('The errorObserver is not called.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => {
        observed.push(error);
        return error;
      },
    });

    store.dispatch(new IncrementSync());
    await store.dispatchAndWait(new IncrementAsync());

    expect(store.state.count).toBe(3);
    expect(observed).toEqual([]);
  });

Bdd(feature)
  .scenario('An error thrown in the before method also goes to the errorObserver.')
  .given('An action whose <Before> before method throws an error.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched.')
  .then('The errorObserver gets the error, the original error, and the action.')
  .and('The reducer does not run.')
  .example(val('Before', 'sync'))
  .example(val('Before', 'async'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: (params) => {
        observed.push(params);
        return null;
      },
    });
    const action = (ctx.example.val('Before') === 'sync')
      ? new FailingBeforeSync(new Error('in before'))
      : new FailingBeforeAsync(new Error('in before'));

    await store.dispatchAndWait(action);

    expect(observed.length).toBe(1);
    expect(observed[0].error.message).toBe('in before');
    expect(observed[0].originalError.message).toBe('in before');
    expect(observed[0].action).toBe(action);
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('If the action wrapError throws, the errorObserver gets the thrown error.')
  .given('A <Action> action that throws an error, and has a wrapError that throws another error.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched.')
  .then('The errorObserver gets the error thrown by the wrapError.')
  .and('It gets the error thrown by the action, as the originalError.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: (params) => {
        observed.push(params);
        return null;
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    action.wrap = () => {
      throw new Error('thrown by wrapError');
    };

    await store.dispatchAndWait(action);

    expect(observed.map(o => o.error.message)).toEqual(['thrown by wrapError']);
    expect(observed.map(o => o.originalError.message)).toEqual(['original']);
  });

Bdd(feature)
  .scenario('dispatch of a sync action throws the error the errorObserver returns.')
  .given('A sync action that throws an error which is not a UserException.')
  .and('An errorObserver that <Observer>.')
  .when('The action is dispatched with dispatch.')
  .then('dispatch <Result>.')
  .example(val('Observer', 'returns the error'), val('Result', 'throws the error'))
  .example(val('Observer', 'returns another error'), val('Result', 'throws the other error'))
  .example(val('Observer', 'throws another error'), val('Result', 'throws the other error'))
  .example(val('Observer', 'returns null'), val('Result', 'does not throw'))
  .run(async (ctx) => {
    const observer = ctx.example.val('Observer');
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => {
        if (observer === 'returns the error') return error;
        if (observer === 'returns another error') return new Error('other');
        if (observer === 'throws another error') throw new Error('other');
        return null;
      },
    });
    const action = new FailingSync(new Error('original'));

    let caught: any = null;
    try {
      store.dispatch(action);
    } catch (error) {
      caught = error;
    }

    const result = ctx.example.val('Result');
    if (result === 'throws the error') expect(caught?.message).toBe('original');
    else if (result === 'throws the other error') expect(caught?.message).toBe('other');
    else expect(caught).toBeNull();
  });

// Note: when the errorObserver does NOT swallow the error of an ASYNC action dispatched with
// `dispatch`, it becomes an unhandled promise rejection. Jest fails the test when that happens,
// and a test can't catch it, so that case is not tested here. The same error rejects
// `dispatchAndWait`, which is tested above.
Bdd(feature)
  .scenario('dispatch of an async action does not throw, and its result is in the action status.')
  .given('An async action that throws an error which is not a UserException.')
  .and('An errorObserver that <Observer>.')
  .when('The action is dispatched with dispatch.')
  .then('dispatch does not throw.')
  .and('After the action finishes, its status has <Wrapped error> as the wrapped error.')
  .and('There is no unhandled promise rejection.')
  .example(val('Observer', 'returns null'), val('Wrapped error', 'no error'))
  .example(val('Observer', 'turns it into a UserException'), val('Wrapped error', 'the UserException'))
  .run(async (ctx) => {
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => (ctx.example.val('Observer') === 'returns null')
        ? null
        : new UserException('Failed.').withHardCause(error),
    });
    const action = new FailingAsync(new Error('original'));

    expect(() => store.dispatch(action)).not.toThrow();
    await delayMillis(30);

    expect(action.status.isCompletedFailed).toBe(true);
    if (ctx.example.val('Wrapped error') === 'no error') expect(action.status.wrappedError).toBeNull();
    else expect(action.status.wrappedError?.message).toBe('Failed.');
  });

Bdd(feature)
  .scenario('With retry, the errorObserver is called once, after the last attempt.')
  .given('An async action with retry, that fails in all attempts.')
  .and('A store with an errorObserver.')
  .when('The action is dispatched.')
  .then('The errorObserver is called only once, after all attempts failed.')
  .and('It gets the error of the last attempt.')
  .run(async (_) => {
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      errorObserver: ({ error }) => {
        observed.push({ error, reduceCalls: action.reduceCalls });
        return null;
      },
    });
    const action = new AlwaysFailsWithRetry();

    await store.dispatchAndWait(action);

    expect(action.reduceCalls).toBe(3);
    expect(observed.map(o => o.error.message)).toEqual(['attempt 3']);
    expect(observed[0].reduceCalls).toBe(3);
  });

Bdd(feature)
  .scenario('A UserException thrown by the errorObserver is shown to the user, and is not thrown.')
  .given('A <Action> action that throws an error which is not a UserException.')
  .and('An errorObserver that throws a UserException.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves with the action status.')
  .and('The UserException is shown to the user.')
  .and('The action counts as failed, with that UserException.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      showUserException: (exception, _count, next) => {
        shown.push(exception);
        next();
      },
      errorObserver: ({ error }) => {
        throw new UserException('Failed.').withHardCause(error);
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    const actionType = action.constructor as typeof FailingSync;

    const status = await store.dispatchAndWait(action);

    expect(status.isCompletedFailed).toBe(true);
    expect(shown.map(e => e.message)).toEqual(['Failed.']);
    expect(store.exceptionFor(actionType)?.message).toBe('Failed.');
  });

Bdd(feature)
  .scenario('A UserException without a dialog, returned by the errorObserver, is not shown, but the action counts as failed.')
  .given('A <Action> action that throws an error which is not a UserException.')
  .and('An errorObserver that turns it into a UserException without a dialog.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves with the action status.')
  .and('The UserException is not shown to the user.')
  .and('The action counts as failed, with that UserException.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const shown: UserException[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      showUserException: (exception, _count, next) => {
        shown.push(exception);
        next();
      },
      errorObserver: ({ error }) => new UserException('Failed.').withHardCause(error).noDialog,
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    const actionType = action.constructor as typeof FailingSync;

    const status = await store.dispatchAndWait(action);

    expect(status.isCompletedFailed).toBe(true);
    expect(shown).toEqual([]);
    expect(store.userExceptionsQueue.length).toBe(0);
    expect(store.isFailed(actionType)).toBe(true);
    expect(store.exceptionFor(actionType)?.message).toBe('Failed.');
  });

Bdd(feature)
  .scenario('The stateObserver, the wrapError, the errorObserver, and the after method run in this order.')
  .given('A <Action> action that throws an error, and has a wrapError and an after method.')
  .and('A store with a stateObserver and an errorObserver.')
  .when('The action is dispatched.')
  .then('The stateObserver runs first, with the original error.')
  .and('Then the wrapError, then the errorObserver, and then the after method.')
  .example(val('Action', 'sync'))
  .example(val('Action', 'async'))
  .run(async (ctx) => {
    const calls: string[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: () => {},
      stateObserver: (_action, _prevState, _newState, error) => {
        calls.push('stateObserver: ' + error?.message);
      },
      errorObserver: ({ error }) => {
        calls.push('errorObserver: ' + error.message);
        return null;
      },
    });
    const action = createAction(ctx.example.val('Action'), new Error('original'));
    action.wrap = (error: any) => {
      calls.push('wrapError: ' + error.message);
      return new Error('wrapped');
    };
    action.onAfter = () => calls.push('after');

    await store.dispatchAndWait(action);

    expect(calls).toEqual([
      'stateObserver: original',
      'wrapError: original',
      'errorObserver: wrapped',
      'after',
    ]);
  });

Bdd(feature)
  .scenario('An errorObserver typed with a non-null action can be used.')
  .given('An errorObserver whose parameter is typed with a non-null action.')
  .when('It is given to the store, and an action fails.')
  .then('It compiles, and is called with the action.')
  .run(async (_) => {
    const observed: string[] = [];

    // Its `action` is typed `KissAction<State>`, not `KissAction<State> | null`.
    const errorObserver = ({ error, action }: {
      error: any,
      originalError: any,
      action: KissAction<State>,
      store: Store<State>,
    }) => {
      observed.push(action.constructor.name + ': ' + error.message);
      return null;
    };

    const store = new Store<State>({ initialState: new State(1), logger: () => {}, errorObserver });
    await store.dispatchAndWait(new FailingSync(new Error('original')));

    expect(observed).toEqual(['FailingSync: original']);
  });

// ----------------------------------------------

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

class FailingSync extends KissAction<State> {
  wrap: ((error: any) => any) | null = null;
  onAfter: (() => void) | null = null;

  constructor(readonly error: any) {
    super();
  }

  reduce(): State {
    throw this.error;
  }

  wrapError(error: any) {
    return (this.wrap === null) ? error : this.wrap(error);
  }

  after() {
    this.onAfter?.();
  }
}

class FailingAsync extends KissAction<State> {
  wrap: ((error: any) => any) | null = null;
  onAfter: (() => void) | null = null;

  constructor(readonly error: any) {
    super();
  }

  async reduce(): Promise<null> {
    await delayMillis(10);
    throw this.error;
  }

  wrapError(error: any) {
    return (this.wrap === null) ? error : this.wrap(error);
  }

  after() {
    this.onAfter?.();
  }
}

class FailingBeforeSync extends KissAction<State> {
  constructor(readonly error: any) {
    super();
  }

  before() {
    throw this.error;
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

class FailingBeforeAsync extends KissAction<State> {
  constructor(readonly error: any) {
    super();
  }

  async before() {
    await delayMillis(10);
    throw this.error;
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

class AlwaysFailsWithRetry extends KissAction<State> {
  retry = { initialDelay: 1, maxRetries: 2 };
  reduceCalls = 0;

  async reduce(): Promise<null> {
    this.reduceCalls++;
    await delayMillis(1);
    throw new Error('attempt ' + this.reduceCalls);
  }
}

function createAction(kind: 'sync' | 'async', error: any): FailingSync | FailingAsync {
  return (kind === 'sync') ? new FailingSync(error) : new FailingAsync(error);
}
