import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Mocks of actions whose constructor has parameters');

// Note: these BDDs also check the types. If `store.mocks.remove` or `store.mocks.get` don't
// accept an action type whose constructor has parameters, this file doesn't compile.

Bdd(feature)
  .scenario('The mock of an action whose constructor has a parameter can be removed.')
  .given('An action whose constructor has a parameter.')
  .and('The action is mocked.')
  .when('The mock is removed, using the action type.')
  .then('Dispatching the action runs the original action again.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(AddAction, (action) => new AddAction(-action.value));
    store.dispatch(new AddAction(5));
    expect(store.state.count).toBe(-5);

    // When
    store.mocks.remove(AddAction);

    // Then
    store.dispatch(new AddAction(5));
    expect(store.state.count).toBe(0);
  });

Bdd(feature)
  .scenario('The mock of an action whose constructor has several parameters can be removed.')
  .given('An action whose constructor has several parameters, of different types.')
  .and('The action is mocked.')
  .when('The mock is removed, using the action type.')
  .then('Dispatching the action runs the original action again.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(AddTimesAction, (action) => new AddAction(-action.value));
    store.dispatch(new AddTimesAction(5, 3, 'add'));
    expect(store.state.count).toBe(-5);

    // When
    store.mocks.remove(AddTimesAction);

    // Then
    store.dispatch(new AddTimesAction(5, 3, 'add'));
    expect(store.state.count).toBe(10);
  });

Bdd(feature)
  .scenario('Removing the mock of an action with parameters keeps the mocks of other actions.')
  .given('An action whose constructor has a parameter, and an action without parameters.')
  .and('Both actions are mocked.')
  .when('The mock of the action with a parameter is removed.')
  .then('Dispatching the action with a parameter runs the original action.')
  .and('Dispatching the action without parameters still runs its mock.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(AddAction, (_) => null);
    store.mocks.add(IncrementAction, (_) => new AddAction(100));

    // When
    store.mocks.remove(AddAction);

    // Then
    store.dispatch(new AddAction(5));
    expect(store.state.count).toBe(5);

    store.dispatch(new IncrementAction());
    expect(store.state.count).toBe(105);
  });

Bdd(feature)
  .scenario('Removing the mock of an action with parameters that was not mocked does nothing.')
  .given('An action whose constructor has a parameter, which is not mocked.')
  .and('Another action is mocked.')
  .when('The mock of the action with a parameter is removed.')
  .then('Dispatching the action with a parameter runs the original action.')
  .and('The other action is still mocked.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(IncrementAction, (_) => new AddAction(100));

    // When
    expect(() => store.mocks.remove(AddAction)).not.toThrow();

    // Then
    store.dispatch(new AddAction(5));
    expect(store.state.count).toBe(5);

    store.dispatch(new IncrementAction());
    expect(store.state.count).toBe(105);
  });

Bdd(feature)
  .scenario('The mock of an action whose constructor has parameters can be read.')
  .given('An action whose constructor has a parameter.')
  .and('The action is mocked.')
  .when('The mock is read, using the action type.')
  .then('We get the mock function, which accepts that action and returns the mock action.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(AddAction, (action) => new AddAction(-action.value));

    // When
    const mockFunction = store.mocks.get(AddAction);

    // Then
    expect(mockFunction).toBeDefined();

    // The mock function accepts an `AddAction`, so it can read its fields.
    const accepts: ((action: AddAction) => KissAction<State> | null) | undefined = mockFunction;
    const mockAction = accepts!(new AddAction(5));
    expect(mockAction).toBeInstanceOf(AddAction);
    expect((mockAction as AddAction).value).toBe(-5);
  });

Bdd(feature)
  .scenario('After the mock of an action with parameters is removed, reading it gives nothing.')
  .given('An action whose constructor has a parameter.')
  .and('The action is mocked.')
  .when('The mock is removed.')
  .then('Reading the mock of that action type gives undefined.')
  .run(async (_) => {
    // Given
    const store = new Store<State>({ initialState: new State(0) });
    store.mocks.add(AddAction, (_) => null);
    expect(store.mocks.get(AddAction)).toBeDefined();

    // When
    store.mocks.remove(AddAction);

    // Then
    expect(store.mocks.get(AddAction)).toBeUndefined();
  });

class State {
  constructor(readonly count: number) {
  }
}

class IncrementAction extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
  }
}

class AddAction extends KissAction<State> {
  constructor(readonly value: number) {
    super();
  }

  reduce() {
    return new State(this.state.count + this.value);
  }
}

class AddTimesAction extends KissAction<State> {
  constructor(readonly value: number, readonly times: number, readonly description: string) {
    super();
  }

  reduce() {
    return new State(this.state.count + this.value * this.times);
  }
}
