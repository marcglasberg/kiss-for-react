import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { OptimisticCommand, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Optimistic command whose server response fails to apply');

class State {
  constructor(readonly value: string) {
  }
}

/**
 * Optimistic command whose server call succeeds with the response 'resp'.
 * It logs the calls to `shouldRollback`, `rollbackState` and `reloadFromServer`.
 */
class SaveValue extends OptimisticCommand<State, string> {
  readonly calls: string[] = [];

  optimisticValue() {
    return 'new';
  }

  getValueFromState(state: State) {
    return state.value;
  }

  applyValueToState(_state: State, value: string) {
    return new State(value);
  }

  async sendCommandToServer() {
    return 'resp';
  }

  shouldRollback(params: any) {
    this.calls.push('shouldRollback');
    return super.shouldRollback(params);
  }

  rollbackState(params: any) {
    this.calls.push('rollbackState');
    return super.rollbackState(params);
  }

  async reloadFromServer() {
    this.calls.push('reload');
    return 'reloaded';
  }
}

Bdd(feature)
  .scenario('When applying the server response throws, the state is not rolled back.')
  .given('An optimistic command whose server call succeeds with a response.')
  .and('Applying the server response to the state throws an error.')
  .when('The command is dispatched.')
  .then('The state is not rolled back, and keeps the optimistic value.')
  .and('The rollback is not even considered, since the command did not fail.')
  .and('There is no reload, since by default it only reloads when the command fails.')
  .and('The action fails with the error thrown when applying the server response.')
  .run(async (_) => {
    const applyError = new Error('Bad apply.');

    class SaveWithBadApply extends SaveValue {
      applyServerResponseToState(): State | null {
        throw applyError;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveWithBadApply();

    await expect(store.dispatchAndWait(action)).rejects.toBe(applyError);

    expect(store.state.value).toBe('new');
    expect(action.calls).toEqual([]);
    expect(action.status.originalError).toBe(applyError);
    expect(action.status.isCompletedFailed).toBe(true);
  });

Bdd(feature)
  .scenario('When reading the value from the applied server response throws, the state is not rolled back.')
  .given('An optimistic command whose server call succeeds with a response.')
  .and('The server response is applied to the state.')
  .and('Reading the value from that new state throws an error the first time.')
  .when('The command is dispatched.')
  .then('The state is not rolled back, and keeps the server response.')
  .and('The rollback is not even considered, since the command did not fail.')
  .and('The action fails with the error thrown when reading the value.')
  .run(async (_) => {
    const readError = new Error('Bad read.');

    class SaveWithBadRead extends SaveValue {
      private hasThrown = false;

      applyServerResponseToState(_state: State, serverResponse: any) {
        return new State('response:' + serverResponse);
      }

      getValueFromState(state: State) {
        if (state.value.startsWith('response:') && !this.hasThrown) {
          this.hasThrown = true;
          throw readError;
        }
        return state.value;
      }
    }

    const store = new Store<State>({ initialState: new State('old') });
    const action = new SaveWithBadRead();

    await expect(store.dispatchAndWait(action)).rejects.toBe(readError);

    expect(store.state.value).toBe('response:resp');
    expect(action.calls).toEqual([]);
    expect(action.status.originalError).toBe(readError);
  });
