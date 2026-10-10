import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, OptimisticCommand, Store, StoreException } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Misconfigured actions are not dispatched');

class State {
  constructor(readonly value: string) {
  }
}

// Creates a misconfigured action, that logs to `calls` when its methods run.
function misconfiguredAction(misconfiguration: string, calls: string[]): KissAction<State> {
  switch (misconfiguration) {
    case 'an invalid retry option':
      return new class InvalidRetry extends KissAction<State> {
        retry = { maxRetries: -5 };

        before() {
          calls.push('before');
        }

        async reduce() {
          calls.push('reduce');
          return (_state: State) => new State('changed');
        }

        after() {
          calls.push('after');
        }
      }();
    case 'an optimistic command with nonReentrant':
      return new class SaveNonReentrant extends OptimisticCommand<State, string> {
        nonReentrant = true;

        before() {
          calls.push('before');
        }

        optimisticValue() {
          calls.push('reduce');
          return 'changed';
        }

        getValueFromState(state: State) {
          return state.value;
        }

        applyValueToState(_state: State, value: string) {
          return new State(value);
        }

        async sendCommandToServer() {
          calls.push('sendCommandToServer');
        }

        after() {
          calls.push('after');
        }
      }();
    default:
      throw new Error(misconfiguration);
  }
}

Bdd(feature)
  .scenario('A misconfigured action throws when dispatched, and is not dispatched at all.')
  .given('An action that is misconfigured.')
  .and('The store has an actionObserver.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException (or dispatchAndWait rejects with it).')
  .and('The action is not marked as dispatched, and is not completed.')
  .and('None of its before, reduce and after methods run.')
  .and('The actionObserver is not called.')
  .and('The action is not in progress, and the state does not change.')
  .example(val('Misconfiguration', 'an invalid retry option'), val('Dispatch', 'dispatch'))
  .example(val('Misconfiguration', 'an invalid retry option'), val('Dispatch', 'dispatchAndWait'))
  .example(val('Misconfiguration', 'an invalid retry option'), val('Dispatch', 'dispatchSync'))
  .example(val('Misconfiguration', 'an optimistic command with nonReentrant'), val('Dispatch', 'dispatch'))
  .example(val('Misconfiguration', 'an optimistic command with nonReentrant'), val('Dispatch', 'dispatchAndWait'))
  .example(val('Misconfiguration', 'an optimistic command with nonReentrant'), val('Dispatch', 'dispatchSync'))
  .run(async (ctx) => {
    const calls: string[] = [];
    const observed: string[] = [];

    const store = new Store<State>({
      initialState: new State('old'),
      actionObserver: (action, _dispatchCount, ini) => {
        observed.push(`${action.constructor.name} ${ini ? 'ini' : 'end'}`);
      },
    });

    const action = misconfiguredAction(ctx.example.val('Misconfiguration'), calls);

    switch (ctx.example.val('Dispatch')) {
      case 'dispatch':
        expect(() => store.dispatch(action)).toThrow(StoreException);
        break;
      case 'dispatchAndWait':
        await expect(store.dispatchAndWait(action)).rejects.toBeInstanceOf(StoreException);
        break;
      case 'dispatchSync':
        expect(() => store.dispatchSync(action)).toThrow(StoreException);
        break;
    }

    expect(action.status.isDispatched).toBe(false);
    expect(action.status.isCompleted).toBe(false);
    expect(calls).toEqual([]);
    expect(observed).toEqual([]);
    expect(store.isWaiting(action.constructor as any)).toBe(false);
    expect(store.actionsInProgress().size).toBe(0);
    expect(store.state.value).toBe('old');
  });

Bdd(feature)
  .scenario('After a misconfigured action throws, it can be fixed and dispatched again.')
  .given('An action with an invalid retry option.')
  .and('The action was dispatched, and threw a StoreException.')
  .when('Its retry option is fixed, and the same action is dispatched again.')
  .then('It runs, and changes the state.')
  .and('Its after method runs once.')
  .run(async (_) => {
    const calls: string[] = [];

    class Load extends KissAction<State> {
      retry: any = { maxRetries: -5 };

      async reduce() {
        calls.push('reduce');
        return (_state: State) => new State('changed');
      }

      after() {
        calls.push('after');
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    const action = new Load();

    expect(() => store.dispatch(action)).toThrow(StoreException);

    action.retry = { maxRetries: 2 };
    await store.dispatchAndWait(action);

    expect(store.state.value).toBe('changed');
    expect(calls).toEqual(['reduce', 'after']);
  });
