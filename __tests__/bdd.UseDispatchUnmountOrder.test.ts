import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { KissAction, Store, StoreProvider, useDispatch } from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useDispatch onUnmount order');

Bdd(feature)
  .scenario('When a component is replaced by one with another key, the old onUnmount runs before the new onMount.')
  .given('A component that uses useDispatch.')
  .and('Its onMount selects its id, and its onUnmount clears the selection.')
  .and('The component is mounted with key and id "A".')
  .when('It is replaced by the same component with key and id "B".')
  .then('The onUnmount of "A" runs before the onMount of "B".')
  .and('"B" stays selected.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];
    const Page = createPage(log);

    const renderer = await render(store, React.createElement(Page, {key: 'A', id: 'A'}), strictMode);
    expect(log).toEqual(['mount A']);
    expect(store.state.selected).toBe('A');

    await update(renderer, store, React.createElement(Page, {key: 'B', id: 'B'}), strictMode);
    expect(log).toEqual(['mount A', 'unmount A', 'mount B']);
    expect(store.state.selected).toBe('B');
  });

Bdd(feature)
  .scenario('When a page is replaced by another page, the old onUnmount runs before the new onMount.')
  .given('Two pages that use useDispatch.')
  .and('Their onMount selects their id, and their onUnmount clears the selection.')
  .and('Page "A" is mounted.')
  .when('Page "A" is replaced by page "B", as in a route switch.')
  .then('The onUnmount of "A" runs before the onMount of "B".')
  .and('"B" stays selected.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];
    const PageA = createPage(log);
    const PageB = createPage(log);

    const renderer = await render(store, React.createElement(PageA, {id: 'A'}), strictMode);
    await update(renderer, store, React.createElement(PageB, {id: 'B'}), strictMode);

    expect(log).toEqual(['mount A', 'unmount A', 'mount B']);
    expect(store.state.selected).toBe('B');
  });

Bdd(feature)
  .scenario('onUnmount runs as soon as the component unmounts.')
  .given('A component that uses useDispatch, mounted with id "A".')
  .and('Its onUnmount clears the selection.')
  .when('The component unmounts, inside a synchronous act.')
  .then('onUnmount has already run when the act finishes.')
  .and('The selection is cleared.')
  .example(val('StrictMode', false))
  .example(val('StrictMode', true))
  .run(async (ctx) => {
    const strictMode = ctx.example.val('StrictMode') as boolean;
    const store = createStore();
    const log: string[] = [];
    const Page = createPage(log);

    const renderer = await render(store, React.createElement(Page, {id: 'A'}), strictMode);

    act(() => renderer.unmount());
    expect(log).toEqual(['mount A', 'unmount A']);
    expect(store.state.selected).toBeNull();

    // And it doesn't run again later.
    await flush();
    expect(log).toEqual(['mount A', 'unmount A']);
  });

Bdd(feature)
  .scenario('A component mounted next to another one, in StrictMode, calls onMount and onUnmount once.')
  .given('A page "A" that uses useDispatch, mounted in StrictMode.')
  .when('A page "B" is mounted next to it.')
  .and('Then both are unmounted.')
  .then('onMount and onUnmount are called once for each page.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    const Page = createPage(log);
    const pageA = React.createElement(Page, {key: 'A', id: 'A'});
    const pageB = React.createElement(Page, {key: 'B', id: 'B'});

    const renderer = await render(store, React.createElement(React.Fragment, null, pageA), true);
    await update(renderer, store, React.createElement(React.Fragment, null, pageA, pageB), true);
    expect(log).toEqual(['mount A', 'mount B']);

    await act(async () => renderer.unmount());
    await flush();
    expect(log).toEqual(['mount A', 'mount B', 'unmount A', 'unmount B']);
  });

class State {
  constructor(readonly selected: string | null) {
  }
}

class Select extends KissAction<State> {
  constructor(readonly id: string | null) {
    super();
  }

  reduce() {
    return new State(this.id);
  }
}

// Each call creates a new component type, so that two of them work like two different pages.
function createPage(log: string[]): React.FC<{ id: string }> {
  return ({id}) => {
    useDispatch({
      onMount: (s: Store<State>) => {
        log.push('mount ' + id);
        s.dispatch(new Select(id));
      },
      onUnmount: (s: Store<State>) => {
        log.push('unmount ' + id);
        s.dispatch(new Select(null));
      },
    });
    return null;
  };
}

function createStore() {
  return new Store<State>({initialState: new State(null), logger: () => {}});
}

function wrap(store: Store<State>, child: React.ReactElement, strictMode: boolean) {
  const provider = React.createElement(StoreProvider<State>, {store, children: child});
  return strictMode ? React.createElement(React.StrictMode, null, provider) : provider;
}

async function render(store: Store<State>, child: React.ReactElement, strictMode: boolean) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(wrap(store, child, strictMode));
  });
  await flush();
  return renderer;
}

async function update(renderer: ReactTestRenderer, store: Store<State>, child: React.ReactElement, strictMode: boolean) {
  await act(async () => {
    renderer.update(wrap(store, child, strictMode));
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
