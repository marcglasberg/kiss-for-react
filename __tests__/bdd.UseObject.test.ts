import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useObject, useSelect } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useObject');

Bdd(feature)
  .scenario('useObject does not rebuild the component when other parts of the state change.')
  .given('A component that uses useObject to select the name and the age.')
  .when('An action changes another part of the state.')
  .then('The component does not rebuild.')
  .and('It still gets the same object.')
  .run(async (_) => {
    const store = createStore();
    const results: { name: string, age: number }[] = [];

    render(store, () => {
      results.push(useObject((state: State) => ({name: state.name, age: state.age})));
      return null;
    });
    expect(results).toEqual([{name: 'Mary', age: 30}]);

    act(() => store.dispatch(new SetOther('changed')));
    act(() => store.dispatch(new SetOther('changed again')));
    expect(results.length).toBe(1);
  });

Bdd(feature)
  .scenario('useObject rebuilds the component when one of the selected values changes.')
  .given('A component that uses useObject to select the name and the age.')
  .when('An action changes the age.')
  .then('The component rebuilds, with the new age.')
  .run(async (_) => {
    const store = createStore();
    const results: { name: string, age: number }[] = [];

    render(store, () => {
      results.push(useObject((state: State) => ({name: state.name, age: state.age})));
      return null;
    });

    act(() => store.dispatch(new SetAge(31)));
    expect(results).toEqual([{name: 'Mary', age: 30}, {name: 'Mary', age: 31}]);
  });

Bdd(feature)
  .scenario('useObject returns the same object while the selected values are the same.')
  .given('A component that uses useObject to select the name and the age.')
  .when('The component rebuilds for another reason.')
  .then('useObject returns the same object as before.')
  .run(async (_) => {
    const store = createStore();
    const results: { name: string, age: number }[] = [];

    // The component also selects `other`, so it rebuilds when `other` changes.
    render(store, () => {
      useSelect((state: State) => state.other);
      results.push(useObject((state: State) => ({name: state.name, age: state.age})));
      return null;
    });

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(2);
    expect(results[1]).toBe(results[0]);
  });

Bdd(feature)
  .scenario('useObject also works when the selector returns an array.')
  .given('A component that uses useObject to select the name and the age, as an array.')
  .when('An action changes another part of the state.')
  .and('Then an action changes the name.')
  .then('The component only rebuilds when the name changes.')
  .run(async (_) => {
    const store = createStore();
    const results: [string, number][] = [];

    render(store, () => {
      results.push(useObject((state: State): [string, number] => [state.name, state.age]));
      return null;
    });

    act(() => store.dispatch(new SetOther('changed')));
    expect(results).toEqual([['Mary', 30]]);

    act(() => store.dispatch(new SetName('Anna')));
    expect(results).toEqual([['Mary', 30], ['Anna', 30]]);
  });

Bdd(feature)
  .scenario('useSelect with a selector that creates a new object renders once when the component mounts.')
  .given('A component that uses useSelect to select an object with the name and the age.')
  .when('The component mounts.')
  .then('It renders once (it does not rebuild forever).')
  .run(async (_) => {
    const store = createStore();
    let renders = 0;

    render(store, () => {
      // Stops a render loop, so that the test fails instead of hanging.
      if (++renders > 20) throw new Error('Render loop.');
      useSelect((state: State) => ({name: state.name, age: state.age}));
      return null;
    });
    expect(renders).toBe(1);
  });

Bdd(feature)
  .scenario('useSelect with a selector that creates a new object rebuilds for all state changes.')
  .given('A component that uses useSelect to select an object with the name and the age.')
  .when('An action changes another part of the state.')
  .then('The component rebuilds anyway, since the selector creates a new object each time.')
  .and('That is why useObject is needed.')
  .run(async (_) => {
    const store = createStore();
    const results: { name: string, age: number }[] = [];

    render(store, () => {
      // Stops a render loop, so that the test fails instead of hanging.
      if (results.length > 20) throw new Error('Render loop.');
      results.push(useSelect((state: State) => ({name: state.name, age: state.age})));
      return null;
    });
    expect(results.length).toBe(1);

    act(() => store.dispatch(new SetOther('changed')));
    expect(results.length).toBe(2);
  });

class State {
  constructor(readonly name: string, readonly age: number, readonly other: string) {
  }
}

class SetName extends KissAction<State> {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return new State(this.name, this.state.age, this.state.other);
  }
}

class SetAge extends KissAction<State> {
  constructor(readonly age: number) {
    super();
  }

  reduce() {
    return new State(this.state.name, this.age, this.state.other);
  }
}

class SetOther extends KissAction<State> {
  constructor(readonly other: string) {
    super();
  }

  reduce() {
    return new State(this.state.name, this.state.age, this.other);
  }
}

function createStore() {
  return new Store<State>({initialState: new State('Mary', 30, 'initial'), logger: () => {}});
}

function render(store: Store<State>, component: React.FC) {
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, {store, children: React.createElement(component)}));
  });
}
