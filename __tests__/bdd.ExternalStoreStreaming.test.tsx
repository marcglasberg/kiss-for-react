/**
 * @jest-environment jsdom
 * @jest-environment-options {"customExportConditions": ["node", "node-addons"]}
 */
import './fixtures/jsdomNodeGlobals'; // Must come first: see the file.
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { act, Suspense } from 'react';
import { Writable } from 'stream';
import { renderToPipeableStream } from 'react-dom/server';
import { KissAction, Store, StoreProvider, useIsWaiting, useSelect } from '../src';
import { failOnConsoleErrors, hydrate, unmountAll } from './fixtures/dom';
import { Deferred } from './fixtures/deferred';

// Streaming SSR: `renderToPipeableStream` (Node) and `renderToReadableStream` (edge runtimes)
// send the shell first, and the content of the Suspense boundaries that resolve later in more
// chunks, with inline scripts that put it in place. The Node build of `react-dom/server` is
// also used in this jsdom environment, since Jest resolves it with the `node` condition, and
// the DOM is needed to hydrate the streamed HTML. React 18 only has `renderToReadableStream`
// in the browser build, so that one is loaded from `react-dom/server.browser`, on both versions.
// The jsdom environment lacks a few Node globals the renderers use: see `fixtures/jsdomNodeGlobals`.

reporter(new FeatureFileReporter());
failOnConsoleErrors([
  /useLayoutEffect does nothing on the server/,
  // The streaming renderer marks the context objects as its own and never clears the mark (the
  // legacy `renderToString` uses a separate mark). So, in this process, where the server and the
  // client renderer share the same context objects, the client warns when it renders a provider
  // after a stream. A real server and a real browser are separate processes. Hydration
  // mismatches are reported through `onRecoverableError`, which the scenarios check.
  /Detected multiple renderers concurrently rendering the same context provider/,
]);
afterEach(unmountAll);

const feature = new Feature('Streaming server rendering');

class State {
  constructor(readonly count: number) {}
}

class Increment extends KissAction<State> {
  reduce() {
    return new State(this.state.count + 1);
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

function createStore(count: number) {
  return new Store<State>({ initialState: new State(count), logger: () => {}, showUserException: () => {} });
}

const Count: React.FC = () => <span>{useSelect((s: State) => s.count)}</span>;
const Waiting: React.FC = () => <em>{String(useIsWaiting(Load))}</em>;
const LateCount: React.FC = () => <b>{useSelect((s: State) => s.count)}</b>;

/** A lazy component that loads when the test resolves `release`. Each test makes its own. */
function lazyLateCount() {
  const release = new Deferred<void>();
  const Lazy = React.lazy(() => release.promise.then(() => ({ default: LateCount })));
  return { Lazy, release };
}

/** The page: the count in the shell, and again inside a Suspense boundary that resolves later. */
function page(store: Store<State>, Lazy: React.ComponentType) {
  return (
    <StoreProvider store={store} serverState={store.state}>
      <div>
        <Count />
        <Waiting />
        <Suspense fallback={<i>loading</i>}>
          <Lazy />
        </Suspense>
      </div>
    </StoreProvider>
  );
}

/** Streams `element` with `renderToPipeableStream`, and collects the chunks as they arrive. */
function streamToChunks(element: React.ReactElement, { pipeOn }: { pipeOn: 'shell' | 'all' }) {
  const chunks: string[] = [];
  const errors: unknown[] = [];
  const shellReady = new Deferred<void>();
  const finished = new Deferred<void>();
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
    final(callback) {
      finished.resolve();
      callback();
    },
  });
  const stream = renderToPipeableStream(element, {
    onShellReady() {
      shellReady.resolve();
      if (pipeOn === 'shell') stream.pipe(sink);
    },
    onAllReady() {
      if (pipeOn === 'all') stream.pipe(sink);
    },
    onError(error) {
      errors.push(error);
    },
  });
  return { chunks, errors, shellReady: shellReady.promise, finished: finished.promise };
}

/** Waits until the stream wrote at least `n` chunks. */
async function untilChunks(chunks: string[], n: number): Promise<void> {
  for (let i = 0; i < 100 && chunks.length < n; i++) await new Promise((resolve) => setTimeout(resolve, 1));
}

Bdd(feature)
  .scenario('The state appears in the streamed HTML: in the shell, and in a Suspense boundary that resolves later.')
  .given('A server store whose count is 5, and a page showing the count in the shell and in a lazy component inside Suspense.')
  .when('The page is streamed with renderToPipeableStream, piping when the shell is ready.')
  .then('The first chunk has the shell: the count, no action waiting, and the Suspense fallback.')
  .and('A later chunk, written when the lazy component loads, has the count rendered by the lazy component.')
  .and('No error is reported, no action is dispatched, and the store has no subscription.')
  .run(async (_) => {
    const store = createStore(0);
    for (let i = 0; i < 5; i++) await store.dispatchAndWait(new Increment());
    const { Lazy, release } = lazyLateCount();

    const streamed = streamToChunks(page(store, Lazy), { pipeOn: 'shell' });
    await streamed.shellReady;
    await untilChunks(streamed.chunks, 1);

    const shell = streamed.chunks[0];
    expect(shell).toContain('<span>5</span>');
    expect(shell).toContain('<em>false</em>');
    expect(shell).toContain('<i>loading</i>');
    expect(shell).not.toContain('<b>5</b>');

    release.resolve();
    await streamed.finished;

    expect(streamed.chunks.length).toBeGreaterThan(1);
    expect(streamed.chunks.slice(1).join('')).toContain('<b>5</b>');
    expect(streamed.errors).toEqual([]);
    expect(store.dispatchCount).toBe(5);
    await store.dispose();
  });

Bdd(feature)
  .scenario('Hydrating the complete streamed HTML produces no mismatch, and the components then follow the client store.')
  .given('The HTML of a page streamed by a server store with count 5, complete (piped when all was ready).')
  .and('A client store created with the same state.')
  .when('The client hydrates the HTML.')
  .then('There is no recoverable hydration error, and the page shows the server state.')
  .and('An action dispatched on the client updates the shell and the Suspense content.')
  .run(async (_) => {
    const serverStore = createStore(5);
    const { Lazy, release } = lazyLateCount();
    release.resolve();
    const streamed = streamToChunks(page(serverStore, Lazy), { pipeOn: 'all' });
    await streamed.finished;
    const html = streamed.chunks.join('');
    expect(html).toContain('<span>5</span>');
    expect(html).toContain('<b>5</b>');
    expect(html).not.toContain('<script'); // All was ready, so nothing is put in place later.
    expect(streamed.errors).toEqual([]);

    const clientStore = createStore(5);
    const m = await hydrate(html, page(clientStore, Lazy));

    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('5false5');

    await act(async () => clientStore.dispatch(new Increment()));
    expect(m.text()).toBe('6false6');

    const finish = new Deferred<void>();
    await act(async () => clientStore.dispatch(new Load(finish.promise)));
    expect(m.text()).toBe('6true6');
    finish.resolve();
    await act(async () => clientStore.waitAllActions([]));
    expect(m.text()).toBe('6false6');
  });

Bdd(feature)
  .scenario('When the client store changed before hydrating streamed HTML, hydration uses the serverState, then catches up.')
  .given('The complete streamed HTML of a server store with count 5.')
  .and('A client store created with count 5, where an action then changed the count to 6 before hydrating.')
  .when('The client hydrates the HTML, giving the server state as serverState.')
  .then('There is no recoverable hydration error.')
  .and('The page then shows 6, in the shell and in the Suspense content.')
  .run(async (_) => {
    const serverStore = createStore(5);
    const serverState = serverStore.state;
    const { Lazy, release } = lazyLateCount();
    release.resolve();
    const streamed = streamToChunks(page(serverStore, Lazy), { pipeOn: 'all' });
    await streamed.finished;
    const html = streamed.chunks.join('');

    const clientStore = createStore(5);
    clientStore.dispatch(new Increment());
    expect(clientStore.state.count).toBe(6);

    const m = await hydrate(html, (
      <StoreProvider store={clientStore} serverState={serverState}>
        <div>
          <Count />
          <Waiting />
          <Suspense fallback={<i>loading</i>}>
            <Lazy />
          </Suspense>
        </div>
      </StoreProvider>
    ));

    expect(m.recoverableErrors).toEqual([]);
    expect(m.text()).toBe('6false6');
  });

Bdd(feature)
  .scenario('Two requests streamed at the same time, with their own stores, do not mix their states.')
  .given('Store A with count 1 and store B with count 2, each with a lazy component that loads at a different time.')
  .when('Both pages are streamed at the same time, and the lazy component of B loads before the one of A.')
  .then('Each streamed HTML shows only the count of its own store, in the shell and in the Suspense content.')
  .run(async (_) => {
    const storeA = createStore(1);
    const storeB = createStore(2);
    const lazyA = lazyLateCount();
    const lazyB = lazyLateCount();

    const streamedA = streamToChunks(page(storeA, lazyA.Lazy), { pipeOn: 'shell' });
    const streamedB = streamToChunks(page(storeB, lazyB.Lazy), { pipeOn: 'shell' });
    await Promise.all([streamedA.shellReady, streamedB.shellReady]);
    lazyB.release.resolve();
    await streamedB.finished;
    lazyA.release.resolve();
    await streamedA.finished;

    const htmlA = streamedA.chunks.join('');
    const htmlB = streamedB.chunks.join('');
    expect(htmlA).toContain('<span>1</span>');
    expect(htmlA).toContain('<b>1</b>');
    expect(htmlA).not.toContain('>2<');
    expect(htmlB).toContain('<span>2</span>');
    expect(htmlB).toContain('<b>2</b>');
    expect(htmlB).not.toContain('>1<');
    expect([...streamedA.errors, ...streamedB.errors]).toEqual([]);
  });

Bdd(feature)
  .scenario('The page also streams with renderToReadableStream, used by edge runtimes.')
  .given('A server store with count 7, and the page with a lazy component inside Suspense.')
  .when('The page is streamed with renderToReadableStream, and the whole stream is read.')
  .then('The HTML has the count in the shell and in the Suspense content, and no error is reported.')
  .run(async (_) => {
    // React 18 exposes this runtime subpath but its types only declare the shared server API.
    const browserEntry: string = 'react-dom/server.browser';
    const { renderToReadableStream }: Pick<typeof import('react-dom/server'), 'renderToReadableStream'> =
      await import(browserEntry);

    const store = createStore(7);
    const { Lazy, release } = lazyLateCount();
    const errors: unknown[] = [];
    const stream: ReadableStream<Uint8Array> & { allReady: Promise<void> } = await renderToReadableStream(page(store, Lazy), {
      onError: (error: unknown) => { errors.push(error); },
    });
    release.resolve();
    await stream.allReady;

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let html = '';
    for (let next = await reader.read(); !next.done; next = await reader.read()) html += decoder.decode(next.value);

    expect(html).toContain('<span>7</span>');
    expect(html).toContain('<b>7</b>');
    expect(errors).toEqual([]);
  });
