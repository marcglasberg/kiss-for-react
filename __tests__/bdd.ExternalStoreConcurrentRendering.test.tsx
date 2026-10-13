/**
 * @jest-environment jsdom
 */
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React, { startTransition, Suspense, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { KissAction, Store, StoreProvider, useIsStoreReady, useIsWaiting, useObject, useSelect } from '../src';
import { clearLog, flushMicrotasks, flushNumberOfYields, hasPendingWork, log, settle } from './fixtures/schedulerMock';
import { ControlledPersistor } from './fixtures/ControlledPersistor';
import { Deferred } from './fixtures/deferred';

// Scenario IDs G01 to G10 (and B11) of STATE_REFACTOR.md.
//
// These tests drive React's scheduler by hand, with the mock scheduler React uses in its own
// tests, so that a concurrent render (a transition) can be paused after one component read the
// store, the store changed while the render is paused, and the render resumed. They run outside
// `act()`, since `act()` bypasses the scheduler.

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('scheduler', () => require('./fixtures/schedulerMock').SchedulerMock);

reporter(new FeatureFileReporter());

const feature = new Feature('Concurrent rendering never commits a mix of two store versions');

let consoleErrors: string[] = [];
let spies: jest.SpyInstance[] = [];
const roots: { root: Root, container: HTMLDivElement }[] = [];

beforeEach(() => {
  // Outside `act()`, React would warn about every update. The tests flush the work themselves.
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = false;
  consoleErrors = [];
  spies = (['error', 'warn'] as const).map((method) =>
    jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      consoleErrors.push(args.map(String).join(' '));
    }));
  clearLog();
});

afterEach(async () => {
  for (const { root, container } of roots.splice(0)) {
    root.unmount();
    await settle();
    container.remove();
  }
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  for (const spy of spies) spy.mockRestore();
  expect(consoleErrors).toEqual([]);
});

class State {
  constructor(readonly a: number, readonly b: number, readonly key: string = 'k1', readonly other: number = 0) {}
}

/** Keeps a and b equal: a valid state always has a === b. */
class SetVersion extends KissAction<State> {
  constructor(readonly version: number) {
    super();
  }

  reduce() {
    return new State(this.version, this.version, this.state.key, this.state.other);
  }
}

class SetA extends KissAction<State> {
  constructor(readonly a: number) {
    super();
  }

  reduce() {
    return new State(this.a, this.state.b, this.state.key, this.state.other);
  }
}

class SetB extends KissAction<State> {
  constructor(readonly b: number) {
    super();
  }

  reduce() {
    return new State(this.state.a, this.b, this.state.key, this.state.other);
  }
}

class SetKey extends KissAction<State> {
  constructor(readonly key: string) {
    super();
  }

  reduce() {
    return new State(this.state.a, this.state.b, this.key, this.state.other);
  }
}

class SetOther extends KissAction<State> {
  constructor(readonly other: number) {
    super();
  }

  reduce() {
    return new State(this.state.a, this.state.b, this.state.key, this.other);
  }
}

class Load extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return (state: State) => new State(state.a + 1, state.b + 1, state.key, state.other);
  }
}

function createStore(initialState = new State(1, 1)) {
  return new Store<State>({ initialState, logger: () => {} });
}

/**
 * Renders `element` in a new root, and flushes all the work. Returns the visible text of the
 * container (React hides the content of a suspended Suspense boundary with `display: none`).
 * The `onContainer` callback gets the container before anything renders.
 */
async function render(element: React.ReactElement, onContainer: (container: HTMLElement) => void = () => {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  onContainer(container);
  const root = createRoot(container);
  roots.push({ root, container });
  root.render(element);
  await settle();
  return { text: () => visibleText(container), container };
}

/** The text of the element, without the elements hidden with `display: none`. */
function visibleText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof HTMLElement && node.style.display === 'none') return '';
  return Array.from(node.childNodes).map(visibleText).join('');
}

/** Records the whole text of the container after every commit of the component that calls it. */
function useCommitProbe(commits: string[], container: () => HTMLElement) {
  useLayoutEffect(() => {
    const text = visibleText(container());
    if (commits[commits.length - 1] !== text) commits.push(text);
  });
}

/** Counts the active subscriptions made through a subscribe function of the store. */
function countListeners(store: Store<State>, which: '_subscribeState' | '_subscribeReady') {
  const count = { active: 0 };
  const subscribe = store[which];
  store[which] = (listener) => {
    count.active++;
    const unsubscribe = subscribe(listener);
    return () => {
      count.active--;
      unsubscribe();
    };
  };
  return count;
}

/** Starts a transition and lets React schedule it, without flushing it. */
async function startTransitionAndSchedule(update: () => void) {
  startTransition(update);
  await flushMicrotasks();
  // The mock scheduler of React 19 can say that the work is pending; the one of React 18 can't.
  // In both, the next `flushNumberOfYields(1)` proves the work by rendering exactly one step.
  if (hasPendingWork() !== null) expect(hasPendingWork()).toBe(true);
}

/** Checks that no commit mixed two versions: every committed tuple has a === b. */
function expectConsistentCommits(commits: string[]) {
  for (const commit of commits) {
    const a = /a=(\d+)/.exec(commit)?.[1];
    const b = /b=(\d+)/.exec(commit)?.[1];
    if (a !== undefined && b !== undefined) expect(`${commit}: a=${a} b=${b}`).toBe(`${commit}: a=${a} b=${a}`);
  }
}

Bdd(feature)
  .scenario('A transition that mounts two related consumers does not commit one of them with an older store version.')
  .given('A store at version 1 (a=1, b=1), and a panel with a consumer of a and a consumer of b, shown by a transition.')
  .when('The transition renders the a consumer, and is paused before rendering the b consumer.')
  .and('While it is paused, the store changes to version 2 (a=2, b=2), and then the transition resumes.')
  .then('The paused render really happened: the a consumer rendered version 1, and nothing was committed.')
  .and('No commit shows a=1 with b=2: the final commit shows version 2 for both.')
  .run(async (_) => {
    // G01
    const store = createStore();
    const commits: string[] = [];
    let container!: HTMLElement;
    let setShow!: (show: boolean) => void;

    const A: React.FC = () => {
      const a = useSelect((s: State) => s.a);
      log(`A:${a}`);
      useCommitProbe(commits, () => container);
      return <span>{`a=${a}`}</span>;
    };
    const B: React.FC = () => {
      const b = useSelect((s: State) => s.b);
      log(`B:${b}`);
      useCommitProbe(commits, () => container);
      return <span>{`b=${b}`}</span>;
    };
    const App: React.FC = () => {
      const [show, setShowState] = useState(false);
      setShow = setShowState;
      return show ? <><A /><B /></> : <span>empty</span>;
    };

    const r = await render(<StoreProvider store={store}><App /></StoreProvider>, (c) => container = c);
    expect(r.text()).toBe('empty');
    clearLog();

    await startTransitionAndSchedule(() => setShow(true));
    expect(clearLog()).toEqual([]);

    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['A:1']);
    expect(r.text()).toBe('empty');

    store.dispatch(new SetVersion(2));
    await flushMicrotasks();
    expect(r.text()).toBe('empty');

    await settle();
    expect(r.text()).toBe('a=2b=2');
    expectConsistentCommits(commits);
    expect(commits).toEqual(['a=2b=2']);
    const resumed = clearLog();
    expect(resumed).toContain('B:2');
    expect(resumed[resumed.length - 1]).toBe('B:2');
    expect(resumed.length).toBeLessThan(10);
  });

Bdd(feature)
  .scenario('A consumer mounted by a transition, that read the store before subscribing, cannot commit a stale value.')
  .given('A store at version 1, with no consumer mounted, and a consumer of b shown by a transition.')
  .when('The transition renders the consumer (which has not subscribed yet), and is paused.')
  .and('While it is paused, the store changes to version 2, and then the transition resumes.')
  .then('The paused render really happened: the consumer rendered version 1, and nothing was committed.')
  .and('The consumer never commits version 1: its first commit shows version 2, without waiting for another store change.')
  .run(async (_) => {
    // G02
    const store = createStore();
    const listeners = countListeners(store, '_subscribeState');
    const commits: string[] = [];
    let container!: HTMLElement;
    let setShow!: (show: boolean) => void;

    const B: React.FC = () => {
      const b = useSelect((s: State) => s.b);
      log(`B:${b}`);
      useCommitProbe(commits, () => container);
      return <span>{`b=${b}`}</span>;
    };
    const App: React.FC = () => {
      const [show, setShowState] = useState(false);
      setShow = setShowState;
      return show ? <B /> : <span>empty</span>;
    };

    const r = await render(<StoreProvider store={store}><App /></StoreProvider>, (c) => container = c);
    clearLog();

    await startTransitionAndSchedule(() => setShow(true));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['B:1']);
    expect(r.text()).toBe('empty');
    expect(listeners.active).toBe(0);

    store.dispatch(new SetVersion(2));
    await settle();

    expect(r.text()).toBe('b=2');
    expect(commits).toEqual(['b=2']);
    expect(listeners.active).toBe(1);
  });

Bdd(feature)
  .scenario('An abandoned transition with another selector does not replace the committed selector.')
  .given('A component that selects the field named by its local state, committed selecting a.')
  .when('A transition changes the field to b, renders, and is paused; then an urgent (flushSync) update sets the field back to a.')
  .and('After both settle, the store changes b, and then changes a.')
  .then('The component keeps showing a, and the change of b does not render it.')
  .and('The change of a renders it with the new value.')
  .run(async (_) => {
    // G03
    const store = createStore(new State(1, 10));
    const renders = { count: 0 };
    let setField!: (field: 'a' | 'b') => void;

    const Comp: React.FC = () => {
      const [field, setFieldState] = useState<'a' | 'b'>('a');
      setField = setFieldState;
      const value = useSelect((s: State) => s[field]);
      renders.count++;
      log(`${field}:${value}`);
      return <span>{`${field}=${value}`}</span>;
    };

    const r = await render(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(r.text()).toBe('a=1');
    clearLog();

    await startTransitionAndSchedule(() => setField('b'));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['b:10']);
    expect(r.text()).toBe('a=1');

    // A transition is only interrupted by an urgent update (a default-priority update lets it
    // finish first). `flushSync` makes the update urgent, so the paused render is thrown away.
    flushSync(() => setField('a'));
    expect(r.text()).toBe('a=1');
    await settle();
    expect(r.text()).toBe('a=1');
    expect(renders.count).toBeLessThan(6);
    clearLog();
    const rendersAfterAbandon = renders.count;

    store.dispatch(new SetB(20));
    await settle();
    expect(r.text()).toBe('a=1');
    expect(renders.count).toBe(rendersAfterAbandon);
    expect(clearLog()).toEqual([]);

    store.dispatch(new SetA(7));
    await settle();
    expect(r.text()).toBe('a=7');
    expect(clearLog()).toEqual(['a:7']);
  });

Bdd(feature)
  .scenario('An abandoned transition cannot leak its speculative useObject result into the committed tree.')
  .given('A component using useObject with a shape chosen by local state, committed with the shape {x}, passed to a memoized child.')
  .when('A transition changes the shape to {x, y}, renders, and is paused; then an urgent (flushSync) update sets the shape back to {x}.')
  .and('After both settle, an unrelated field of the store changes.')
  .then('The component keeps returning the very same {x} object it committed, so the memoized child does not render.')
  .and('When x changes, a new object is returned and the child renders.')
  .run(async (_) => {
    // G04 (and B11)
    const store = createStore();
    const results: object[] = [];
    const childRenders = { count: 0 };
    let setShape!: (shape: 'x' | 'xy') => void;

    const Child = React.memo(function Child({ value }: { value: { x: number, y?: number } }) {
      childRenders.count++;
      return <span>{`x=${value.x}${value.y === undefined ? '' : `,y=${value.y}`}`}</span>;
    });

    const Comp: React.FC = () => {
      const [shape, setShapeState] = useState<'x' | 'xy'>('x');
      setShape = setShapeState;
      const value = useObject((s: State) => shape === 'x' ? { x: s.a } : { x: s.a, y: s.b });
      results.push(value);
      log(shape);
      return <Child value={value} />;
    };

    const r = await render(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(r.text()).toBe('x=1');
    const committed = results[results.length - 1];
    expect(childRenders.count).toBe(1);
    clearLog();

    await startTransitionAndSchedule(() => setShape('xy'));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['xy']);
    expect(r.text()).toBe('x=1');

    flushSync(() => setShape('x'));
    await settle();
    expect(r.text()).toBe('x=1');
    expect(results[results.length - 1]).toBe(committed);
    expect(childRenders.count).toBe(1);

    store.dispatch(new SetOther(5));
    await settle();
    expect(results[results.length - 1]).toBe(committed);
    expect(childRenders.count).toBe(1);

    store.dispatch(new SetA(2));
    await settle();
    expect(r.text()).toBe('x=2');
    expect(results[results.length - 1]).not.toBe(committed);
    expect(childRenders.count).toBe(2);
  });

Bdd(feature)
  .scenario('A render that suspends on a store value, resumed after the store changed again, shows the current value.')
  .given('A component that selects a key and suspends while the data for that key is not loaded, inside a Suspense boundary.')
  .and('The data for k1 and k3 is loaded, but not for k2.')
  .when('The store key changes to k2 (the component suspends), then to k3 (loaded), and then the data for k2 arrives.')
  .then('The component shows k3, and the arrival of k2 does not bring back an obsolete result.')
  .and('The component has exactly one subscription to the store.')
  .run(async (_) => {
    // G05
    const store = createStore();
    const listeners = countListeners(store, '_subscribeState');
    const loaded = new Set(['k1', 'k3']);
    const pending = new Map<string, Deferred<void>>();
    const load = (key: string) => {
      let d = pending.get(key);
      if (d === undefined) {
        d = new Deferred<void>();
        pending.set(key, d);
      }
      return d.promise;
    };

    const Comp: React.FC = () => {
      const key = useSelect((s: State) => s.key);
      if (!loaded.has(key)) throw load(key);
      log(`key:${key}`);
      return <span>{`key=${key}`}</span>;
    };

    const r = await render(
      <StoreProvider store={store}><Suspense fallback={<span>loading</span>}><Comp /></Suspense></StoreProvider>);
    expect(r.text()).toBe('key=k1');
    clearLog();

    store.dispatch(new SetKey('k2'));
    await settle();
    expect(r.text()).toBe('loading');

    store.dispatch(new SetKey('k3'));
    await settle();
    expect(r.text()).toBe('key=k3');

    loaded.add('k2');
    pending.get('k2')!.resolve();
    await settle();
    expect(r.text()).toBe('key=k3');
    expect(clearLog()).not.toContain('key:k2');
    expect(listeners.active).toBe(1);
  });

Bdd(feature)
  .scenario('An urgent local update that interrupts a transition reading the store leaves only valid commits.')
  .given('Two consumers of a and b, which also show a label from a transition and a counter from urgent updates.')
  .when('A transition changes the label, renders the first consumer, and is paused.')
  .and('An urgent (flushSync) update changes the counter, then the store changes to version 2, and everything settles.')
  .then('Every commit shows the same version for a and b, and the final commit shows the new label, counter and version.')
  .and('The work stays bounded: no render loop.')
  .run(async (_) => {
    // G06
    const store = createStore();
    const commits: string[] = [];
    let container!: HTMLElement;
    let setLabel!: (label: string) => void;
    let setUrgent!: (urgent: number) => void;

    const A: React.FC<{ label: string }> = ({ label }) => {
      const a = useSelect((s: State) => s.a);
      log(`A:${label}:${a}`);
      useCommitProbe(commits, () => container);
      return <span>{`a=${a}:${label};`}</span>;
    };
    const B: React.FC<{ label: string }> = ({ label }) => {
      const b = useSelect((s: State) => s.b);
      log(`B:${label}:${b}`);
      useCommitProbe(commits, () => container);
      return <span>{`b=${b}:${label};`}</span>;
    };
    const App: React.FC = () => {
      const [label, setLabelState] = useState('x');
      const [urgent, setUrgentState] = useState(0);
      setLabel = setLabelState;
      setUrgent = setUrgentState;
      return <><A label={label} /><B label={label} /><span>{`u=${urgent}`}</span></>;
    };

    const r = await render(<StoreProvider store={store}><App /></StoreProvider>, (c) => container = c);
    expect(r.text()).toBe('a=1:x;b=1:x;u=0');
    clearLog();

    await startTransitionAndSchedule(() => setLabel('y'));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['A:y:1']);

    flushSync(() => setUrgent(1));
    expect(r.text()).toBe('a=1:x;b=1:x;u=1');
    store.dispatch(new SetVersion(2));
    await settle();

    expect(r.text()).toBe('a=2:y;b=2:y;u=1');
    expectConsistentCommits(commits);
    expect(commits[commits.length - 1]).toBe('a=2:y;b=2:y;u=1');
    expect(clearLog().length).toBeLessThan(20);
  });

Bdd(feature)
  .scenario('A dispatch wrapped in startTransition still updates the consumers as a synchronous store update.')
  .given('A mounted consumer of a and b.')
  .when('The store changes to version 2 inside startTransition.')
  .then('The consumers show version 2 as soon as the microtasks run, without the transition work being flushed.')
  .and('The work stays bounded.')
  .run(async (_) => {
    // G07: store-driven updates always use React's synchronous priority. This is the documented
    // behavior of useSyncExternalStore, and the test pins it down.
    const store = createStore();
    const renders = { count: 0 };
    const Comp: React.FC = () => {
      renders.count++;
      const a = useSelect((s: State) => s.a);
      const b = useSelect((s: State) => s.b);
      return <span>{`a=${a}b=${b}`}</span>;
    };
    const r = await render(<StoreProvider store={store}><Comp /></StoreProvider>);
    expect(r.text()).toBe('a=1b=1');

    startTransition(() => store.dispatch(new SetVersion(2)));
    await flushMicrotasks();
    expect(r.text()).toBe('a=2b=2');

    await settle();
    expect(r.text()).toBe('a=2b=2');
    expect(renders.count).toBe(2);
  });

Bdd(feature)
  .scenario('A paused render with a state consumer and a status consumer is not committed with the state of before and the status of after.')
  .given('A Load action in progress, and a panel with a consumer of the count and a consumer of the waiting status, shown by a transition.')
  .when('The transition renders the count consumer (count 0) and is paused before the status consumer.')
  .and('While paused, the action finishes (count 1, not waiting), and then the transition resumes.')
  .then('No commit shows count 0 with waiting false.')
  .and('The final commit shows count 1 and waiting false.')
  .run(async (_) => {
    // G08
    const store = createStore(new State(0, 0));
    const commits: string[] = [];
    let container!: HTMLElement;
    let setShow!: (show: boolean) => void;

    const Count: React.FC = () => {
      const count = useSelect((s: State) => s.a);
      log(`count:${count}`);
      useCommitProbe(commits, () => container);
      return <span>{`count=${count};`}</span>;
    };
    const Waiting: React.FC = () => {
      const waiting = useIsWaiting(Load);
      log(`waiting:${waiting}`);
      useCommitProbe(commits, () => container);
      return <span>{`waiting=${waiting};`}</span>;
    };
    const App: React.FC = () => {
      const [show, setShowState] = useState(false);
      setShow = setShowState;
      return show ? <><Count /><Waiting /></> : <span>empty</span>;
    };

    const r = await render(<StoreProvider store={store}><App /></StoreProvider>, (c) => container = c);
    const finish = new Deferred<void>();
    store.dispatch(new Load(finish.promise));
    expect(store.isWaiting(Load)).toBe(true);
    clearLog();

    await startTransitionAndSchedule(() => setShow(true));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['count:0']);
    expect(r.text()).toBe('empty');

    finish.resolve();
    await store.waitAllActions([]);
    expect(store.state.a).toBe(1);
    expect(store.isWaiting(Load)).toBe(false);
    await settle();

    expect(r.text()).toBe('count=1;waiting=false;');
    expect(commits).not.toContain('count=0;waiting=false;');
    expect(commits).toEqual(['count=1;waiting=false;']);
  });

Bdd(feature)
  .scenario('An old store that becomes ready while a transition replaces it cannot update the tree committed with the new store.')
  .given('A provider with store 1 (not ready, count 1), and a consumer showing readiness and the count.')
  .and('Store 2 is ready, with count 2.')
  .when('A transition switches the provider to store 2, renders the consumer, and is paused.')
  .and('While paused, store 1 becomes ready and restores count 100; then the transition resumes.')
  .then('The final commit shows store 2: ready, count 2.')
  .and('Store 1 has no subscription left, and a later change of store 1 does not change what is shown.')
  .run(async (_) => {
    // G09
    const persistor = new ControlledPersistor<State>({ stateToRead: new State(100, 100) });
    const store1 = new Store<State>({ initialState: new State(1, 1), persistor, logger: () => {} });
    const store2 = createStore(new State(2, 2));
    const state1 = countListeners(store1, '_subscribeState');
    const ready1 = countListeners(store1, '_subscribeReady');
    const state2 = countListeners(store2, '_subscribeState');
    let setWhich!: (which: 1 | 2) => void;

    const Consumer: React.FC = () => {
      const isReady = useIsStoreReady();
      const count = useSelect((s: State) => s.a);
      log(`ready:${isReady},count:${count}`);
      return <span>{`ready=${isReady},count=${count}`}</span>;
    };
    const App: React.FC = () => {
      const [which, setWhichState] = useState<1 | 2>(1);
      setWhich = setWhichState;
      return <StoreProvider store={which === 1 ? store1 : store2}><Consumer /></StoreProvider>;
    };

    const r = await render(<App />);
    expect(r.text()).toBe('ready=false,count=1');
    clearLog();

    await startTransitionAndSchedule(() => setWhich(2));
    flushNumberOfYields(1);
    expect(clearLog()).toEqual(['ready:true,count:2']);
    expect(r.text()).toBe('ready=false,count=1');

    persistor.finishReading();
    await store1.ready();
    expect(store1.state.a).toBe(100);
    await settle();

    expect(r.text()).toBe('ready=true,count=2');
    expect(state1.active).toBe(0);
    expect(ready1.active).toBe(0);
    expect(state2.active).toBe(1);

    store1.dispatch(new SetVersion(500));
    await settle();
    expect(r.text()).toBe('ready=true,count=2');
  });

Bdd(feature)
  .scenario('When a store change makes a component suspend, the Suspense fallback shows until the data arrives.')
  .given('A component that selects a key and suspends while the data for that key is not loaded, inside a Suspense boundary showing k1.')
  .when('The store key changes to k2, whose data is not loaded, and later the data arrives.')
  .then('The fallback shows while the data is missing: a store update is synchronous, not a transition, so React hides the old content and shows the fallback.')
  .and('The component shows k2 when the data arrives.')
  .run(async (_) => {
    // G10: the documented Suspense behavior of store-driven updates.
    const store = createStore();
    const loaded = new Set(['k1']);
    const gate = new Deferred<void>();
    const Comp: React.FC = () => {
      const key = useSelect((s: State) => s.key);
      if (!loaded.has(key)) throw gate.promise;
      return <span>{`key=${key}`}</span>;
    };
    const r = await render(
      <StoreProvider store={store}><Suspense fallback={<span>loading</span>}><Comp /></Suspense></StoreProvider>);
    expect(r.text()).toBe('key=k1');

    store.dispatch(new SetKey('k2'));
    await settle();
    expect(r.text()).toBe('loading');

    loaded.add('k2');
    gate.resolve();
    await settle();
    // React throttles the reveal of content that replaces a fallback shown less than 300 ms
    // ago (FALLBACK_THROTTLE_MS), with a real timer. So this waits for it.
    await new Promise((resolve) => setTimeout(resolve, 350));
    await settle();
    expect(r.text()).toBe('key=k2');
  });
