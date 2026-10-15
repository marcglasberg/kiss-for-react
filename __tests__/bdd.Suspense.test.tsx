/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { act, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import { RootOptions } from 'react-dom/client';
import {
  KissAction,
  Store,
  StoreProvider,
  useIsFailed,
  useIsWaiting,
  useSelect,
  useSuspense,
  UserException,
} from '../src';
import { ErrorBoundary, failOnConsoleErrors, hydrate, mount, unmountAll } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());
failOnConsoleErrors();
afterEach(unmountAll);

const feature = new Feature('Suspense and error boundaries with useSuspense');

class State {
  constructor(readonly users: Readonly<Record<string, string>> = {}) {}

  withUser(id: string, name: string): State {
    return new State({ ...this.users, [id]: name });
  }
}

abstract class BaseLoad extends KissAction<State> {}

/** Loads one user. Stays pending until `finish` resolves, then succeeds or fails. */
class LoadUser extends BaseLoad {
  constructor(
    readonly userId: string,
    readonly finish: Promise<void> = Promise.resolve(),
    readonly error: unknown = null,
  ) {
    super();
  }

  get statusKey() {
    return this.userId;
  }

  async reduce() {
    await this.finish;
    if (this.error !== null) throw this.error;
    return (state: State) => state.withUser(this.userId, `User ${this.userId}`);
  }
}

class SubLoadUser extends LoadUser {}

/** An unrelated async action. */
class Other extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return null;
  }
}

function createStore(initialState = new State()) {
  return new Store<State>({ initialState, logger: () => {}, showUserException: () => {} });
}

// React logs the errors caught by error boundaries. The tests check the boundaries themselves.
const rootOptions = { onCaughtError: () => {} } as RootOptions;

/** Dispatches `action` inside `act`, and returns a function that finishes it (inside `act`). */
async function start(store: Store<State>, action: KissAction<State>, finish: Deferred<void>) {
  await act(async () => store.dispatch(action));
  return async () => {
    await act(async () => {
      finish.resolve();
      await store.waitAllActions([action], { completeImmediately: true });
    });
  };
}

/**
 * A component that suspends while `LoadUser` runs for `userId`, and then shows the user.
 * `log` records each time the code after the hook runs.
 */
function userName(log: string[], options: { throwErrors?: boolean } = {}) {
  const UserName: React.FC<{ userId: string }> = ({ userId }) => {
    useSuspense(LoadUser, { statusKey: userId, ...options });
    const name = useSelect((state: State) => state.users[userId]);
    log.push(`${userId}:${name ?? 'none'}`);
    return <span>{name ?? 'none'}</span>;
  };
  return UserName;
}

/** The visible text of the mounted root. React hides a suspended component with `display: none`. */
function shown(m: { container: HTMLElement }): string {
  return visibleText(m.container);
}

function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && node.style.display === 'none') return '';
  return Array.from(node.childNodes).map(visibleText).join('');
}

function provide(store: Store<State>, children: React.ReactNode) {
  return <StoreProvider store={store}>{children}</StoreProvider>;
}

Bdd(feature)
  .scenario('While the action runs, the component suspends and the nearest Suspense shows its fallback.')
  .given('A mounted component that calls useSuspense(LoadUser) and then shows the user, inside a Suspense boundary.')
  .when('A LoadUser action starts, waits, and then finishes with the loaded user.')
  .then('The boundary shows the fallback while the action runs, and the code after the hook does not run.')
  .and('When the action finishes, the component shows the loaded user.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    const UserName = userName(log);
    const m = await mount(provide(store, <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>));
    expect(shown(m)).toBe('none');
    expect(log).toEqual(['1:none']);
    log.length = 0;

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise), finish);
    expect(shown(m)).toBe('loading');
    expect(log).toEqual([]);

    await end();
    expect(shown(m)).toBe('User 1');
    expect(log).toEqual(['1:User 1']);
  });

Bdd(feature)
  .scenario('A component mounted while the action is already running suspends until it finishes.')
  .given('A LoadUser action in progress.')
  .when('A component that calls useSuspense(LoadUser) mounts inside a Suspense boundary, and later the action finishes.')
  .then('The boundary shows the fallback at first, and then the loaded user.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    const UserName = userName(log);
    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise), finish);

    const m = await mount(provide(store, <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>));
    expect(shown(m)).toBe('loading');
    expect(log).toEqual([]);

    await end();
    expect(shown(m)).toBe('User 1');
    expect(log).toEqual(['1:User 1']);
  });

Bdd(feature)
  .scenario('With a statusKey, only the component whose key is running suspends.')
  .given('Two mounted components, for users 1 and 2, each inside its own Suspense boundary, each calling useSuspense with its own statusKey.')
  .when('A LoadUser action for user 2 starts, waits, and finishes.')
  .then('Only the boundary of user 2 shows the fallback. The component of user 1 keeps showing its content.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann', '2': 'Bob' }));
    const log: string[] = [];
    const UserName = userName(log);
    const m = await mount(provide(store, <>
      <Suspense fallback={<i>loading 1</i>}><UserName userId="1" /></Suspense>
      <Suspense fallback={<i>loading 2</i>}><UserName userId="2" /></Suspense>
    </>));
    expect(shown(m)).toBe('AnnBob');
    log.length = 0;

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('2', finish.promise), finish);
    expect(shown(m)).toBe('Annloading 2');
    expect(log).toEqual([]);

    await end();
    expect(shown(m)).toBe('AnnUser 2');
  });

Bdd(feature)
  .scenario('Without a statusKey, the component suspends while any action of the type runs, including subclasses.')
  .given('A mounted component that calls useSuspense(BaseLoad) without a statusKey, where BaseLoad is an abstract class.')
  .when('A SubLoadUser action (a subclass of LoadUser, which extends BaseLoad) starts and finishes.')
  .then('The component suspends while it runs, and shows the user when it finishes.')
  .run(async (_) => {
    const store = createStore();
    const Comp: React.FC = () => {
      useSuspense(BaseLoad);
      const name = useSelect((state: State) => state.users['1']);
      return <span>{name ?? 'none'}</span>;
    };
    const m = await mount(provide(store, <Suspense fallback={<i>loading</i>}><Comp /></Suspense>));
    expect(shown(m)).toBe('none');

    const finish = new Deferred<void>();
    const end = await start(store, new SubLoadUser('1', finish.promise), finish);
    expect(shown(m)).toBe('loading');

    await end();
    expect(shown(m)).toBe('User 1');
  });

Bdd(feature)
  .scenario('An action of another type does not make the component suspend.')
  .given('A mounted component that calls useSuspense(LoadUser).')
  .when('An Other action starts and stays in progress.')
  .then('The component keeps showing its content.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const UserName = userName([]);
    const m = await mount(provide(store, <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>));

    const finish = new Deferred<void>();
    const end = await start(store, new Other(finish.promise), finish);
    expect(shown(m)).toBe('Ann');
    await end();
  });

Bdd(feature)
  .scenario('Only the nearest Suspense boundary shows its fallback.')
  .given('A Suspense boundary around a header and an inner Suspense boundary, which holds the component that calls useSuspense.')
  .when('The action runs.')
  .then('The inner boundary shows its fallback, and the header outside it stays visible.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const UserName = userName([]);
    const m = await mount(provide(store,
      <Suspense fallback={<i>outer</i>}>
        <b>Header </b>
        <Suspense fallback={<i>inner</i>}><UserName userId="1" /></Suspense>
      </Suspense>));
    expect(shown(m)).toBe('Header Ann');

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise), finish);
    expect(shown(m)).toBe('Header inner');

    await end();
    expect(shown(m)).toBe('Header User 1');
  });

Bdd(feature)
  .scenario('The promise thrown while the action runs is the same object on every render, and is released when the action finishes.')
  .given('A LoadUser action in progress.')
  .when('The store is asked twice for the suspense value of LoadUser, for that key, and then the action finishes.')
  .then('Both answers are the same promise, which resolves when the action finishes, and the store then keeps no promise.')
  .and('A new run of the action gets a new promise.')
  .run(async (_) => {
    const store = createStore();
    expect(store._suspenseValue(LoadUser, '1')).toBe(null);
    expect((store as any)._suspenseWaits).toHaveLength(0);

    const finish = new Deferred<void>();
    store.dispatch(new LoadUser('1', finish.promise));
    const promise1 = store._suspenseValue(LoadUser, '1');
    const promise2 = store._suspenseValue(LoadUser, '1');
    expect(promise1).toBeInstanceOf(Promise);
    expect(promise2).toBe(promise1);
    expect((store as any)._suspenseWaits).toHaveLength(1);

    // Another key, and another type, don't match this promise.
    expect(store._suspenseValue(LoadUser, '2')).toBe(null);
    expect(store._suspenseValue(Other, undefined)).toBe(null);

    finish.resolve();
    await promise1;
    expect(store.isWaiting(LoadUser)).toBe(false);
    expect(store._suspenseValue(LoadUser, '1')).toBe(null);
    expect((store as any)._suspenseWaits).toHaveLength(0);

    const finish2 = new Deferred<void>();
    store.dispatch(new LoadUser('1', finish2.promise));
    const promise3 = store._suspenseValue(LoadUser, '1');
    expect(promise3).toBeInstanceOf(Promise);
    expect(promise3).not.toBe(promise1);
    finish2.resolve();
    await promise3;
    expect((store as any)._suspenseWaits).toHaveLength(0);
  });

Bdd(feature)
  .scenario('A store whose components never call useSuspense keeps no promises.')
  .given('A mounted component that uses useIsWaiting, and never useSuspense.')
  .when('A LoadUser action starts and finishes.')
  .then('The store never creates a suspense promise.')
  .run(async (_) => {
    const store = createStore();
    const Comp: React.FC = () => <span>{useIsWaiting(LoadUser) ? 'waiting' : 'idle'}</span>;
    const m = await mount(provide(store, <Comp />));

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise), finish);
    expect(shown(m)).toBe('waiting');
    expect((store as any)._suspenseWaits).toHaveLength(0);
    await end();
    expect(shown(m)).toBe('idle');
    expect((store as any)._suspenseWaits).toHaveLength(0);
  });

Bdd(feature)
  .scenario('When the action failed, the component throws the error to the nearest error boundary.')
  .given('A mounted component that calls useSuspense(LoadUser), inside an error boundary and a Suspense boundary.')
  .when('A LoadUser action for that key fails with a UserException.')
  .then('The error boundary shows the error, and the failure is still recorded in the store (isFailed is true).')
  .and('When the action is dispatched again, the failure is cleared, the Suspense boundary shows the fallback, and then the user.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const log: string[] = [];
    const UserName = userName(log);
    const errors: string[] = [];
    let resetKey = 0;
    const App: React.FC = () => (
      <ErrorBoundary resetKey={resetKey} onError={(e) => errors.push(e.message)}>
        <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>
      </ErrorBoundary>
    );
    const m = await mount(provide(store, <App />), { rootOptions });
    expect(shown(m)).toBe('Ann');
    log.length = 0;

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise, new UserException('Load failed.')), finish);
    expect(shown(m)).toBe('loading');
    await end();
    expect(shown(m)).toBe('error:Load failed.');
    expect(errors).toEqual(['Load failed.']);
    expect(log).toEqual([]);
    expect(store.isFailed(LoadUser, { statusKey: '1' })).toBe(true);

    // The retry: dispatching the action again clears the failure, and resetting the boundary
    // mounts the component again, which suspends until the action finishes.
    const finish2 = new Deferred<void>();
    resetKey++;
    const end2 = await start(store, new LoadUser('1', finish2.promise), finish2);
    await m.rerender(provide(store, <App />));
    expect(store.isFailed(LoadUser, { statusKey: '1' })).toBe(false);
    expect(shown(m)).toBe('loading');

    await end2();
    expect(shown(m)).toBe('User 1');
    expect(log).toEqual(['1:User 1']);
  });

Bdd(feature)
  .scenario('Any error is thrown to the error boundary, not only a UserException.')
  .given('A mounted component that calls useSuspense(LoadUser), inside an error boundary.')
  .when('A LoadUser action for that key fails with a plain Error.')
  .then('The error boundary shows that error.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const UserName = userName([]);
    const m = await mount(provide(store,
      <ErrorBoundary><Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense></ErrorBoundary>),
      { rootOptions });

    // A plain error (not a `UserException`) is also rethrown by `dispatchAndWait`.
    await act(async () => {
      await expect(store.dispatchAndWait(new LoadUser('1', Promise.resolve(), new Error('Network down.'))))
        .rejects.toThrow('Network down.');
    });
    expect(store.isFailed(LoadUser, { statusKey: '1' })).toBe(true);
    expect(shown(m)).toBe('error:Network down.');
  });

Bdd(feature)
  .scenario('A failure of the same type with another statusKey is not thrown.')
  .given('A mounted component that calls useSuspense(LoadUser, { statusKey: 1 }), inside an error boundary.')
  .when('A LoadUser action for user 2 fails.')
  .then('The component keeps showing its content.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const UserName = userName([]);
    const m = await mount(provide(store,
      <ErrorBoundary><Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense></ErrorBoundary>),
      { rootOptions });

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('2', finish.promise, new UserException('Load failed.')), finish);
    await end();
    expect(store.isFailed(LoadUser, { statusKey: '2' })).toBe(true);
    expect(shown(m)).toBe('Ann');
  });

Bdd(feature)
  .scenario('With throwErrors false, a failed action is not thrown, and the component can use useIsFailed instead.')
  .given('A mounted component that calls useSuspense(LoadUser, { statusKey, throwErrors: false }) and useIsFailed.')
  .when('A LoadUser action for that key fails.')
  .then('The component renders, and shows the failure with useIsFailed.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann' }));
    const Comp: React.FC = () => {
      useSuspense(LoadUser, { statusKey: '1', throwErrors: false });
      const isFailed = useIsFailed(LoadUser, { statusKey: '1' });
      const name = useSelect((state: State) => state.users['1']);
      return <span>{isFailed ? 'failed' : name}</span>;
    };
    const m = await mount(provide(store,
      <ErrorBoundary><Suspense fallback={<i>loading</i>}><Comp /></Suspense></ErrorBoundary>),
      { rootOptions });

    const finish = new Deferred<void>();
    const end = await start(store, new LoadUser('1', finish.promise, new UserException('Load failed.')), finish);
    expect(shown(m)).toBe('loading');
    await end();
    expect(shown(m)).toBe('failed');
  });

Bdd(feature)
  .scenario('On the server, useSuspense never suspends and never throws.')
  .given('A server store where a LoadUser action is in progress for user 1, and a LoadUser action failed for user 2.')
  .when('Components for users 1 and 2 that call useSuspense are rendered to a string.')
  .then('The HTML shows the state, with no fallback and no error.')
  .run(async (_) => {
    const store = createStore(new State({ '1': 'Ann', '2': 'Bob' }));
    const finish = new Deferred<void>();
    store.dispatch(new LoadUser('1', finish.promise));
    await store.dispatchAndWait(new LoadUser('2', Promise.resolve(), new UserException('Load failed.')));
    expect(store.isWaiting(LoadUser, { statusKey: '1' })).toBe(true);
    expect(store.isFailed(LoadUser, { statusKey: '2' })).toBe(true);

    const UserName = userName([]);
    const html = renderToString(provide(store,
      <ErrorBoundary>
        <Suspense fallback={<i>loading</i>}><UserName userId="1" /><UserName userId="2" /></Suspense>
      </ErrorBoundary>));
    expect(html).toBe('<!--$--><span>Ann</span><span>Bob</span><!--/$-->');

    finish.resolve();
    await store.waitAllActions([], { completeImmediately: true });
  });

Bdd(feature)
  .scenario('While hydrating, useSuspense renders what the server rendered, and then follows the client store.')
  .given('HTML rendered by a server store with user 1 = Ann, and a client store where a LoadUser action for user 1 is running.')
  .when('The client hydrates the HTML, and later the action finishes.')
  .then('Hydration matches the HTML, with no recoverable error.')
  .and('After hydration, the component suspends (the boundary shows the fallback), and then shows the loaded user.')
  .run(async (_) => {
    const serverState = new State({ '1': 'Ann' });
    const UserName = userName([]);
    const html = renderToString(provide(createStore(serverState),
      <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>));
    expect(html).toBe('<!--$--><span>Ann</span><!--/$-->');

    const clientStore = createStore(new State({ '1': 'Ann' }));
    const finish = new Deferred<void>();
    const end = await start(clientStore, new LoadUser('1', finish.promise), finish);

    const m = await hydrate(html,
      <StoreProvider store={clientStore} serverState={serverState}>
        <Suspense fallback={<i>loading</i>}><UserName userId="1" /></Suspense>
      </StoreProvider>);
    expect(m.recoverableErrors).toEqual([]);
    expect(shown(m)).toBe('loading');

    await end();
    expect(shown(m)).toBe('User 1');
  });
