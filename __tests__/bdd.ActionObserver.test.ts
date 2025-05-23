import { expect, test } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store, KissAction } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ActionObserver');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('ActionObserver is called when actions are dispatched.')
  .given('SYNC and ASYNC actions.')
  .when('The actions are dispatched.')
  .then('The SYNC action starts and finishes at once.')
  .and('The ASYNC action first starts, and then finishes after the async gap.')
  .run(async (_) => {

    let result = '';

    const store = new Store<State>({
      initialState: new State(1),
      logger: logger,
      actionObserver: (action: KissAction<State>, dispatchCount: number, ini: boolean) => {
        result += 'action: "' + action.toString() + '", ' +
          'dispatchCount: ' + dispatchCount + ', ' +
          (ini ? 'ini' : 'end') +
          '|';
      }
    });

    // SYNC then ASYNC.

    store.dispatch(new IncrementSync());
    await store.dispatchAndWait(new IncrementAsync());

    expect(result).toBe('' +
      'action: "IncrementSync()", dispatchCount: 1, ini' +
      '|' +
      'action: "IncrementSync()", dispatchCount: 1, end' +
      '|' +
      'action: "IncrementAsync()", dispatchCount: 2, ini' +
      '|' +
      'action: "IncrementAsync()", dispatchCount: 2, end' +
      '|'
    );

    // ASYNC then SYNC.

    result = '';

    let promise = store.dispatchAndWait(new IncrementAsync());
    store.dispatch(new IncrementSync());
    await promise;

    expect(result).toBe('' +
      'action: "IncrementAsync()", dispatchCount: 3, ini' +
      '|' +
      'action: "IncrementSync()", dispatchCount: 4, ini' +
      '|' +
      'action: "IncrementSync()", dispatchCount: 4, end' +
      '|' +
      'action: "IncrementAsync()", dispatchCount: 4, end' +
      '|'
    );
  });

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
    await delayMillis(50);
    return (state: State) => new State(state.count + 1);
  }
}

