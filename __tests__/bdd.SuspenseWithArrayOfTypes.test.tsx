/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React, { act, Suspense } from 'react';
import { RootOptions } from 'react-dom/client';
import { KissAction, Store, StoreProvider, useSelect, useSuspense, UserException } from '../src';
import { ErrorBoundary, failOnConsoleErrors, mount, unmountAll } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

reporter(new FeatureFileReporter());
failOnConsoleErrors([
  // React 18 reports caught errors through the console; React 19 uses onCaughtError below.
  /^Error: Uncaught \[UserException: Load(User|Posts) failed\.\]$/,
  /^The above error occurred in the <Profile> component:[\s\S]*ErrorBoundary[\s\S]*React will try to recreate/,
]);
afterEach(unmountAll);

const feature = new Feature('useSuspense with an array of action types');

class State {
  constructor(readonly count: number) {}
}

/** An async action that stays pending until `finish` resolves, then fails if `fails` is true. */
abstract class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void> = Promise.resolve(), readonly fails = false) {
    super();
  }

  async reduce() {
    await this.finish;
    if (this.fails) throw new UserException(`${this.constructor.name} failed.`);
    return (state: State) => new State(state.count + 1);
  }
}

class LoadUser extends Load {}

class LoadPosts extends Load {}

function createStore() {
  return new Store<State>({ initialState: new State(0), logger: () => {}, showUserException: () => {} });
}

// React logs the errors caught by error boundaries. The tests check the boundaries themselves.
const rootOptions = { onCaughtError: () => {} } as RootOptions;

type Types = typeof LoadUser | readonly (typeof LoadUser)[];

/**
 * A component that calls `useSuspense` with `types`, written inline as users write it, and then
 * shows the count. `log` records each time the code after the hook runs.
 */
function profile(log: string[], types: () => Types) {
  const Profile: React.FC = () => {
    useSuspense(types());
    const count = useSelect((state: State) => state.count);
    log.push(`count=${count}`);
    return <span>count={count}</span>;
  };
  return Profile;
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

/** Finishes the `action` (by resolving `finish`), and waits for it, inside `act`. */
async function finishAction(store: Store<State>, action: KissAction<State>, finish: Deferred<void>) {
  await act(async () => {
    finish.resolve();
    await store.waitAllActions([action], { completeImmediately: true });
  });
}

test('Test fixture', async () => {
  expect(new State(1).count).toBe(1);
});

Bdd(feature)
  .scenario('useSuspense with an array suspends while an action of any of the types runs.')
  .given('A mounted component that calls useSuspense([LoadUser, LoadPosts]), inside a Suspense boundary.')
  .when('LoadUser starts, then LoadPosts starts, then LoadUser finishes, then LoadPosts finishes.')
  .then('The boundary shows the fallback while at least one of them runs, and the code after the hook does not run.')
  .and('When both finish, the component shows the new state.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    const Profile = profile(log, () => [LoadUser, LoadPosts]);
    const m = await mount(
      <StoreProvider store={store}><Suspense fallback={<i>loading</i>}><Profile /></Suspense></StoreProvider>);
    expect(shown(m)).toBe('count=0');
    log.length = 0;

    const finishUser = new Deferred<void>();
    const finishPosts = new Deferred<void>();
    const user = new LoadUser(finishUser.promise);
    const posts = new LoadPosts(finishPosts.promise);

    await act(async () => store.dispatch(user));
    expect(shown(m)).toBe('loading');
    await act(async () => store.dispatch(posts));
    expect(shown(m)).toBe('loading');

    await finishAction(store, user, finishUser);
    expect(shown(m)).toBe('loading');
    expect(log).toEqual([]);

    await finishAction(store, posts, finishPosts);
    expect(shown(m)).toBe('count=2');
    expect(log).toEqual(['count=2']);
  });

Bdd(feature)
  .scenario('useSuspense with an array throws the error of the first type in the array that failed.')
  .given('A mounted component that calls useSuspense([LoadUser, LoadPosts]), inside an error boundary.')
  .when('LoadPosts fails, and then LoadUser also fails.')
  .then('The error boundary first shows the error of LoadPosts.')
  .and('After the boundary is reset, it shows the error of LoadUser, since LoadUser comes first in the array.')
  .run(async (_) => {
    const store = createStore();
    const log: string[] = [];
    const Profile = profile(log, () => [LoadUser, LoadPosts]);
    const tree = (resetKey: number) =>
      <StoreProvider store={store}>
        <ErrorBoundary resetKey={resetKey}><Suspense fallback={<i>loading</i>}><Profile /></Suspense></ErrorBoundary>
      </StoreProvider>;
    const m = await mount(tree(0), { rootOptions });

    await act(async () => {
      await store.dispatchAndWait(new LoadPosts(undefined, true));
    });
    expect(shown(m)).toBe('error:LoadPosts failed.');

    await act(async () => {
      await store.dispatchAndWait(new LoadUser(undefined, true));
    });
    await m.rerender(tree(1));
    expect(shown(m)).toBe('error:LoadUser failed.');
  });

Bdd(feature)
  .scenario('An array written inline gets the same promise on every render, while the actions run.')
  .given('An action of type LoadUser is running.')
  .when('The value that useSuspense reads is asked twice, with two different arrays that have the same types.')
  .then('Both times it is the same promise, as React\'s Suspense needs.')
  .and('The promise resolves when the action finishes.')
  .run(async (_) => {
    const store = createStore();
    const finish = new Deferred<void>();
    const user = new LoadUser(finish.promise);
    store.dispatch(user);

    const first = store._suspenseValue([LoadUser, LoadPosts], undefined);
    const second = store._suspenseValue([LoadUser, LoadPosts], undefined);
    expect(first).toBeInstanceOf(Promise);
    expect(second).toBe(first);
    expect(store._suspenseValue([LoadPosts, LoadUser], undefined)).not.toBe(first);

    let resolved = false;
    (first as Promise<void>).then(() => resolved = true);
    finish.resolve();
    await store.waitAllActions([user], { completeImmediately: true });
    await Promise.resolve();
    expect(resolved).toBe(true);
  });

/** The argument given to useSuspense, for each example of the BDD below. */
const argumentFor: Record<string, Types> = {
  'LoadUser': LoadUser,
  '[LoadUser]': [LoadUser],
  '[LoadUser, LoadPosts]': [LoadUser, LoadPosts],
};

Bdd(feature)
  .scenario('useSuspense accepts one type, an array with one type, or an array with several types.')
  .given('A mounted component that calls useSuspense({Argument}), inside a Suspense boundary.')
  .when('A LoadUser action starts, and then finishes.')
  .then('The boundary shows the fallback while the action runs.')
  .and('When the action finishes, the component shows the new state.')
  .example(val('Argument', 'LoadUser'))
  .example(val('Argument', '[LoadUser]'))
  .example(val('Argument', '[LoadUser, LoadPosts]'))
  .run(async (ctx) => {
    const type = argumentFor[ctx.example.val('Argument') as string];
    const store = createStore();
    const log: string[] = [];
    const Profile = profile(log, () => type);
    const m = await mount(
      <StoreProvider store={store}><Suspense fallback={<i>loading</i>}><Profile /></Suspense></StoreProvider>);
    expect(shown(m)).toBe('count=0');

    const finish = new Deferred<void>();
    const user = new LoadUser(finish.promise);
    await act(async () => store.dispatch(user));
    expect(shown(m)).toBe('loading');

    await finishAction(store, user, finish);
    expect(shown(m)).toBe('count=1');
  });
