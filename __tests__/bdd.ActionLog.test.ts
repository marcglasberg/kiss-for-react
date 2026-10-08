import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Action log');

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    this.log('before', this.state.count);
    this.log('after', this.state.count + 1);
    return new State(this.state.count + 1);
  }
}

Bdd(feature)
  .scenario('The state observer can read what the action logged.')
  .given('A store with a state observer.')
  .and('An action that logs two values while it runs.')
  .when('The action is dispatched.')
  .then('The state observer gets the logged values, in order, by calling getLog().')
  .run(async (_) => {
    let observedLog: { key: string, value: any }[] | undefined;

    const store = new Store<State>({
      initialState: new State(1),
      logger: null,
      stateObserver: (action) => {
        observedLog = action.getLog();
      },
    });

    await store.dispatchAndWait(new Increment());

    expect(observedLog).toEqual([
      { key: 'before', value: 1 },
      { key: 'after', value: 2 },
    ]);
  });
