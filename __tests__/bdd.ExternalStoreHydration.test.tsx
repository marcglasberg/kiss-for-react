/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { act, Suspense } from 'react';
import { renderToString } from 'react-dom/server';
import {
  KissAction,
  Store,
  StoreProvider,
  useExceptionFor,
  useIsFailed,
  useIsStoreReady,
  useIsWaiting,
  useObject,
  useSelect,
  UserException,
} from '../src';
import { failOnConsoleErrors, hydrate, unmountAll, useCommitProbe } from './fixtures/dom';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// Scenario IDs H03, H04, H05 and H08 of STATE_REFACTOR.md.

reporter(new FeatureFileReporter());
// React 18 warns that the `useLayoutEffect` of the test's own commit probe does nothing during
// `renderToString` (React 19 doesn't). That's the test fixture, not Kiss, so it's allowed here.
failOnConsoleErrors([/useLayoutEffect does nothing on the server/]);
afterEach(unmountAll);

const feature = new Feature('Hydrating server HTML with a client store');

class State {
  constructor(readonly name: string, readonly age: number) {}
}

class SetName extends KissAction<State> {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return new State(this.name, this.state.age);
  }
}

class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return null;
  }
}

class Fail extends KissAction<State> {
  reduce(): State {
    throw new UserException('failed on the client');
  }
}

function createStore(initialState: State, persistor?: ControlledPersistor<State>) {
  return new Store<State>({ initialState, persistor, logger: () => {}, showUserException: () => {} });
}

/** A component that shows the name and the user, recording its renders and commits. */
function consumer() {
  const stats = { renders: 0, commits: [] as string[] };
  const User: React.FC = () => {
    stats.renders++;
    const name = useSelect((s: State) => s.name);
    const user = useObject((s: State) => ({ name: s.name, age: s.age }));
    const text = `${name}/${user.name}/${user.age}`;
    useCommitProbe(stats.commits, () => text);
    return <span>{text}</span>;
  };
  return { User, stats };
}

Bdd(feature)
  .scenario('Hydrating with the same state as the server produces no mismatch and no extra render.')
  .given('HTML rendered by a server store with the name Mary, and a client store created with the same state.')
  .when('The client hydrates the HTML.')
  .then('There is no recoverable hydration error, and the component rendered and committed once.')
  .and('A later state change updates the hydrated component.')
  .run(async (_) => {
    // H03
    const serverStore = createStore(new State('Mary', 30));
    const server = consumer();
    const html = renderToString(<StoreProvider store={serverStore}><server.User /></StoreProvider>);
    expect(html).toBe('<span>Mary/Mary/30</span>');

    const clientStore = createStore(new State('Mary', 30));
    const client = consumer();
    const m = await hydrate(html, <StoreProvider store={clientStore}><client.User /></StoreProvider>);

    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('Mary/Mary/30');
    expect(client.stats.renders).toBe(1);
    expect(client.stats.commits).toEqual(['Mary/Mary/30']);

    await act(async () => clientStore.dispatch(new SetName('Anna')));
    expect(m.text()).toBe('Anna/Anna/30');
  });

Bdd(feature)
  .scenario('When the client store changed before hydration, hydration uses the server state, then catches up.')
  .given('HTML rendered with the name Mary, and a client store created with Mary, where an action changed the name to Anna before hydrating.')
  .when('The client hydrates the HTML, giving the server state as serverState.')
  .then('There is no recoverable hydration error: the first commit shows Mary, as the HTML.')
  .and('The component then catches up, showing Anna.')
  .run(async (_) => {
    // H04
    const serverState = new State('Mary', 30);
    const html = renderToString(<StoreProvider store={createStore(serverState)}><Name /></StoreProvider>);

    const clientStore = createStore(new State('Mary', 30));
    clientStore.dispatch(new SetName('Anna'));
    expect(clientStore.state.name).toBe('Anna');

    const m = await hydrate(html, <StoreProvider store={clientStore} serverState={serverState}><Name /></StoreProvider>);

    expect(m.recoverableErrors).toEqual([]);
    expect(nameCommits).toEqual(['Mary', 'Anna']);
    expect(m.text()).toBe('Anna');
  });

const nameCommits: string[] = [];
const Name: React.FC = () => {
  const name = useSelect((s: State) => s.name);
  useCommitProbe(nameCommits, () => name);
  return <span>{name}</span>;
};
beforeEach(() => nameCommits.length = 0);

Bdd(feature)
  .scenario('A Suspense boundary hydrated later still matches the server HTML, and then catches up with the store.')
  .given('HTML with a name outside a Suspense boundary and a name inside it, both Mary.')
  .and('On the client, the component inside the boundary is lazy, so the boundary cannot hydrate right away.')
  .when('The client hydrates, the store changes the name to Anna while the boundary waits, and then the lazy component arrives.')
  .then('The outside name shows Anna before the boundary hydrates.')
  .and('The boundary hydrates with no recoverable error, and then shows Anna too.')
  .run(async (_) => {
    // H05
    const serverState = new State('Mary', 30);
    const Inner: React.FC = () => <b>{useSelect((s: State) => s.name)}</b>;
    const html = renderToString(
      <StoreProvider store={createStore(serverState)}>
        <Name /><Suspense fallback={<i>loading</i>}><Inner /></Suspense>
      </StoreProvider>);
    expect(html).toContain('<span>Mary</span>');
    expect(html).toContain('<b>Mary</b>');

    const gate = new Deferred<void>();
    const LazyInner = React.lazy(() => gate.promise.then(() => ({ default: Inner })));
    const clientStore = createStore(new State('Mary', 30));
    const m = await hydrate(html,
      <StoreProvider store={clientStore} serverState={serverState}>
        <Name /><Suspense fallback={<i>loading</i>}><LazyInner /></Suspense>
      </StoreProvider>);
    expect(m.text()).toBe('MaryMary');

    await act(async () => clientStore.dispatch(new SetName('Anna')));
    expect(m.container.querySelector('span')?.textContent).toBe('Anna');
    expect(m.container.querySelector('b')?.textContent).toBe('Mary');

    await act(async () => {
      gate.resolve();
      await gate.promise;
    });
    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('AnnaAnna');
  });

Bdd(feature)
  .scenario('Readiness and status hydrate as the server rendered them, and then follow the client store.')
  .given('HTML rendered by a server store without a persistor: ready, no action waiting or failed.')
  .and('A client store with a persistor still reading, where a Load action is running and a Fail action failed.')
  .when('The client hydrates the HTML, and later the persistor finishes reading and the Load action finishes.')
  .then('Hydration matches the HTML, with no recoverable error.')
  .and('The component then shows the client values: not ready, waiting, failed with its exception.')
  .and('When the store is ready and Load finishes, it shows ready and not waiting, still failed.')
  .run(async (_) => {
    // H08
    const Status: React.FC = () => {
      const isReady = useIsStoreReady();
      const isWaiting = useIsWaiting(Load);
      const isFailed = useIsFailed(Fail);
      const error = useExceptionFor(Fail);
      const text = `ready=${isReady},waiting=${isWaiting},failed=${isFailed},error=${error?.message ?? '-'}`;
      useCommitProbe(statusCommits, () => text);
      return <span>{text}</span>;
    };
    const statusCommits: string[] = [];
    const html = renderToString(<StoreProvider store={createStore(new State('Mary', 30))}><Status /></StoreProvider>);
    expect(html).toBe('<span>ready=true,waiting=false,failed=false,error=-</span>');

    const persistor = new ControlledPersistor<State>({ stateToRead: null });
    const clientStore = createStore(new State('Mary', 30), persistor);
    const finish = new Deferred<void>();
    // Dispatching before the store is ready is not allowed, so the failure and the running
    // action are set up after the read finishes, but before hydrating.
    persistor.finishReading();
    await clientStore.ready();
    clientStore.dispatch(new Fail());
    clientStore.dispatch(new Load(finish.promise));
    expect(clientStore.isFailed(Fail)).toBe(true);
    expect(clientStore.isWaiting(Load)).toBe(true);

    const persistor2 = new ControlledPersistor<State>({ stateToRead: null });
    const notReadyStore = createStore(new State('Mary', 30), persistor2);
    const m2 = await hydrate(html, <StoreProvider store={notReadyStore}><Status /></StoreProvider>);
    expect(m2.recoverableErrors).toEqual([]);
    expect(statusCommits[0]).toBe('ready=true,waiting=false,failed=false,error=-');
    expect(m2.text()).toBe('ready=false,waiting=false,failed=false,error=-');
    await act(async () => {
      persistor2.finishReading();
      await notReadyStore.ready();
    });
    expect(m2.text()).toBe('ready=true,waiting=false,failed=false,error=-');
    await m2.unmount();

    statusCommits.length = 0;
    const m = await hydrate(html, <StoreProvider store={clientStore}><Status /></StoreProvider>);
    expect(m.recoverableErrors).toEqual([]);
    expect(statusCommits[0]).toBe('ready=true,waiting=false,failed=false,error=-');
    expect(m.text()).toBe('ready=true,waiting=true,failed=true,error=failed on the client');

    await act(async () => {
      finish.resolve();
      await clientStore.waitAllActions([]);
    });
    expect(m.text()).toBe('ready=true,waiting=false,failed=true,error=failed on the client');
  });
