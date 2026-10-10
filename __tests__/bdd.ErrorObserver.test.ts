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

  constructor(readonly error: any) {
    super();
  }

  reduce(): State {
    throw this.error;
  }

  wrapError(error: any) {
    return (this.wrap === null) ? error : this.wrap(error);
  }
}

class FailingAsync extends KissAction<State> {
  wrap: ((error: any) => any) | null = null;

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
}

function createAction(kind: 'sync' | 'async', error: any): FailingSync | FailingAsync {
  return (kind === 'sync') ? new FailingSync(error) : new FailingAsync(error);
}
