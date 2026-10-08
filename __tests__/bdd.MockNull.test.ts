import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Mocking an action with null');

class State {
  constructor(readonly count: number) {
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class AsyncIncrement extends KissAction<State> {
  async reduce() {
    return (state: State) => new State(state.count + 1);
  }
}

Bdd(feature)
  .scenario('Mocking an action with null aborts its dispatch.')
  .given('An action is mocked with null.')
  .when('The action is dispatched.')
  .then('No error is thrown.')
  .and('The state does not change.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1)});
    store.mocks.add(Increment, null);

    expect(() => store.dispatch(new Increment())).not.toThrow();
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Mocking an action with null aborts its dispatchSync.')
  .given('A sync action is mocked with null.')
  .when('The action is dispatched with dispatchSync.')
  .then('No error is thrown.')
  .and('The state does not change.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1)});
    store.mocks.add(Increment, null);

    expect(() => store.dispatchSync(new Increment())).not.toThrow();
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Mocking an async action with null aborts its dispatchAndWait.')
  .given('An async action is mocked with null.')
  .when('The action is dispatched with dispatchAndWait.')
  .then('The returned promise resolves.')
  .and('The state does not change.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1)});
    store.mocks.add(AsyncIncrement, null);

    await expect(store.dispatchAndWait(new AsyncIncrement())).resolves.toBeDefined();
    expect(store.state.count).toBe(1);
  });

Bdd(feature)
  .scenario('Removing a null mock makes the action work again.')
  .given('An action is mocked with null.')
  .and('The mock is removed.')
  .when('The action is dispatched.')
  .then('The action changes the state.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1)});
    store.mocks.add(Increment, null);
    store.mocks.remove(Increment);

    store.dispatch(new Increment());
    expect(store.state.count).toBe(2);
  });
