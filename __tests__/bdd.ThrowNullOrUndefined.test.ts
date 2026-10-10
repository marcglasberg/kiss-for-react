import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Actions that throw null or undefined');

class State {
  constructor(readonly count: number) {
  }
}

// The examples hold the thrown value as a string, since `undefined` can't be an example value.
function thrownValue(name: string): null | undefined {
  return (name === 'null') ? null : undefined;
}

// Creates an action that fails with the given value (`null` or `undefined`), thrown by the
// given method, which may be SYNC or ASYNC.
function actionThatThrows(value: null | undefined, method: string): KissAction<State> {
  switch (method) {
    case 'sync reduce':
      return new class SyncReduceThrows extends KissAction<State> {
        reduce(): any {
          throw value;
        }
      }();
    case 'async reduce':
      return new class AsyncReduceThrows extends KissAction<State> {
        async reduce(): Promise<any> {
          throw value;
        }
      }();
    case 'async reduce rejects':
      return new class AsyncReduceRejects extends KissAction<State> {
        async reduce(): Promise<any> {
          await Promise.reject(value);
          return (state: State) => new State(state.count + 1);
        }
      }();
    case 'sync before':
      return new class SyncBeforeThrows extends KissAction<State> {
        before(): void {
          throw value;
        }

        reduce() {
          return new State(this.state.count + 1);
        }
      }();
    case 'async before':
      return new class AsyncBeforeThrows extends KissAction<State> {
        async before(): Promise<void> {
          throw value;
        }

        reduce() {
          return new State(this.state.count + 1);
        }
      }();
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

Bdd(feature)
  .scenario('An action that throws null or undefined fails.')
  .given('An action whose [Method] throws [Value].')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The action fails with an Error that explains the problem.')
  .and('The action status is "completed failed", not "completed OK".')
  .and('The state is not changed.')
  .example(val('Value', 'null'), val('Method', 'sync reduce'))
  .example(val('Value', 'undefined'), val('Method', 'sync reduce'))
  .example(val('Value', 'null'), val('Method', 'async reduce'))
  .example(val('Value', 'undefined'), val('Method', 'async reduce'))
  .example(val('Value', 'undefined'), val('Method', 'async reduce rejects'))
  .example(val('Value', 'null'), val('Method', 'sync before'))
  .example(val('Value', 'undefined'), val('Method', 'sync before'))
  .example(val('Value', 'null'), val('Method', 'async before'))
  .example(val('Value', 'undefined'), val('Method', 'async before'))
  .run(async (ctx) => {
    const value = thrownValue(ctx.example.val('Value'));
    const method = ctx.example.val('Method') as string;

    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});
    const action = actionThatThrows(value, method);

    // When:
    let thrown: any = 'nothing thrown';
    await store.dispatchAndWait(action).catch(error => thrown = error);

    // Then:
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown.message).toContain(String(value));

    expect(action.status.isCompleted).toBe(true);
    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBe(thrown);
    expect(action.status.wrappedError).toBe(thrown);

    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('A SYNC action that throws null fails when dispatched with dispatch.')
  .given('A SYNC action whose reducer throws null.')
  .when('The action is dispatched with dispatch.')
  .then('dispatch throws an Error that explains the problem.')
  .and('The action status is "completed failed".')
  .run(async (_) => {
    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});
    const action = actionThatThrows(null, 'sync reduce');

    // When/Then:
    expect(() => store.dispatch(action)).toThrow(/null/);
    expect(action.status.isCompletedOk).toBe(false);
    expect(action.status.isCompletedFailed).toBe(true);
    expect(action.status.originalError).toBeInstanceOf(Error);
  });

Bdd(feature)
  .scenario('The stateObserver gets a non-null error when the action throws null or undefined.')
  .given('A store with a stateObserver.')
  .and('An action whose reducer throws [Value].')
  .when('The action is dispatched.')
  .then('The stateObserver is called with an Error, and not with null or undefined.')
  .example(val('Value', 'null'))
  .example(val('Value', 'undefined'))
  .run(async (ctx) => {
    const value = thrownValue(ctx.example.val('Value'));

    // Given:
    const errors: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: null,
      stateObserver: (_action, _prevState, _newState, error) => errors.push(error),
    });
    const action = actionThatThrows(value, 'async reduce');

    // When:
    await store.dispatchAndWait(action).catch(() => {});

    // Then:
    expect(errors.length).toBe(1);
    expect(errors[0]).toBeInstanceOf(Error);
    expect(errors[0]).toBe(action.status.originalError);
  });

Bdd(feature)
  .scenario('wrapError and the errorObserver get an Error when the action throws null or undefined.')
  .given('A store with an errorObserver.')
  .and('An action with a wrapError, whose reducer throws [Value].')
  .when('The action is dispatched.')
  .then('wrapError and the errorObserver get an Error, and not null or undefined.')
  .and('The failure is not swallowed.')
  .example(val('Value', 'null'))
  .example(val('Value', 'undefined'))
  .run(async (ctx) => {
    const value = thrownValue(ctx.example.val('Value'));

    // Given:
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(1),
      logger: null,
      errorObserver: ({error, originalError}) => {
        observed.push({error, originalError});
        return error;
      },
    });

    const wrapped: any[] = [];

    class Fails extends KissAction<State> {
      async reduce(): Promise<any> {
        throw value;
      }

      wrapError(error: any): any {
        wrapped.push(error);
        return error;
      }
    }

    const action = new Fails();

    // When:
    let thrown: any = 'nothing thrown';
    await store.dispatchAndWait(action).catch(error => thrown = error);

    // Then:
    expect(wrapped.length).toBe(1);
    expect(wrapped[0]).toBeInstanceOf(Error);
    expect(observed.length).toBe(1);
    expect(observed[0].error).toBe(wrapped[0]);
    expect(observed[0].originalError).toBe(wrapped[0]);
    expect(thrown).toBe(wrapped[0]);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('An action that throws null or undefined can still have its error swallowed.')
  .given('An action whose reducer throws [Value].')
  .and('Its wrapError returns null.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('dispatchAndWait resolves, since the error was swallowed.')
  .and('The action status is still "completed failed", since the reducer did not finish.')
  .example(val('Value', 'null'))
  .example(val('Value', 'undefined'))
  .run(async (ctx) => {
    const value = thrownValue(ctx.example.val('Value'));

    // Given:
    const store = new Store<State>({initialState: new State(1), logger: null});

    class Swallowed extends KissAction<State> {
      async reduce(): Promise<any> {
        throw value;
      }

      wrapError(_error: any): any {
        return null;
      }
    }

    const action = new Swallowed();

    // When:
    const status = await store.dispatchAndWait(action);

    // Then:
    expect(status.isCompletedOk).toBe(false);
    expect(status.isCompletedFailed).toBe(true);
    expect(status.originalError).toBeInstanceOf(Error);
    expect(status.wrappedError).toBe(null);
  });
