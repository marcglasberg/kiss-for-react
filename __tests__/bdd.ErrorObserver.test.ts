import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store, KissAction, UserException } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ErrorObserver');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('ErrorObserver is called when the state changes.')
  .given('SYNC and ASYNC actions.')
  .when('The actions are dispatched.')
  .then('The SYNC action starts and finishes at once.')
  .and('The ASYNC action first starts, and then finishes after the async gap.')
  .run(async (_) => {

    let result = '';

    let store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      //
      // When the errorObserver returns false, the error is NOT thrown.
      errorObserver: (error: any, action: KissAction<State>, store: Store<State>) => {
        result +=
          'error: ' + error + ', ' +
          'action: "' + action.toString() + '", ' +
          'store: ' + store +
          '|';

        return false;
      }
    });

    // SYNC then ASYNC. No errors.

    store.dispatch(new IncrementSync());
    await store.dispatchAndWait(new IncrementAsync());
    expect(result).toBe('');

    // SYNC then ASYNC with errors.

    store.dispatch(new IncrementSyncWithError());
    await store.dispatchAndWait(new IncrementAsyncWithError());
    expect(result).toBe('' +
      'error: UserException: Error in before, sync., action: "IncrementSyncWithError()", store: [object Object]' +
      '|' +
      'error: UserException: Error in before, async., action: "IncrementAsyncWithError()", store: [object Object]' +
      '|'
    );

    // ASYNC then SYNC.

    result = '';

    let promise = store.dispatchAndWait(new IncrementAsyncWithError());
    store.dispatch(new IncrementSyncWithError());
    await promise;

    expect(result).toBe('' +
      'error: UserException: Error in before, sync., action: "IncrementSyncWithError()", store: [object Object]' +
      '|' +
      'error: UserException: Error in before, async., action: "IncrementAsyncWithError()", store: [object Object]' +
      '|'
    );

    // When the errorObserver returns true, the error is thrown.

    store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      errorObserver: (error: any, action: KissAction<State>, store: Store<State>) => {
        result +=
          'error: ' + error + ', ' +
          'action: "' + action.toString() + '", ' +
          'store: ' + store +
          '|';

        return true;
      }
    });

    async function triggerAsyncError() {
      store.dispatch(new IncrementSyncWithError());
    }

    await expect(triggerAsyncError()).rejects.toThrow('Error in before, sync.');
  });

class State {
  constructor(readonly count: number) {
  }

  toString() {
    return 'State(' + this.count + ')';
  }
}

class IncrementSync extends KissAction<State> {

  reduce() {
    return new State(this.state.count + 1);
  }
}

class IncrementAsync extends KissAction<State> {

  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(state.count + 1);
  }
}

class IncrementSyncWithError extends KissAction<State> {

  before() {
    throw new UserException('Error in before, sync.');
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

class IncrementAsyncWithError extends KissAction<State> {

  async before() {
    await delayMillis(50);
    throw new UserException('Error in before, async.');
  }

  reduce() {
    return new State(this.state.count + 1);
  }
}

