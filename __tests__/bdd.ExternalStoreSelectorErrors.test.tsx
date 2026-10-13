/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act } from 'react';
import { RootOptions } from 'react-dom/client';
import { KissAction, Store, StoreProvider, useObject, useSelect } from '../src';
import { ErrorBoundary, failOnConsoleErrors, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';

// Scenario IDs F01 to F07 of STATE_REFACTOR.md. See also `bdd.UseSelectSubscription.test.ts`.

reporter(new FeatureFileReporter());
// React logs the errors caught by error boundaries. Those are expected in this file.
failOnConsoleErrors([/selector failed|equality failed|The above error occurred|%o|error boundary/]);
afterEach(unmountAll);

const feature = new Feature('Selector errors are handled by React, and never break the store');

class State {
  constructor(readonly items: readonly string[], readonly count: number = 0) {}
}

class RemoveLast extends KissAction<State> {
  reduce() {
    return new State(this.state.items.slice(0, -1), this.state.count);
  }
}

class SetItems extends KissAction<State> {
  constructor(readonly items: readonly string[]) {
    super();
  }

  reduce() {
    return new State(this.items, this.state.count);
  }
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.items, this.state.count + 1);
  }
}

/** Shows an item in upper case: the selector throws if the item does not exist. */
const Item: React.FC<{ id: number }> = ({ id }) => {
  const item = useSelect((s: State) => {
    const value = s.items[id];
    if (value === undefined) throw new Error(`selector failed for item ${id}`);
    return value.toUpperCase();
  });
  return <span>{item}</span>;
};

/** Shows all items, one `Item` component per index. */
const List: React.FC = () => {
  const length = useSelect((s: State) => s.items.length);
  return <>{Array.from({ length }, (_, id) => <Item key={id} id={id} />)}</>;
};

/** A healthy sibling, which shows the count and records its commits. */
function counter() {
  const commits: number[] = [];
  const Count: React.FC = () => {
    const count = useSelect((s: State) => s.count);
    useCommitProbe(commits, () => count);
    return <span>{`count=${count}`}</span>;
  };
  return { Count, commits };
}

/** Counts the active state subscriptions of the store. */
function countStateListeners(store: Store<State>) {
  const count = { active: 0 };
  const subscribe = store._subscribeState;
  store._subscribeState = (listener) => {
    count.active++;
    const unsubscribe = subscribe(listener);
    return () => {
      count.active--;
      unsubscribe();
    };
  };
  return count;
}

const rootOptions = { onCaughtError: () => {} } as RootOptions;

Bdd(feature)
  .scenario('A selector that throws for a removed item does not fail the action, and the item disappears.')
  .given('A list showing its items, where each item component selects its item by index, and throws if it is gone.')
  .when('An action removes the last item.')
  .then('The dispatch does not throw, and the action completes with no error.')
  .and('The list no longer shows the removed item.')
  .run(async (_) => {
    // F01
    const store = new Store<State>({ initialState: new State(['a', 'b']), logger: () => {} });
    const m = await mount(<StoreProvider store={store}><List /></StoreProvider>, { rootOptions });
    expect(m.text()).toBe('AB');

    const action = new RemoveLast();
    await act(async () => store.dispatch(action));

    expect(action.status.isCompletedOk).toBe(true);
    expect(action.status.isCompletedFailed).toBe(false);
    expect(store.state.items).toEqual(['a']);
    expect(m.text()).toBe('A');
  });

Bdd(feature)
  .scenario('A selector that throws for a removed item does not stop the rest of the state change processing.')
  .given('The same list, plus a healthy sibling showing the count, a persistor, a state observer, a recorder, and code waiting for the change.')
  .when('An action removes the last item.')
  .then('The sibling shows the new state, the observer and the recorder saw the change with no error.')
  .and('The new state is persisted, and the waiting code is released.')
  .run(async (_) => {
    // F02
    const persistor = new ControlledPersistor<State>({ stateToRead: null, holdRead: false });
    const observed: unknown[] = [];
    const store = new Store<State>({
      initialState: new State(['a', 'b']), persistor, logger: () => {},
      stateObserver: (_action, _prev, next, error) => observed.push([next.items, error]),
    });
    await store.ready();
    store.record.start();
    const { Count, commits } = counter();
    const m = await mount(<StoreProvider store={store}><List /><Count /></StoreProvider>, { rootOptions });

    let released = false;
    const wait = store.waitCondition((s) => s.items.length === 1, { timeoutMillis: 1000 }).then(() => released = true);

    await act(async () => {
      store.dispatch(new RemoveLast());
      store.dispatch(new Increment());
      await wait;
    });

    expect(m.text()).toBe('Acount=1');
    expect(commits).toEqual([0, 1]);
    expect(observed).toEqual([[['a'], null], [['a'], null]]);
    expect(store.record.result().length).toBe(4);
    expect(persistor.persistedStates.map((s) => s.items)).toEqual([['a'], ['a']]);
    expect(released).toBe(true);
  });

Bdd(feature)
  .scenario('A selector that keeps throwing after a state change reaches the error boundary, without faking a stale value.')
  .given('A mounted item component for index 0, inside an error boundary, plus a healthy sibling showing the count.')
  .when('An action empties the items, so the selector of the item throws from now on.')
  .then('The error boundary shows the selector error.')
  .and('The action completed with no error, and the sibling still updates for later changes.')
  .run(async (_) => {
    // F03
    const store = new Store<State>({ initialState: new State(['a']), logger: () => {} });
    const errors: string[] = [];
    const { Count, commits } = counter();
    const m = await mount(
      <StoreProvider store={store}>
        <ErrorBoundary onError={(e) => errors.push(e.message)}><Item id={0} /></ErrorBoundary>
        <Count />
      </StoreProvider>,
      { rootOptions },
    );
    expect(m.text()).toBe('Acount=0');

    const action = new SetItems([]);
    await act(async () => store.dispatch(action));

    expect(action.status.isCompletedOk).toBe(true);
    expect(errors).toEqual(['selector failed for item 0']);
    expect(m.text()).toBe('error:selector failed for item 0count=0');

    await act(async () => store.dispatch(new Increment()));
    expect(m.text()).toBe('error:selector failed for item 0count=1');
    expect(commits).toEqual([0, 1]);
  });

Bdd(feature)
  .scenario('A selector that throws when the component mounts reaches the error boundary, and leaves no subscription.')
  .given('An item component for an index that does not exist, inside an error boundary.')
  .when('It is mounted.')
  .then('The error boundary shows the selector error.')
  .and('No subscription to the store was left behind.')
  .run(async (_) => {
    // F04
    const store = new Store<State>({ initialState: new State([]), logger: () => {} });
    const listeners = countStateListeners(store);
    const errors: string[] = [];
    const m = await mount(
      <StoreProvider store={store}>
        <ErrorBoundary onError={(e) => errors.push(e.message)}><Item id={0} /></ErrorBoundary>
      </StoreProvider>,
      { rootOptions },
    );
    expect(errors).toEqual(['selector failed for item 0']);
    expect(m.text()).toBe('error:selector failed for item 0');
    expect(listeners.active).toBe(0);
  });

Bdd(feature)
  .scenario('A component whose selector changes in the same batch as a state change uses the new selector.')
  .given('A mounted item component for index 1, inside an error boundary.')
  .when('In the same batch, it is rendered again for index 0, and an action removes item 1.')
  .then('It shows item 0, and the old selector (which would throw for item 1) does not reach the error boundary.')
  .run(async (_) => {
    // F05
    const store = new Store<State>({ initialState: new State(['a', 'b']), logger: () => {} });
    const errors: string[] = [];
    const element = (id: number) =>
      <StoreProvider store={store}>
        <ErrorBoundary onError={(e) => errors.push(e.message)}><Item id={id} /></ErrorBoundary>
      </StoreProvider>;
    const m = await mount(element(1), { rootOptions });
    expect(m.text()).toBe('B');

    await act(async () => {
      m.root.render(element(0));
      store.dispatch(new RemoveLast());
    });

    expect(errors).toEqual([]);
    expect(m.text()).toBe('A');
    expect(store.state.items).toEqual(['a']);
  });

Bdd(feature)
  .scenario('An error thrown while comparing selected objects is handled by rendering, and the store keeps working.')
  .given('A component using useObject whose selected object throws when its values are read after the count is 1, inside an error boundary.')
  .and('A healthy sibling showing the count.')
  .when('An action increments the count to 1, and then another increments it to 2.')
  .then('The error boundary shows the error, both actions complete with no error, and the sibling shows 2.')
  .run(async (_) => {
    // F06
    const store = new Store<State>({ initialState: new State([]), logger: () => {} });
    const errors: string[] = [];
    const { Count, commits } = counter();
    const Trap: React.FC = () => {
      const selected = useObject((s: State) => ({
        get v() {
          if (s.count >= 1) throw new Error('equality failed');
          return s.count;
        },
      }));
      return <span>{`v=${selected.v}`}</span>;
    };
    const m = await mount(
      <StoreProvider store={store}>
        <ErrorBoundary onError={(e) => errors.push(e.message)}><Trap /></ErrorBoundary>
        <Count />
      </StoreProvider>,
      { rootOptions },
    );
    expect(m.text()).toBe('v=0count=0');

    const first = new Increment();
    await act(async () => store.dispatch(first));
    expect(first.status.isCompletedOk).toBe(true);
    expect(errors).toEqual(['equality failed']);
    expect(m.text()).toBe('error:equality failedcount=1');

    const second = new Increment();
    await act(async () => store.dispatch(second));
    expect(second.status.isCompletedOk).toBe(true);
    expect(m.text()).toBe('error:equality failedcount=2');
    expect(commits).toEqual([0, 1, 2]);
  });

Bdd(feature)
  .scenario('After the error boundary is reset and the data is valid again, the component subscribes and shows fresh data.')
  .given('An item component for index 0 that failed, because the items were emptied, inside an error boundary.')
  .when('An action restores the items, and the error boundary is reset [When].')
  .then('The component shows the current item, and has exactly one subscription to the store.')
  .and('A later change of the item is shown too.')
  .example(val('When', 'after the restore'))
  .example(val('When', 'before the restore'))
  .run(async (ctx) => {
    // F07
    const resetAfter = ctx.example.val('When') === 'after the restore';
    const store = new Store<State>({ initialState: new State(['a']), logger: () => {} });
    const listeners = countStateListeners(store);
    const element = (resetKey: number) =>
      <StoreProvider store={store}>
        <ErrorBoundary resetKey={resetKey}><Item id={0} /></ErrorBoundary>
      </StoreProvider>;
    const m = await mount(element(0), { rootOptions });
    await act(async () => store.dispatch(new SetItems([])));
    expect(m.text()).toBe('error:selector failed for item 0');
    expect(listeners.active).toBe(0);

    if (resetAfter) {
      await act(async () => store.dispatch(new SetItems(['x'])));
      await m.rerender(element(1));
    } else {
      // Resetting while the data is still invalid fails again; the restore then fixes it.
      await m.rerender(element(1));
      expect(m.text()).toBe('error:selector failed for item 0');
      await act(async () => store.dispatch(new SetItems(['x'])));
      await m.rerender(element(2));
    }
    expect(m.text()).toBe('X');
    expect(listeners.active).toBe(1);

    await act(async () => store.dispatch(new SetItems(['y'])));
    expect(m.text()).toBe('Y');
    expect(listeners.active).toBe(1);
  });
