/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 */
import './fixtures/jsdomNodeGlobals';
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { act, startTransition, Suspense, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { Store, StoreProvider, StoreSlice, useSelect, useDispatch, KissAction } from '../src';
import { ErrorBoundary, hydrate, mount, unmountAll } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());
afterEach(unmountAll);
const feature = new Feature('Store slices follow their provider and include parent state');
type State = { user: { name: string } | null; count: number; route: string };
const initialState: State = { user: null, count: 0, route: '' };
class Increment extends KissAction<State> {
  reduce() { return { ...this.state, count: this.state.count + 1 }; }
}

Bdd(feature)
  .scenario('Replacing a provider store changes the state read inside an existing slice.')
  .given('A store with count one and a mounted slice, and a second store with count ten.')
  .and('The slice data and its component identity remain unchanged.')
  .when('The provider switches to the second store and a component dispatches an increment.')
  .then('The component reads count eleven from the second store.')
  .and('The increment changes only the second store.')
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
    expect(first.state.count).toBe(1);
    expect(app.text()).toBe('11');
  });

class SetRoute extends KissAction<State> {
  constructor(readonly route: string) { super(); }
  reduce() { return { ...this.state, route: this.route }; }
}

Bdd(feature)
  .scenario('Replacing a provider store merges the slice data into the new store.')
  .given('A mounted slice with the profile route, and a second store with no route.')
  .when('The provider switches to the second store.')
  .then('Every render with the second store reads the profile route.')
  .and('The second store contains the profile route, and keeps its own count.')
  .run(async () => {
    const first = new Store<State>({ initialState: { ...initialState, count: 1 }, logger: null });
    const second = new Store<State>({ initialState: { ...initialState, count: 10 }, logger: null });
    const renders: string[] = [];
    function View() {
      const route = useSelect((s: State) => s.route);
      const count = useSelect((s: State) => s.count);
      renders.push(`${count}/${route}`);
      return <span>{`${count}/${route}`}</span>;
    }
    const page = (store: Store<State>) => <StoreProvider store={store}>
      <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
    </StoreProvider>;
    const app = await mount(page(first));
    expect(app.text()).toBe('1/profile');
    renders.length = 0;
    await app.rerender(page(second));
    expect(renders.length).toBeGreaterThan(0);
    expect(renders.every(r => r === '10/profile')).toBe(true);
    expect(app.text()).toBe('10/profile');
    expect(second.state).toEqual({ user: null, count: 10, route: 'profile' });
  });

Bdd(feature)
  .scenario('The replacement store gets the current slice data of the mounted slice.')
  .given('A mounted slice that merged the profile route into the first store.')
  .when('The provider switches to a second store, and the slice now has the settings route.')
  .then('The second store contains the settings route.')
  .and('The first store keeps the profile route.')
  .run(async () => {
    const first = new Store<State>({ initialState, logger: null });
    const second = new Store<State>({ initialState, logger: null });
    function View() {
      return <span>{useSelect((s: State) => s.route)}</span>;
    }
    const page = (store: Store<State>, route: string) => <StoreProvider store={store}>
      <StoreSlice state={{ route }}><View /></StoreSlice>
    </StoreProvider>;
    const app = await mount(page(first, 'profile'));
    expect(first.state.route).toBe('profile');
    await app.rerender(page(second, 'settings'));
    expect(app.text()).toBe('settings');
    expect(second.state.route).toBe('settings');
    expect(first.state.route).toBe('profile');
  });

Bdd(feature)
  .scenario('Switching back to a store that the slice already used does not merge the slice again.')
  .given('A mounted slice merged the profile route into the first store.')
  .and('A component changed the route of the first store to edited.')
  .when('The provider switches to a second store, and then back to the first store.')
  .then('The first store keeps the edited route, and the component reads it.')
  .run(async () => {
    const first = new Store<State>({ initialState, logger: null });
    const second = new Store<State>({ initialState, logger: null });
    let dispatch!: (action: KissAction<State>) => void;
    function View() {
      dispatch = useDispatch<State>();
      return <span>{useSelect((s: State) => s.route)}</span>;
    }
    const page = (store: Store<State>) => <StoreProvider store={store}>
      <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
    </StoreProvider>;
    const app = await mount(page(first));
    await act(async () => dispatch(new SetRoute('edited')));
    expect(first.state.route).toBe('edited');
    await app.rerender(page(second));
    expect(app.text()).toBe('profile');
    await app.rerender(page(first));
    expect(first.state.route).toBe('edited');
    expect(app.text()).toBe('edited');
  });

Bdd(feature)
  .scenario('A nested slice reads data from its parent slice on the first render.')
  .given('A store with no user and nested slices that provide a user and a route.')
  .when('The nested slices mount together.')
  .then('Every render inside the inner slice reads the user supplied by the outer slice.')
  .and('The committed store contains both the loaded user and the route.')
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
    expect(store.state).toEqual({ user: { name: 'Ann' }, count: 0, route: 'profile' });
    expect(names[0]).toBe('Ann');
  });

Bdd(feature)
  .scenario('Nested slices can use the user that their parent supplied.')
  .given('The store has no user and an outer slice supplies a loaded user.')
  .when('An inner slice reads the name of the loaded user.')
  .then('The loaded user is available and rendering succeeds.')
  .and('No error boundary replaces the loaded route.')
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

Bdd(feature)
  .scenario('Replacing a provider without a slice switches state reads and dispatches together.')
  .given('A component reads a store with count one, and another store has count ten.')
  .when('The provider switches to the second store and the component dispatches an increment.')
  .then('The component reads count eleven and only the second store changes.')
  .and('Later changes to the first store do not affect the component.')
  .run(async () => {
    const first = new Store<State>({ initialState: { ...initialState, count: 1 }, logger: null });
    const second = new Store<State>({ initialState: { ...initialState, count: 10 }, logger: null });
    let dispatch!: (action: KissAction<State>) => void;
    function View() {
      dispatch = useDispatch<State>();
      return <span>{useSelect((s: State) => s.count)}</span>;
    }
    const page = (store: Store<State>) => <StoreProvider store={store}><View /></StoreProvider>;
    const app = await mount(page(first));
    expect(app.text()).toBe('1');
    await app.rerender(page(second));
    expect(app.text()).toBe('10');
    await act(async () => dispatch(new Increment()));
    expect({ first: first.state.count, second: second.state.count, text: app.text() })
      .toEqual({ first: 1, second: 11, text: '11' });
    await act(async () => first.dispatch(new Increment()));
    expect(app.text()).toBe('11');
  });

Bdd(feature)
  .scenario('An inner slice can read a parent slice that has already committed.')
  .given('An outer slice has already supplied the user Ann to the store.')
  .when('An inner slice with the profile route mounts later.')
  .then('The first inner render can read Ann without a missing value.')
  .and('The store keeps both the parent user and the inner route.')
  .run(async () => {
    const store = new Store<State>({ initialState, logger: null });
    const names: string[] = [];
    function View() {
      const name = useSelect((s: State) => s.user!.name);
      names.push(name);
      return <span>{name}</span>;
    }
    const page = (showInner: boolean) => <StoreProvider store={store}>
      <StoreSlice state={{ user: { name: 'Ann' } }}>
        {showInner && <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>}
      </StoreSlice>
    </StoreProvider>;
    const app = await mount(page(false));
    expect(store.state.user).toEqual({ name: 'Ann' });
    await app.rerender(page(true));
    expect(names[0]).toBe('Ann');
    expect(app.text()).toBe('Ann');
    expect(store.state).toEqual({ user: { name: 'Ann' }, count: 0, route: 'profile' });
  });

Bdd(feature)
  .scenario('Nested slices include their parent data when the server renders them.')
  .given('A server store with no user and nested slices that supply Ann and the profile route.')
  .when('The server renders the nested route.')
  .then('The route reads Ann and the profile route in the same render.')
  .and('The server store contains both slices after rendering.')
  .run(async () => {
    const store = new Store<State>({ initialState, server: true, logger: null });
    function View() {
      const user = useSelect((s: State) => s.user!.name);
      const route = useSelect((s: State) => s.route);
      return <span>{`${user}/${route}`}</span>;
    }
    try {
      const html = renderToString(<StoreProvider store={store}>
        <StoreSlice state={{ user: { name: 'Ann' } }}>
          <StoreSlice state={{ route: 'profile' }}><View /></StoreSlice>
        </StoreSlice>
      </StoreProvider>);
      expect(html).toBe('<span>Ann/profile</span>');
      expect(store.state).toEqual({ user: { name: 'Ann' }, count: 0, route: 'profile' });
    } finally {
      await store.dispose();
    }
  });

// Nested slices. In the Next.js app router, a layout and a page can each render a `StoreSlice`
// (for example, the layout of `/users/[id]` loads the user, and its page loads the posts). On
// client-side navigation, both mount in the same render, and the page must find the layout's
// data from its first render.

type Nested = { readonly team: string; readonly user: string; readonly route: string; readonly count: number };
const nested: Nested = { team: '-', user: '-', route: '-', count: 0 };

class Inc extends KissAction<Nested> {
  reduce() { return { ...this.state, count: this.state.count + 1 }; }
}

class SetUser extends KissAction<Nested> {
  constructor(readonly user: string) { super(); }
  reduce() { return { ...this.state, user: this.user }; }
}

function nestedStore(initial: Nested = nested, params: Partial<ConstructorParameters<typeof Store<Nested>>[0]> = {}) {
  return new Store<Nested>({ initialState: initial, logger: null, ...params });
}

/** Shows `team/user/route/count`, and adds it to `log` in every render. */
function Reader({ log }: { log: string[] }) {
  const text = useSelect((s: Nested) => `${s.team}/${s.user}/${s.route}/${s.count}`);
  log.push(text);
  return <b>{text}</b>;
}

/** The different values in `log`, in order. */
const distinct = (log: string[]) => Array.from(new Set(log));

/** Records what is written to `console.error` and `console.warn`, until `restore` is called. */
function captureConsole() {
  const messages: string[] = [];
  const spies = (['error', 'warn'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => { messages.push(args.map(String).join(' ')); }));
  return { messages, restore: () => spies.forEach((spy) => spy.mockRestore()) };
}

Bdd(feature)
  .scenario('Three nested slices that mount together are all read by the innermost component in every render.')
  .given('A store with no team, user or route.')
  .and('Three nested slices supply the team Red, the user Ann and the profile route, and a component outside the slices reads the store.')
  .when('The three slices mount in the same render.')
  .then('Every render of the innermost component reads Red, Ann and profile.')
  .and('The component outside the slices first reads the store without the slices, and then reads all three after the commit.')
  .and('The store contains the three slices, and no warning is logged.')
  .run(async () => {
    const store = nestedStore();
    const outside: string[] = [];
    const inside: string[] = [];
    const console = captureConsole();
    try {
      const app = await mount(<StoreProvider store={store}>
        <Reader log={outside} />
        <StoreSlice state={{ team: 'Red' }}>
          <StoreSlice state={{ user: 'Ann' }}>
            <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
          </StoreSlice>
        </StoreSlice>
      </StoreProvider>);
      expect(distinct(inside)).toEqual(['Red/Ann/profile/0']);
      expect(outside[0]).toBe('-/-/-/0');
      expect(outside.at(-1)).toBe('Red/Ann/profile/0');
      expect(app.text()).toBe('Red/Ann/profile/0Red/Ann/profile/0');
      expect(store.state).toEqual({ team: 'Red', user: 'Ann', route: 'profile', count: 0 });
    } finally {
      console.restore();
    }
    expect(console.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Each component reads the slices that contain it, until the slices commit.')
  .given('An outer slice with the user Ann that contains a component and an inner slice with the profile route.')
  .when('Both slices mount in the same render.')
  .then('The first render of the component in the outer slice reads Ann, without the profile route.')
  .and('Every render of the component in the inner slice reads Ann and the profile route.')
  .and('After the commit, both components read Ann and the profile route.')
  .run(async () => {
    const store = nestedStore();
    const middle: string[] = [];
    const inside: string[] = [];
    await mount(<StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <Reader log={middle} />
        <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    expect(middle[0]).toBe('-/Ann/-/0');
    expect(middle.at(-1)).toBe('-/Ann/profile/0');
    expect(distinct(inside)).toEqual(['-/Ann/profile/0']);
  });

Bdd(feature)
  .scenario('When nested slices supply the same key, the inner slice wins.')
  .given('An outer slice with the users route, and an inner slice with the profile route.')
  .when('Both slices mount in the same render.')
  .then('Every render of the component in the inner slice reads the profile route.')
  .and('The store has the profile route after the commit.')
  .run(async () => {
    const store = nestedStore();
    const middle: string[] = [];
    const inside: string[] = [];
    await mount(<StoreProvider store={store}>
      <StoreSlice state={{ route: 'users' }}>
        <Reader log={middle} />
        <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    expect(distinct(inside)).toEqual(['-/-/profile/0']);
    expect(middle[0]).toBe('-/-/users/0');
    expect(middle.at(-1)).toBe('-/-/profile/0');
    expect(store.state.route).toBe('profile');
  });

Bdd(feature)
  .scenario('After nested slices commit, the inner components read later store changes, and the slices are not merged again.')
  .given('Nested slices with the user Ann and the profile route are mounted.')
  .when('An action increments the count, and another action changes the user to Bob.')
  .then('The component in the inner slice reads the count one and the user Bob.')
  .run(async () => {
    const store = nestedStore();
    const inside: string[] = [];
    const app = await mount(<StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    await act(async () => { store.dispatch(new Inc()); });
    expect(app.text()).toBe('-/Ann/profile/1');
    await act(async () => { store.dispatch(new SetUser('Bob')); });
    expect(app.text()).toBe('-/Bob/profile/1');
    expect(store.state).toEqual({ team: '-', user: 'Bob', route: 'profile', count: 1 });
  });

Bdd(feature)
  .scenario('Navigating to another user remounts the nested slices, and the inner component never reads the previous user.')
  .given('An outer slice with the user Ann (with the key Ann) contains an inner slice with the posts route.')
  .when('The page navigates to the user Bob, so the outer slice gets the key Bob.')
  .then('Every render of the inner component after the navigation reads Bob.')
  .and('The store has the user Bob.')
  .run(async () => {
    const store = nestedStore();
    const inside: string[] = [];
    const page = (user: string) => <StoreProvider store={store}>
      <StoreSlice state={{ user }} key={user}>
        <StoreSlice state={{ route: 'posts' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>;
    const app = await mount(page('Ann'));
    expect(app.text()).toBe('-/Ann/posts/0');
    inside.length = 0;
    await app.rerender(page('Bob'));
    expect(distinct(inside)).toEqual(['-/Bob/posts/0']);
    expect(store.state.user).toBe('Bob');
  });

Bdd(feature)
  .scenario('An inner slice with a new key, inside an outer slice that stays mounted, reads the outer data and its new data.')
  .given('An outer slice with the user Ann contains an inner slice with the profile route (with the key profile).')
  .when('The inner slice gets the settings route, with the key settings.')
  .then('Every render of the inner component after the change reads Ann and the settings route.')
  .run(async () => {
    const store = nestedStore();
    const inside: string[] = [];
    const page = (route: string) => <StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <StoreSlice state={{ route }} key={route}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>;
    const app = await mount(page('profile'));
    inside.length = 0;
    await app.rerender(page('settings'));
    expect(distinct(inside)).toEqual(['-/Ann/settings/0']);
    expect(app.text()).toBe('-/Ann/settings/0');
  });

/** A page with route 1 (team A, user One), or route 2 (team B, user Two) whose content suspends. */
function transitionApp(store: Store<Nested>, logs: { one: string[], two: string[] }, suspender: React.ReactNode) {
  let setRoute!: (route: number) => void;
  function App() {
    const [route, set] = useState(1);
    setRoute = set;
    return <StoreProvider store={store}>
      <Suspense fallback={<i>loading</i>}>
        {route === 1
          ? <StoreSlice state={{ team: 'A' }} key="1">
            <StoreSlice state={{ user: 'One' }}><Reader log={logs.one} /></StoreSlice>
          </StoreSlice>
          : <StoreSlice state={{ team: 'B' }} key="2">
            <StoreSlice state={{ user: 'Two' }}><Reader log={logs.two} />{suspender}</StoreSlice>
          </StoreSlice>}
      </Suspense>
    </StoreProvider>;
  }
  return { App, setRoute: (route: number) => setRoute(route) };
}

Bdd(feature)
  .scenario('Nested slices in a transition whose content suspends commit both slices when the content resolves.')
  .given('A page shows route 1, whose nested slices have the team A and the user One.')
  .when('A transition goes to route 2, whose nested slices have the team B and the user Two, and whose content suspends.')
  .and('While the transition is pending, an action increments the count.')
  .then('While pending, the page and the store still have the team A and the user One.')
  .and('Every render of the route 2 component reads the team B and the user Two.')
  .and('After the content resolves, the page shows team B, user Two and count one, and the store has them.')
  .run(async () => {
    const store = nestedStore();
    const logs = { one: [] as string[], two: [] as string[] };
    const gate = new Deferred<void>();
    let resolved = false;
    function Suspender() {
      if (!resolved) throw gate.promise;
      return <i>ok</i>;
    }
    const { App, setRoute } = transitionApp(store, logs, <Suspender />);
    const app = await mount(<App />);
    expect(app.text()).toBe('A/One/-/0');

    await act(async () => startTransition(() => setRoute(2)));
    await act(async () => { store.dispatch(new Inc()); });
    expect(app.text()).toBe('A/One/-/1');
    expect(store.state).toEqual({ team: 'A', user: 'One', route: '-', count: 1 });

    await act(async () => {
      resolved = true;
      gate.resolve();
      await gate.promise;
    });
    expect(logs.two.length).toBeGreaterThan(0);
    expect(logs.two.every((text) => text.startsWith('B/Two/'))).toBe(true);
    expect(app.text()).toBe('B/Two/-/1ok');
    expect(store.state).toEqual({ team: 'B', user: 'Two', route: '-', count: 1 });
  });

Bdd(feature)
  .scenario('Nested slices in an abandoned transition leave nothing in the store.')
  .given('A page shows route 1, whose nested slices have the team A and the user One.')
  .when('A transition goes to route 2, whose nested slices have the team B and the user Two, and whose content never resolves.')
  .and('Another transition goes back to route 1, and an action increments the count.')
  .then('The page shows the team A, the user One and the count one.')
  .and('The store has nothing from the slices of route 2.')
  .run(async () => {
    const store = nestedStore();
    const logs = { one: [] as string[], two: [] as string[] };
    const never = new Deferred<void>();
    function Suspender(): React.ReactElement { throw never.promise; }
    const { App, setRoute } = transitionApp(store, logs, <Suspender />);
    const app = await mount(<App />);

    await act(async () => startTransition(() => setRoute(2)));
    expect(store.state).toEqual({ team: 'A', user: 'One', route: '-', count: 0 });
    await act(async () => startTransition(() => setRoute(1)));
    await act(async () => { store.dispatch(new Inc()); });

    expect(app.text()).toBe('A/One/-/1');
    expect(store.state).toEqual({ team: 'A', user: 'One', route: '-', count: 1 });
  });

Bdd(feature)
  .scenario('In StrictMode, nested slices that mount together are read in every render and merged once each.')
  .given('A store with a state observer, and StrictMode.')
  .when('Nested slices with the user Ann and the profile route mount together.')
  .then('Every render of the inner component reads Ann and the profile route.')
  .and('The state observer saw two changes, one for each slice, and no warning is logged.')
  .run(async () => {
    const changes: string[] = [];
    const store = nestedStore(nested, {
      stateObserver: (action: KissAction<Nested>, prev: Nested, next: Nested) => { if (prev !== next) changes.push(action.toString()); },
    });
    const inside: string[] = [];
    const console = captureConsole();
    try {
      await mount(<StoreProvider store={store}>
        <StoreSlice state={{ user: 'Ann' }}>
          <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
        </StoreSlice>
      </StoreProvider>, { strict: true });
    } finally {
      console.restore();
    }
    expect(distinct(inside)).toEqual(['-/Ann/profile/0']);
    expect(changes).toEqual(['MergeServerStateAction(user)', 'MergeServerStateAction(route)']);
    expect(console.messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Hydrating nested slices produces no mismatch, and the live store gets both slices.')
  .given('The server HTML of nested slices with the user Ann and the profile route.')
  .and('A client store without the slices.')
  .when('The client hydrates the HTML.')
  .then('There is no hydration error, and every render of the inner component reads Ann and the profile route.')
  .and('The live store has both slices.')
  .run(async () => {
    const tree = (store: Store<Nested>, log: string[]) => <StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <StoreSlice state={{ route: 'profile' }}><Reader log={log} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>;
    const serverStore = nestedStore(nested, { server: true });
    const html = renderToString(tree(serverStore, []));
    await serverStore.dispose();
    expect(html).toBe('<b>-/Ann/profile/0</b>');

    const clientStore = nestedStore();
    const inside: string[] = [];
    const app = await hydrate(html, tree(clientStore, inside));
    expect(app.recoverableErrors).toEqual([]);
    expect(distinct(inside)).toEqual(['-/Ann/profile/0']);
    expect(clientStore.state).toEqual({ team: '-', user: 'Ann', route: 'profile', count: 0 });
  });

Bdd(feature)
  .scenario('Nested slices merged while the persistor is still reading are merged again into the persisted state.')
  .given('A store whose persistor is still reading a persisted state with the count five.')
  .when('Nested slices with the user Ann and the profile route mount before the store is ready.')
  .then('Every render of the inner component before the store is ready reads Ann and the profile route.')
  .and('When the persistor finishes reading, the state has the count five, the user Ann and the profile route.')
  .run(async () => {
    const persistor = new ControlledPersistor<Nested>({ stateToRead: { ...nested, count: 5 } });
    const store = nestedStore(nested, { persistor });
    const inside: string[] = [];
    await mount(<StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    expect(distinct(inside)).toEqual(['-/Ann/profile/0']);

    await act(async () => {
      persistor.finishReading();
      await store.ready();
    });
    expect(store.state).toEqual({ team: '-', user: 'Ann', route: 'profile', count: 5 });
    expect(inside.at(-1)).toBe('-/Ann/profile/5');
  });

Bdd(feature)
  .scenario('Nested slices use the mergeServerState option of a class-based state.')
  .given('A store whose state is a class, created with a mergeServerState option.')
  .when('Nested slices with the team Red and the user Ann mount together.')
  .then('Every render of the inner component reads Red and Ann.')
  .and('The store state is an instance of the class, with Red and Ann.')
  .run(async () => {
    class TeamState {
      constructor(readonly team = '-', readonly user = '-') {}
    }
    const store = new Store<TeamState>({
      initialState: new TeamState(),
      logger: null,
      mergeServerState: (state, slice: Partial<TeamState>) => new TeamState(slice.team ?? state.team, slice.user ?? state.user),
    });
    const inside: string[] = [];
    function TeamReader() {
      const text = useSelect((s: TeamState) => `${s.team}/${s.user}`);
      inside.push(text);
      return <b>{text}</b>;
    }
    await mount(<StoreProvider store={store}>
      <StoreSlice state={{ team: 'Red' }}>
        <StoreSlice state={{ user: 'Ann' }}><TeamReader /></StoreSlice>
      </StoreSlice>
    </StoreProvider>);
    expect(distinct(inside)).toEqual(['Red/Ann']);
    expect(store.state).toBeInstanceOf(TeamState);
    expect(store.state).toEqual(new TeamState('Red', 'Ann'));
  });

Bdd(feature)
  .scenario('When the provider switches stores, nested slices are merged into the new store, and the inner component reads both.')
  .given('Nested slices with the user Ann and the profile route are mounted with a first store.')
  .and('A second store has the count ten, and no user or route.')
  .when('The provider switches to the second store.')
  .then('Every render of the inner component with the second store reads Ann, the profile route and the count ten.')
  .and('The second store has both slices, and the first store does not change.')
  .run(async () => {
    const first = nestedStore();
    const second = nestedStore({ ...nested, count: 10 });
    const inside: string[] = [];
    const page = (store: Store<Nested>) => <StoreProvider store={store}>
      <StoreSlice state={{ user: 'Ann' }}>
        <StoreSlice state={{ route: 'profile' }}><Reader log={inside} /></StoreSlice>
      </StoreSlice>
    </StoreProvider>;
    const app = await mount(page(first));
    inside.length = 0;
    await app.rerender(page(second));
    expect(distinct(inside)).toEqual(['-/Ann/profile/10']);
    expect(second.state).toEqual({ team: '-', user: 'Ann', route: 'profile', count: 10 });
    expect(first.state).toEqual({ team: '-', user: 'Ann', route: 'profile', count: 0 });
  });
