import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  KissAction,
  Store,
  StoreProvider,
  UserException,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  useSelect,
} from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Hooks with a changing selector');

class State {
  constructor(readonly items: string[]) {}
}

class SetItem extends KissAction<State> {
  constructor(readonly index: number, readonly value: string) {
    super();
  }

  reduce() {
    const items = [...this.state.items];
    items[this.index] = this.value;
    return new State(items);
  }
}

class FailA extends KissAction<State> {
  reduce(): State {
    throw new UserException('A failed');
  }
}

class FailB extends KissAction<State> {
  reduce(): State {
    throw new UserException('B failed');
  }
}

class SlowA extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return null;
  }
}

class SlowB extends SlowA {
}

function createStore() {
  return new Store<State>({ initialState: new State(['a', 'b', 'c']), logger: () => {} });
}

/** Renders `element` inside a StoreProvider, and returns a function that re-renders it with new props. */
function renderWithStore(store: Store<State>, component: React.FC<any>, props: any) {
  let renderer!: TestRenderer.ReactTestRenderer;
  const element = (p: any) => React.createElement(StoreProvider<State>, { store, children: React.createElement(component, p) });
  act(() => {
    renderer = TestRenderer.create(element(props));
  });
  return {
    text: () => JSON.stringify(renderer.toJSON()),
    rerender: (newProps: any) => act(() => renderer.update(element(newProps))),
  };
}

const Item: React.FC<{ id: number }> = ({ id }) =>
  React.createElement(React.Fragment, null, useSelect((s: State) => s.items[id]));

Bdd(feature)
  .scenario('useSelect uses the new selector when the component re-renders with new props.')
  .given('A component that selects the item with the id it gets as a prop.')
  .and('It is rendered with id 0, so it shows the first item.')
  .when('It is re-rendered with id 1.')
  .then('It shows the second item.')
  .run(async (_) => {
    const store = createStore();
    const r = renderWithStore(store, Item, { id: 0 });
    expect(r.text()).toBe('"a"');

    r.rerender({ id: 1 });
    expect(r.text()).toBe('"b"');
  });

Bdd(feature)
  .scenario('After the selector changes, state changes are checked with the new selector.')
  .given('A component that selects the item with the id it gets as a prop.')
  .and('It was rendered with id 0, and then re-rendered with id 1.')
  .when('The item with id 1 changes in the state.')
  .and('Later, the item with id 0 changes in the state.')
  .then('The component shows the new value of item 1.')
  .and('It keeps showing it after item 0 changes.')
  .run(async (_) => {
    const store = createStore();
    const r = renderWithStore(store, Item, { id: 0 });
    r.rerender({ id: 1 });

    act(() => store.dispatch(new SetItem(1, 'B')));
    expect(r.text()).toBe('"B"');

    act(() => store.dispatch(new SetItem(0, 'A')));
    expect(r.text()).toBe('"B"');
  });

Bdd(feature)
  .scenario('useSelect shows the right value after switching back to a selector whose value changed meanwhile.')
  .given('A component rendered with id 0, then re-rendered with id 1.')
  .and('While it shows id 1, the item with id 0 changes in the state.')
  .when('It is re-rendered with id 0 again.')
  .then('It shows the new value of item 0.')
  .run(async (_) => {
    const store = createStore();
    const r = renderWithStore(store, Item, { id: 0 });
    r.rerender({ id: 1 });
    act(() => store.dispatch(new SetItem(0, 'A')));
    expect(r.text()).toBe('"b"');

    r.rerender({ id: 0 });
    expect(r.text()).toBe('"A"');
  });

const Failed: React.FC<{ type: any }> = ({ type }) => {
  const failed = useIsFailed(type);
  const error = useExceptionFor(type);
  return React.createElement(React.Fragment, null, `${failed}:${error?.message ?? 'none'}`);
};

Bdd(feature)
  .scenario('useIsFailed and useExceptionFor use the new action type when it changes.')
  .given('Action type A failed, and action type B did not.')
  .and('A component shows if type A failed, and its error.')
  .when('It is re-rendered for type B.')
  .then('It shows that type B did not fail, and has no error.')
  .and('When type B fails later, it shows that, with the error of B.')
  .run(async (_) => {
    const store = createStore();
    store.dispatch(new FailA());
    const r = renderWithStore(store, Failed, { type: FailA });
    expect(r.text()).toBe('"true:A failed"');

    r.rerender({ type: FailB });
    expect(r.text()).toBe('"false:none"');

    act(() => store.dispatch(new FailB()));
    expect(r.text()).toBe('"true:B failed"');
  });

const Waiting: React.FC<{ type: any }> = ({ type }) =>
  React.createElement(React.Fragment, null, `${useIsWaiting(type)}`);

Bdd(feature)
  .scenario('useIsWaiting uses the new action type when it changes.')
  .given('Action type A is running, and action type B is not.')
  .and('A component shows if type A is running.')
  .when('It is re-rendered for type B.')
  .then('It shows that type B is not running.')
  .and('When type B starts later, it shows that it is running.')
  .run(async (_) => {
    const store = createStore();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    store.dispatch(new SlowA(finished));
    const r = renderWithStore(store, Waiting, { type: SlowA });
    expect(r.text()).toBe('"true"');

    r.rerender({ type: SlowB });
    expect(r.text()).toBe('"false"');

    act(() => store.dispatch(new SlowB(finished)));
    expect(r.text()).toBe('"true"');

    await act(async () => {
      finish();
      await store.waitAllActions([]);
    });
    expect(r.text()).toBe('"false"');
  });
