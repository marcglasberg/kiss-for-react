import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useIsWaiting } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useIsWaiting with action subclasses');

class State {
  constructor(readonly count: number) {}
}

abstract class BaseAction extends KissAction<State> {}

class SubAction extends BaseAction {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return (state: State) => new State(state.count + 1);
  }
}

class SubSubAction extends SubAction {}

function createStore() {
  return new Store<State>({ initialState: new State(0), logger: () => {} });
}

/** Renders a component that calls `useIsWaiting(type)` and records what it returns on every render. */
function renderRecording(store: Store<State>, type: abstract new (...args: any[]) => KissAction<State>) {
  const results: boolean[] = [];
  const Comp: React.FC = () => {
    results.push(useIsWaiting(type));
    return null;
  };
  act(() => {
    TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
  });
  return results;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

Bdd(feature)
  .scenario('Waiting for a base class re-renders when a subclass action starts and finishes.')
  .given('A component that waits for a base action class.')
  .when('An action of a subclass of that base class is dispatched, and later finishes.')
  .then('The component re-renders showing it is waiting.')
  .and('The component re-renders again showing it is no longer waiting.')
  .run(async (_) => {
    const store = createStore();
    const results = renderRecording(store, BaseAction);
    expect(results).toEqual([false]);

    const d = deferred();
    await act(async () => {
      store.dispatch(new SubAction(d.promise));
    });
    expect(results[results.length - 1]).toBe(true);

    await act(async () => {
      d.resolve();
      await store.waitAllActions([]);
    });
    expect(results[results.length - 1]).toBe(false);
    expect(results).toEqual([false, true, false]);
  });

Bdd(feature)
  .scenario('Waiting for a class re-renders when an action of a deeper subclass starts.')
  .given('A component that waits for an action class.')
  .when('An action of a subclass of a subclass of that class is dispatched.')
  .then('The component re-renders showing it is waiting.')
  .run(async (_) => {
    const store = createStore();
    const results = renderRecording(store, SubAction);

    const d = deferred();
    await act(async () => {
      store.dispatch(new SubSubAction(d.promise));
    });
    expect(results[results.length - 1]).toBe(true);

    await act(async () => {
      d.resolve();
      await store.waitAllActions([]);
    });
    expect(results[results.length - 1]).toBe(false);
  });

Bdd(feature)
  .scenario('Waiting for an exact class still re-renders when that class starts.')
  .given('A component that waits for an action class.')
  .when('An action of that exact class is dispatched, and later finishes.')
  .then('The component shows it is waiting, and then that it is no longer waiting.')
  .run(async (_) => {
    const store = createStore();
    const results = renderRecording(store, SubAction);

    const d = deferred();
    await act(async () => {
      store.dispatch(new SubAction(d.promise));
    });
    expect(results[results.length - 1]).toBe(true);

    await act(async () => {
      d.resolve();
      await store.waitAllActions([]);
    });
    expect(results).toEqual([false, true, false]);
  });

Bdd(feature)
  .scenario('Waiting for a subclass does not show waiting when only the base class is in progress.')
  .given('A component that waits for a subclass.')
  .when('An action of the parent class (not the subclass) is dispatched.')
  .then('The component keeps showing it is not waiting.')
  .run(async (_) => {
    const store = createStore();
    const results = renderRecording(store, SubSubAction);

    const d = deferred();
    await act(async () => {
      store.dispatch(new SubAction(d.promise));
    });
    expect(results[results.length - 1]).toBe(false);

    await act(async () => {
      d.resolve();
      await store.waitAllActions([]);
    });
    expect(results.every((r) => r === false)).toBe(true);
  });

Bdd(feature)
  .scenario('The store and actions can check if they are waiting for an abstract base action class.')
  .given('An abstract base action class.')
  .and('A subclass action is running.')
  .when('isWaiting is called with the abstract base class, from the store and from an action.')
  .then('It returns true.')
  .run(async (_) => {
    const store = createStore();
    const d = deferred();
    store.dispatch(new SubAction(d.promise));

    class CheckAction extends KissAction<State> {
      reduce() {
        expect(this.isWaiting(BaseAction)).toBe(true);
        return null;
      }
    }

    expect(store.isWaiting(BaseAction)).toBe(true);
    store.dispatchSync(new CheckAction());

    d.resolve();
    await store.waitAllActions([]);
    expect(store.isWaiting(BaseAction)).toBe(false);
  });
