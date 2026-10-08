import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { useEffect } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { KissAction, Persistor, Store, StoreProvider, useDispatch, useSelect } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Hooks subscribing to the store');

class State {
  constructor(readonly count: number, readonly items: string[]) {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1, this.state.items);
  }
}

class RemoveLast extends KissAction<State> {
  reduce() {
    return new State(this.state.count, this.state.items.slice(0, -1));
  }
}

class SavingPersistor extends Persistor<State> {
  savedState: State | null = null;

  async readState(): Promise<State | null> {
    return this.savedState;
  }

  async saveInitialState(state: State) {
    this.savedState = state;
  }

  async deleteState() {
    this.savedState = null;
  }

  async persistDifference(_: State | null, newState: State) {
    this.savedState = newState;
  }

  get throttle(): number | null {
    return 0;
  }
}

function render(store: Store<State>, component: React.FC) {
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(StoreProvider<State>, { store, children: React.createElement(component) }));
  });
  return () => JSON.stringify(renderer.toJSON());
}

// --- #14

const ChildThatIncrementsOnMount: React.FC = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    dispatch(new Increment());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const ParentShowingCount: React.FC = () => {
  const count = useSelect((s: State) => s.count);
  return React.createElement(React.Fragment, null, `count=${count}`, React.createElement(ChildThatIncrementsOnMount));
};

Bdd(feature)
  .scenario('useSelect sees a state change made before it subscribed to the store.')
  .given('A component that shows the count.')
  .and('Its child changes the count when it mounts, before the parent subscribes to the store.')
  .when('The component is rendered.')
  .then('It shows the new count.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0, []), logger: () => {} });
    const text = render(store, ParentShowingCount);
    expect(store.state.count).toBe(1);
    expect(text()).toBe('"count=1"');
  });

// --- #15

const Item: React.FC<{ id: number }> = ({ id }) =>
  React.createElement(React.Fragment, null, useSelect((s: State) => s.items[id].toUpperCase()));

const List: React.FC = () => {
  const count = useSelect((s: State) => s.items.length);
  return React.createElement(React.Fragment, null,
    ...Array.from({ length: count }, (_, id) => React.createElement(Item, { key: id, id })));
};

Bdd(feature)
  .scenario('A selector that throws for a removed item does not make the action fail.')
  .given('A list that shows its items, where each item component selects its item by id.')
  .and('The selector of an item throws if its item no longer exists.')
  .when('An action removes the last item.')
  .then('The action does not fail, and the dispatch does not throw.')
  .and('The state changes, and the list no longer shows the removed item.')
  .run(async (_) => {
    const store = new Store<State>({ initialState: new State(0, ['a', 'b']), logger: () => {} });
    const text = render(store, List);
    expect(text()).toBe('["A","B"]');

    const action = new RemoveLast();
    act(() => store.dispatch(action));

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.status.isCompletedFailed).toBe(false);
    expect(store.state.items).toEqual(['a']);
    expect(text()).toBe('"A"');
  });

Bdd(feature)
  .scenario('A selector that throws for a removed item does not stop the rest of the state change processing.')
  .given('A list that shows its items, where each item component selects its item by id.')
  .and('The store has a persistor and a state observer.')
  .and('Some code is waiting for the list to have a single item.')
  .when('An action removes the last item.')
  .then('The state observer sees the change, with no error.')
  .and('The new state is persisted.')
  .and('The waiting code is released.')
  .run(async (_) => {
    const persistor = new SavingPersistor();
    const observed: any[] = [];
    const store = new Store<State>({
      initialState: new State(0, ['a', 'b']),
      persistor,
      logger: () => {},
      stateObserver: (_action, _prev, newState, error) => observed.push([newState.items, error]),
    });
    await delayMillis(20); // Initial state is read and saved.
    render(store, List);

    let released = false;
    store.waitCondition((s) => s.items.length === 1, {timeoutMillis: 1000}).then(() => released = true);

    act(() => store.dispatch(new RemoveLast()));
    await delayMillis(20);

    expect(observed).toEqual([[['a'], null]]);
    expect(persistor.savedState?.items).toEqual(['a']);
    expect(released).toBe(true);
  });
