/** @jest-environment jsdom */
import { expect } from '@jest/globals';
import { Bdd, Feature } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import { Store, StoreProvider, StoreSlice, useSelect, useDispatch, KissAction } from '../src';
import { ErrorBoundary, mount, unmountAll } from './fixtures/dom';

afterEach(unmountAll);
const feature = new Feature('Audit of store slices');
type State = { user: { name: string } | null; count: number; route: string };
const initialState: State = { user: null, count: 0, route: '' };
class Increment extends KissAction<State> {
  reduce() { return { ...this.state, count: this.state.count + 1 }; }
}

Bdd(feature)
  .scenario('Replacing a provider store changes the state read inside an existing slice.')
  .given('A store with count one and a mounted slice, and a second store with count ten.')
  .when('The provider switches to the second store and a component dispatches an increment.')
  .then('The component reads count eleven from the second store.')
  .run(async () => {
    const first = new Store<State>({ initialState: { ...initialState, count: 1 }, logger: null });
    const second = new Store<State>({ initialState: { ...initialState, count: 10 }, logger: null });
    let dispatch!: (action: KissAction<State>) => void;
    function View() {
      dispatch = useDispatch();
      const count = useSelect((s: State) => s.count);
      return <span>{count}</span>;
    }
    const page = (store: Store<State>) => <StoreProvider store={store}>
      <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
    </StoreProvider>;
    const app = await mount(page(first));
    expect(app.text()).toBe('1');
    await app.rerender(page(second));
    await act(async () => dispatch(new Increment()));
    expect(second.state.count).toBe(11);
    expect(app.text()).toBe('11');
  });

Bdd(feature)
  .scenario('A nested slice reads data from its parent slice on the first render.')
  .given('A store with no user and nested slices that provide a user and a route.')
  .when('The nested slices mount together.')
  .then('Every render inside the inner slice reads the user supplied by the outer slice.')
  .run(async () => {
    const store = new Store<State>({ initialState, logger: null });
    const names: Array<string | undefined> = [];
    function View() {
      const user = useSelect((s: State) => s.user);
      names.push(user?.name);
      return <span>{user?.name}</span>;
    }
    const app = await mount(<StoreProvider store={store}>
      <StoreSlice state={{ user: { name: 'Ann' } }}>
        <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    expect(app.text()).toBe('Ann');
    expect(names[0]).toBe('Ann');
  });

Bdd(feature)
  .scenario('Nested slices can use the user that their parent supplied.')
  .given('The store has no user and an outer slice supplies a loaded user.')
  .when('An inner slice reads the name of the loaded user.')
  .then('The loaded user is available and rendering succeeds.')
  .run(async () => {
    const store = new Store<State>({ initialState, logger: null });
    function View() {
      const name = useSelect((s: State) => s.user!.name);
      return <span>{name}</span>;
    }
    const app = await mount(<ErrorBoundary><StoreProvider store={store}>
      <StoreSlice state={{ user: { name: 'Ann' } }}>
        <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
      </StoreSlice>
    </StoreProvider></ErrorBoundary>);
    expect(app.text()).toBe('Ann');
  });
