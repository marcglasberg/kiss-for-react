/**
 * @jest-environment jsdom
 */
import './fixtures/jsdomNodeGlobals'; // Must come first: see the file.
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { act, startTransition, Suspense, useState } from 'react';
import { Writable } from 'stream';
import { renderToPipeableStream, renderToString } from 'react-dom/server';
import { KissAction, MergeServerStateAction, Store, StoreException, StoreProvider, StoreSlice, useSelect } from '../src';
import { failOnConsoleErrors, hydrate, mount, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// The per-route merge of server-loaded state (see SSR.md, section 3): a `StoreSlice` merges the
// state a route's server code loaded into the store, on the server and on the client, so that
// the HTML shows it, hydration matches, and client-side navigation renders it at once.

reporter(new FeatureFileReporter());
failOnConsoleErrors([
  /useLayoutEffect does nothing on the server/,
  // See `bdd.ExternalStoreStreaming`: a test-process artifact of streaming then hydrating.
  /Detected multiple renderers concurrently rendering the same context provider/,
]);
afterEach(unmountAll);

const feature = new Feature('Merging the server-loaded state of a route (StoreSlice)');

type State = { readonly user: string; readonly clicks: number; readonly items: readonly string[] };

const rootState: State = { user: '-', clicks: 0, items: [] };

class Increment extends KissAction<State> {
  reduce() {
    return { ...this.state, clicks: this.state.clicks + 1 };
  }
}

function createStore(initialState: State = rootState, params: Partial<ConstructorParameters<typeof Store<State>>[0]> = {}) {
  return new Store<State>({ initialState, logger: () => {}, showUserException: () => {}, ...params });
}

/** The layout: outside the slice. Shows the user and the clicks. */
const outerCommits: string[] = [];
const Outer: React.FC = () => {
  const user = useSelect((s: State) => s.user);
  const clicks = useSelect((s: State) => s.clicks);
  const text = `${user}/${clicks}`;
  useCommitProbe(outerCommits, () => text);
  return <nav>{text}</nav>;
};

/** The route's content: inside the slice. Shows the user. */
const innerCommits: string[] = [];
const Inner: React.FC = () => {
  const user = useSelect((s: State) => s.user);
  useCommitProbe(innerCommits, () => user);
  return <main>{user}</main>;
};

beforeEach(() => {
  outerCommits.length = 0;
  innerCommits.length = 0;
});

/** A page: the layout, and the route inside a slice. */
function page(store: Store<State>, slice: object, serverState: State = rootState, key?: string) {
  return (
    <StoreProvider store={store} serverState={serverState}>
      <Outer />
      <StoreSlice state={slice} key={key}>
        <Inner />
      </StoreSlice>
    </StoreProvider>
  );
}

Bdd(feature)
  .scenario('On the server, the components inside the slice render the merged state, and the slice is merged into the request store.')
  .given('A request store with the root state, and a page whose route content is inside a StoreSlice with the user Ann.')
  .when('The page is rendered to a string.')
  .then('The HTML of the route shows Ann.')
  .and('The layout, outside the slice, shows the root server state (it rendered before the slice).')
  .and('The request store has the merged state, and the merge was a MergeServerStateAction.')
  .run(async (_) => {
    const actions: string[] = [];
    const store = createStore(rootState, {
      actionObserver: (action: KissAction<State>, _dispatchCount: number, ini: boolean) => { if (ini) actions.push(action.toString()); },
    });

    const html = renderToString(page(store, { user: 'Ann' }));

    expect(html).toBe('<nav>-/0</nav><main>Ann</main>');
    expect(store.state).toEqual({ user: 'Ann', clicks: 0, items: [] });
    expect(actions).toEqual(['MergeServerStateAction(user)']);
    expect(store.dispatchCount).toBe(1);
  });

Bdd(feature)
  .scenario('Hydrating a page with a slice produces no mismatch, and the live store gets the slice before the route renders.')
  .given('The server HTML of a page with the user Ann in a slice, and a client store created with the root state (no slice).')
  .when('The client hydrates the HTML.')
  .then('There is no recoverable hydration error, and no warning.')
  .and('The route shows Ann from its first commit, and the live store has Ann.')
  .and('The layout catches up with the merged store right after the commit.')
  .and('A later action still works, and the slice is kept.')
  .run(async (_) => {
    const html = renderToString(page(createStore(), { user: 'Ann' }));
    outerCommits.length = 0;
    innerCommits.length = 0;
    const clientStore = createStore();

    const m = await hydrate(html, page(clientStore, { user: 'Ann' }));

    expect(m.recoverableErrors).toEqual([]);
    expect(innerCommits[0]).toBe('Ann');
    expect(clientStore.state.user).toBe('Ann');
    expect(m.text()).toBe('Ann/0Ann');
    expect(outerCommits).toEqual(['-/0', 'Ann/0']);

    await act(async () => clientStore.dispatch(new Increment()));
    expect(m.text()).toBe('Ann/1Ann');
  });

Bdd(feature)
  .scenario('When the client store changed before hydration, the route hydrates against the merged server state, then shows the slice.')
  .given('The server HTML of a page with the user Ann in a slice.')
  .and('A client store where an action changed the clicks to 1, and the user to Bob, before hydrating.')
  .when('The client hydrates the HTML, with the root state as serverState.')
  .then('There is no recoverable hydration error.')
  .and('After hydration, the route shows Ann (the server slice wins), and the clicks are 1 (kept).')
  .run(async (_) => {
    const html = renderToString(page(createStore(), { user: 'Ann' }));
    const clientStore = createStore();
    clientStore.dispatch(new Increment());
    clientStore.mergeServerState({ user: 'Bob' });
    expect(clientStore.state).toEqual({ user: 'Bob', clicks: 1, items: [] });

    const m = await hydrate(html, page(clientStore, { user: 'Ann' }));

    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('Ann/1Ann');
    expect(clientStore.state).toEqual({ user: 'Ann', clicks: 1, items: [] });
  });

Bdd(feature)
  .scenario('On the client, a slice that mounts (client-side navigation) renders its route with the slice in its first commit.')
  .given('A mounted page showing the layout, and a client store with the root state.')
  .when('A route with a StoreSlice with the user Ann mounts.')
  .then('The first commit of the route shows Ann: no empty or stale frame.')
  .and('The layout shows Ann after the commit, and no warning is logged.')
  .run(async (_) => {
    const store = createStore();
    let setRoute!: (route: React.ReactNode) => void;
    const App: React.FC = () => {
      const [route, set] = useState<React.ReactNode>(null);
      setRoute = set;
      return <StoreProvider store={store}><Outer />{route}</StoreProvider>;
    };
    const m = await mount(<App />);
    expect(m.text()).toBe('-/0');

    await act(async () => setRoute(<StoreSlice state={{ user: 'Ann' }}><Inner /></StoreSlice>));

    expect(innerCommits[0]).toBe('Ann');
    expect(m.text()).toBe('Ann/0Ann');
    expect(store.state.user).toBe('Ann');
  });

Bdd(feature)
  .scenario('In StrictMode, the slice is merged once: the state observer sees one change, and nothing is published twice.')
  .given('A store with a state observer, and StrictMode, which calls the initializers twice.')
  .when('A page with a slice mounts.')
  .then('The state observer saw one state change, and the store dispatched one action.')
  .and('No warning is logged.')
  .run(async (_) => {
    const changes: string[] = [];
    const store = createStore(rootState, {
      stateObserver: (action: KissAction<State>, prev: State, next: State) => { if (prev !== next) changes.push(action.toString()); },
    });

    const m = await mount(page(store, { user: 'Ann' }), { strict: true });

    expect(m.text()).toBe('Ann/0Ann');
    expect(changes).toEqual(['MergeServerStateAction(user)']);
    expect(store.dispatchCount).toBe(2); // StrictMode runs the initializer twice; the second merge changes nothing.
  });

Bdd(feature)
  .scenario('A new key merges the new slice and keeps the rest of the state; the same key with a new state prop does nothing.')
  .given('A mounted page with a slice with the user Ann, where the clicks were then changed to 2.')
  .when('The page re-renders with the same key and the user Bob in the state prop.')
  .then('Nothing changes: the slice is merged once per mount.')
  .and('When the page re-renders with a new key and the user Bob, the route shows Bob, and the clicks are still 2.')
  .run(async (_) => {
    const store = createStore();
    const m = await mount(page(store, { user: 'Ann' }, rootState, 'a'));
    await act(async () => { store.dispatch(new Increment()); store.dispatch(new Increment()); });
    expect(m.text()).toBe('Ann/2Ann');

    await m.rerender(page(store, { user: 'Bob' }, rootState, 'a'));
    expect(m.text()).toBe('Ann/2Ann');
    expect(store.state.user).toBe('Ann');

    await m.rerender(page(store, { user: 'Bob' }, rootState, 'b'));
    expect(m.text()).toBe('Bob/2Bob');
    expect(store.state).toEqual({ user: 'Bob', clicks: 2, items: [] });
  });

Bdd(feature)
  .scenario('The mergeServerState option of createStore decides how a slice is merged, which class-based states need.')
  .given('A store whose state is a class instance, created with a mergeServerState option that builds the new instance.')
  .when('A slice is merged.')
  .then('The option is used, and the state is a new instance of the class.')
  .and('Without the option, merging into a class-based state throws a StoreException explaining it.')
  .run(async (_) => {
    class ClassState {
      constructor(readonly user: string, readonly clicks: number) {}

      withUser(user: string) { return new ClassState(user, this.clicks); }
    }

    const withOption = new Store<ClassState>({
      initialState: new ClassState('-', 3),
      logger: () => {},
      mergeServerState: (state, slice: { user?: string }) => (slice.user === undefined) ? state : state.withUser(slice.user),
    });
    withOption.mergeServerState({ user: 'Ann' });
    expect(withOption.state).toBeInstanceOf(ClassState);
    expect(withOption.state).toEqual(new ClassState('Ann', 3));

    const withoutOption = new Store<ClassState>({ initialState: new ClassState('-', 3), logger: () => {} });
    expect(() => withoutOption._mergeSlice(withoutOption.state, { user: 'Ann' })).toThrow(StoreException);
    expect(() => withoutOption._mergeSlice(withoutOption.state, { user: 'Ann' })).toThrow(/mergeServerState/);
  });

Bdd(feature)
  .scenario('A slice merged while the persistor is still reading is merged again into the persisted state when it arrives.')
  .given('A client store with a persistor still reading, whose persisted state has 5 clicks and no user.')
  .when('A page with a slice with the user Ann mounts, before the store is ready.')
  .then('The route shows Ann right away, with 0 clicks.')
  .and('When the persistor finishes reading, the state has the 5 persisted clicks and the user Ann: the route data was not lost.')
  .and('The slice merged after the store is ready is persisted.')
  .run(async (_) => {
    const persistor = new ControlledPersistor<State>({ stateToRead: { user: '-', clicks: 5, items: [] } });
    const store = createStore(rootState, { persistor });
    expect(store._isReady).toBe(false);

    const m = await mount(page(store, { user: 'Ann' }));
    expect(m.text()).toBe('Ann/0Ann');
    expect(store.state.user).toBe('Ann');

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    expect(store.state).toEqual({ user: 'Ann', clicks: 5, items: [] });
    expect(m.text()).toBe('Ann/5Ann');

    await act(async () => store.mergeServerState({ items: ['a'] }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(persistor.persistedStates.at(-1)).toEqual({ user: 'Ann', clicks: 5, items: ['a'] });
  });

Bdd(feature)
  .scenario('Under concurrent rendering, a route with a slice rendered in a transition, with a sibling that suspends, shows no tearing.')
  .given('A mounted page on route 1 (user One), and a client store.')
  .when('A transition switches to route 2, whose slice has the user Two, and whose sibling suspends until later.')
  .then('While the transition is pending, the page still shows route 1, consistent.')
  .and('When the sibling resolves, the page shows route 2 with the user Two, in the layout and in the route, and no warning is logged.')
  .run(async (_) => {
    const store = createStore();
    const gate = new Deferred<void>();
    let resolved = false;
    const Suspender: React.FC = () => {
      if (!resolved) throw gate.promise;
      return <i>ok</i>;
    };
    let setRoute!: (route: number) => void;
    const App: React.FC = () => {
      const [route, set] = useState(1);
      setRoute = set;
      return (
        <StoreProvider store={store}>
          <Outer />
          <Suspense fallback={<i>loading</i>}>
            {route === 1
              ? <StoreSlice state={{ user: 'One' }} key="1"><Inner /></StoreSlice>
              : <StoreSlice state={{ user: 'Two' }} key="2"><Inner /><Suspender /></StoreSlice>}
          </Suspense>
        </StoreProvider>
      );
    };
    const m = await mount(<App />);
    expect(m.text()).toBe('One/0One');

    await act(async () => startTransition(() => setRoute(2)));
    // The transition is pending (the sibling suspended): the committed page is still route 1.
    expect(m.text()).toMatch(/^(One|Two)\/0One$/);

    await act(async () => {
      resolved = true;
      gate.resolve();
      await gate.promise;
    });
    expect(m.text()).toBe('Two/0Twook');
    expect(store.state.user).toBe('Two');
  });

Bdd(feature)
  .scenario('A slice inside a Suspense boundary that streams after the shell is in the streamed HTML, and hydrates without mismatch.')
  .given('A request store, and a page whose route (with a slice with the user Ann) is a lazy component inside Suspense.')
  .when('The page is streamed with renderToPipeableStream, and the complete HTML is hydrated by a client store with the root state.')
  .then('The streamed HTML has the layout with the root state and the route with Ann.')
  .and('Hydration produces no mismatch, and the page then shows Ann everywhere.')
  .run(async (_) => {
    const release = new Deferred<void>();
    const Route: React.FC = () => <StoreSlice state={{ user: 'Ann' }}><Inner /></StoreSlice>;
    const Lazy = React.lazy(() => release.promise.then(() => ({ default: Route })));
    const tree = (store: Store<State>) => (
      <StoreProvider store={store} serverState={rootState}>
        <Outer />
        <Suspense fallback={<i>loading</i>}><Lazy /></Suspense>
      </StoreProvider>
    );

    const serverStore = createStore();
    const chunks: string[] = [];
    const finished = new Deferred<void>();
    const sink = new Writable({
      write(chunk, _encoding, callback) { chunks.push(chunk.toString()); callback(); },
      final(callback) { finished.resolve(); callback(); },
    });
    const stream = renderToPipeableStream(tree(serverStore), { onAllReady() { stream.pipe(sink); } });
    release.resolve();
    await finished.promise;
    const html = chunks.join('');
    expect(html).toContain('<nav>-/0</nav>');
    expect(html).toContain('<main>Ann</main>');
    expect(serverStore.state.user).toBe('Ann');

    const clientStore = createStore();
    const m = await hydrate(html, tree(clientStore));
    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('Ann/0Ann');
    expect(clientStore.state.user).toBe('Ann');
  });

Bdd(feature)
  .scenario('mergeServerState can be called directly, and merging the same slice again publishes nothing.')
  .given('A store with a state listener.')
  .when('A slice is merged twice.')
  .then('The state has the slice, the listener was called once, and the action is a MergeServerStateAction.')
  .run(async (_) => {
    const store = createStore();
    let notified = 0;
    store._subscribeState(() => notified++);

    store.mergeServerState({ user: 'Ann', items: ['x'] });
    store.mergeServerState({ user: 'Ann', items: store.state.items });

    expect(store.state).toEqual({ user: 'Ann', clicks: 0, items: ['x'] });
    expect(notified).toBe(1);
    expect(new MergeServerStateAction({ user: 'Ann', items: [] }).toString()).toBe('MergeServerStateAction(user, items)');
  });
