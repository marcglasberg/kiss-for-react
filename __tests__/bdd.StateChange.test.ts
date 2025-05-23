import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { Store, KissAction } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('State change');
const logger = (obj: any) => process.stdout.write(obj + '\n');

test('Test fixture', async () => {
  expect(new State('Mary', 30).userName).toBe('Mary');
});

Bdd(feature)
  .scenario('Change state by dispatching a SYNC action.')
  .given('State has user name Mary and age 30.')
  .when('A sync action is dispatched to change the name to Lisa.')
  .then('The name changes and the age stays the same.')
  .run((_) => {

    const store = new Store<State>({
      initialState: new State('Mary', 30),
      logger: logger
    });

    store.dispatch(new ChangeNameSync('Lisa'));

    expect(store.state.userName).toBe('Lisa');
    expect(store.state.age).toBe(30);
  });

Bdd(feature)
  .scenario('Change state by dispatching an ASYNC action.')
  .given('State has user name Mary and age 30.')
  .when('An async action is dispatched to change the name to Lisa.')
  .then('The name changes and the age stays the same.')
  .run(async (_) => {

    const store = new Store<State>({
      initialState: new State('Mary', 30),
      logger: logger
    });

    await store.dispatchAndWait(new ChangeNameAsync('Lisa'));

    expect(store.state.userName).toBe('Lisa');
    expect(store.state.age).toBe(30);
  });


class State {
  constructor(readonly userName: string, readonly age: number) {
  }
}

class ChangeNameSync extends KissAction<State> {
  constructor(readonly newName: string) {
    super();
  }

  reduce() {
    return new State(this.newName, this.state.age);
  }
}

class ChangeNameAsync extends KissAction<State> {
  constructor(readonly newName: string) {
    super();
  }

  async reduce() {
    await delayMillis(50);
    return (state: State) => new State(this.newName, state.age);
  }
}
