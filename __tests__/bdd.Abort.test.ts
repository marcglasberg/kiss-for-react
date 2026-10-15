import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act, ReactTestRenderer } from 'react-test-renderer';
import { AbortDispatchException, KissAction, Store, StoreProvider, useStore, useStoreEffect } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('Abort');
const logger = (_obj: any) => {};

class State {
  constructor(readonly text: string) {
  }

  toString() {
    return `State(${this.text})`;
  }
}

// A promise that only resolves when `open` is called. Used to choose when each request finishes.
class Gate {
  open!: () => void;
  readonly promise = new Promise<void>(resolve => this.open = resolve);
}

const openGate = (): Gate => {
  const gate = new Gate();
  gate.open();
  return gate;
};

const newStore = (initialText = 'Initial') => new Store<State>({ initialState: new State(initialText), logger: logger });

// Simulates `fetch`: returns the `text` when the `gate` opens, or rejects with the signal's
// reason (an `AbortError`) as soon as the `signal` is aborted.
function fakeFetch(text: string, gate: Gate, signal: AbortSignal, trace: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    signal.addEventListener('abort', () => {
      trace.push(`${text} cancelled`);
      reject(signal.reason);
    });
    gate.promise.then(() => resolve(text));
  });
}

// Loads the `text` (the request finishes when the `gate` opens), and puts it into the state.
// The request does NOT use the `abortSignal`, so it can't be cancelled.
class LoadText extends KissAction<State> {
  constructor(readonly text: string, readonly gate: Gate, readonly trace: string[] = []) { super(); }

  async reduce() {
    this.trace.push(`reduce ${this.text}`);
    await this.gate.promise;
    this.trace.push(`${this.text} isAborted:${this.isAborted}`);
    return (_state: State) => new State(this.text);
  }
}

// Same as `LoadText`, but the request uses the `abortSignal`, like `fetch` would.
class FetchText extends KissAction<State> {
  constructor(readonly text: string, readonly gate: Gate, readonly trace: string[] = []) { super(); }

  async reduce() {
    const text = await fakeFetch(this.text, this.gate, this.abortSignal, this.trace);
    return (_state: State) => new State(text);
  }
}

// ---------------------------------------------------------------------------------------------
// store.abort(type)

Bdd(feature)
  .scenario('The store aborts the actions of a type that are in progress.')
  .given('Two actions of the same type, dispatched with "A" and "B", with requests that use the abortSignal.')
  .when('The store aborts that action type.')
  .then('Both requests are cancelled, and both actions finish aborted: dispatchAndWait resolves, and their status says it was aborted.')
  .and('Their isAborted is true, and their abortSignal is aborted.')
  .and('The state is unchanged, the action type is not waiting anymore, and did not fail.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();

    const actionA = new FetchText('A', new Gate(), trace);
    const actionB = new FetchText('B', new Gate(), trace);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(actionB);
    expect(store.isWaiting(FetchText)).toBe(true);
    expect(actionA.isAborted).toBe(false);

    store.abort(FetchText);

    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(true);
    expect(actionA.abortSignal.aborted).toBe(true);
    expect(actionB.abortSignal.aborted).toBe(true);
    expect(trace).toEqual(['A cancelled', 'B cancelled']);

    const statusA = await promiseA;
    const statusB = await promiseB;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(statusB.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');
    expect(store.isWaiting(FetchText)).toBe(false);
    expect(store.isFailed(FetchText)).toBe(false);
  });

Bdd(feature)
  .scenario('The store aborts the actions of the subtypes too.')
  .given('An action type, and a subtype of it, both with an action in progress.')
  .when('The store aborts the supertype.')
  .then('Both actions are aborted.')
  .run(async (_) => {
    class FetchSubText extends FetchText {
    }

    const trace: string[] = [];
    const store = newStore();

    const actionA = new FetchText('A', new Gate(), trace);
    const actionB = new FetchSubText('B', new Gate(), trace);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(actionB);

    store.abort(FetchText);

    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(true);
    expect((await promiseA).isDispatchAborted).toBe(true);
    expect((await promiseB).isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('The store aborts only the actions with the given statusKey.')
  .given('An action type with a statusKey, dispatched with "A" and "B".')
  .when('The store aborts that action type, with the statusKey of "A".')
  .then('"A" is aborted, but "B" is not: it finishes, and changes the state.')
  .and('The action type is still waiting for "B", but not for "A".')
  .run(async (_) => {
    class FetchByKey extends FetchText {
      get statusKey() { return this.text; }
    }

    const trace: string[] = [];
    const store = newStore();
    const gateB = new Gate();

    const actionA = new FetchByKey('A', new Gate(), trace);
    const actionB = new FetchByKey('B', gateB, trace);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(actionB);

    store.abort(FetchByKey, { statusKey: 'A' });

    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(false);
    expect(trace).toEqual(['A cancelled']);
    expect((await promiseA).isDispatchAborted).toBe(true);
    expect(store.isWaiting(FetchByKey, { statusKey: 'A' })).toBe(false);
    expect(store.isWaiting(FetchByKey, { statusKey: 'B' })).toBe(true);

    gateB.open();
    expect((await promiseB).isDispatchAborted).toBe(false);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('Aborting an action type with no action in progress does nothing.')
  .given('An action type with no action in progress.')
  .when('The store aborts that action type.')
  .and('Then the action is dispatched.')
  .then('The action runs normally, and changes the state.')
  .run(async (_) => {
    const store = newStore();
    store.abort(FetchText);

    const action = new FetchText('A', openGate());
    const status = await store.dispatchAndWait(action);
    expect(action.isAborted).toBe(false);
    expect(status.isDispatchAborted).toBe(false);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('Aborting an action type does not affect the other action types.')
  .given('Two different action types, each with an action in progress.')
  .when('The store aborts one of the types.')
  .then('The action of the other type is not aborted, and changes the state.')
  .run(async (_) => {
    class FetchOther extends KissAction<State> {
      constructor(readonly gate: Gate) { super(); }

      async reduce() {
        await this.gate.promise;
        return (_state: State) => new State('Other');
      }
    }

    const store = newStore();
    const gateOther = new Gate();

    const actionA = new FetchText('A', new Gate());
    const actionOther = new FetchOther(gateOther);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseOther = store.dispatchAndWait(actionOther);

    store.abort(FetchText);
    expect(actionA.isAborted).toBe(true);
    expect(actionOther.isAborted).toBe(false);

    await promiseA;
    gateOther.open();
    await promiseOther;
    expect(store.state.text).toBe('Other');
  });

// ---------------------------------------------------------------------------------------------
// Requests that don't use the abortSignal.

Bdd(feature)
  .scenario('The result of an aborted action is ignored, even if its request does not use the abortSignal.')
  .given('An action in progress, whose request does not use the abortSignal.')
  .when('The store aborts the action type.')
  .then('The action is still waiting, since its request cannot be cancelled.')
  .and('When the request finishes, the result is ignored: the state is unchanged, and the action finishes aborted.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    const gate = new Gate();

    const action = new LoadText('A', gate, trace);
    const promise = store.dispatchAndWait(action);

    store.abort(LoadText);
    expect(action.isAborted).toBe(true);
    expect(store.isWaiting(LoadText)).toBe(true);

    gate.open();
    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['reduce A', 'A isAborted:true']);
    expect(store.state.text).toBe('Initial');
    expect(store.isWaiting(LoadText)).toBe(false);
  });

Bdd(feature)
  .scenario('The error of an aborted action is ignored.')
  .given('An action in progress, whose request will fail with some error.')
  .when('The store aborts the action type, and then the request fails.')
  .then('The error is ignored: the action finishes aborted, and does not count as failed.')
  .run(async (_) => {
    class LoadAndFail extends LoadText {
      async reduce(): Promise<(state: State) => State> {
        await this.gate.promise;
        throw new Error('Failed');
      }
    }

    const store = newStore();
    const gate = new Gate();

    const action = new LoadAndFail('A', gate);
    const promise = store.dispatchAndWait(action);

    store.abort(LoadAndFail);
    gate.open();

    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
    expect(store.isFailed(LoadAndFail)).toBe(false);
  });

Bdd(feature)
  .scenario('Work that checks the abortSignal between its steps stops at the check.')
  .given('An action in progress, with two steps, that calls abortSignal.throwIfAborted() between them.')
  .when('The store aborts the action type during the first step.')
  .then('The second step does not run, and the action finishes aborted.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadTwoSteps extends KissAction<State> {
      constructor(readonly gate: Gate) { super(); }

      async reduce() {
        trace.push('step 1');
        await this.gate.promise;
        this.abortSignal.throwIfAborted();
        trace.push('step 2');
        return (_state: State) => new State('A');
      }
    }

    const store = newStore();
    const gate = new Gate();

    const action = new LoadTwoSteps(gate);
    const promise = store.dispatchAndWait(action);

    store.abort(LoadTwoSteps);
    gate.open();

    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['step 1']);
    expect(store.state.text).toBe('Initial');
  });

// ---------------------------------------------------------------------------------------------
// action.abort()

Bdd(feature)
  .scenario('An action instance can be aborted by itself, without affecting the others of its type.')
  .given('Two actions of the same type in progress, "A" and "B".')
  .when('The action "A" is aborted with its abort() method.')
  .then('"A" is aborted, but "B" is not: it finishes, and changes the state.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    const gateB = new Gate();

    const actionA = new FetchText('A', new Gate(), trace);
    const actionB = new FetchText('B', gateB, trace);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(actionB);

    actionA.abort();

    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(false);
    expect(trace).toEqual(['A cancelled']);
    expect((await promiseA).isDispatchAborted).toBe(true);

    gateB.open();
    expect((await promiseB).isDispatchAborted).toBe(false);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('An action aborted before it is dispatched does not run.')
  .given('An action that was not dispatched yet.')
  .when('The action is aborted with its abort() method, and then dispatched.')
  .then('Its reducer does not run, and the action finishes aborted.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();

    const action = new LoadText('A', openGate(), trace);
    action.abort();
    expect(action.isAborted).toBe(true);

    const status = await store.dispatchAndWait(action);
    expect(status.isDispatchAborted).toBe(true);
    expect(status.hasFinishedMethodReduce).toBe(false);
    expect(trace).toEqual([]);
    expect(store.state.text).toBe('Initial');
    expect(store.isWaiting(LoadText)).toBe(false);
  });

Bdd(feature)
  .scenario('Aborting an action that already finished has no effect.')
  .given('An action that finished, and changed the state.')
  .when('The action is aborted with its abort() method.')
  .then('Its isAborted is still false, and its abortSignal is not aborted.')
  .run(async (_) => {
    const store = newStore();

    const action = new FetchText('A', openGate());
    await store.dispatchAndWait(action);
    expect(store.state.text).toBe('A');

    action.abort();
    expect(action.isAborted).toBe(false);
    expect(action.abortSignal.aborted).toBe(false);
  });

// ---------------------------------------------------------------------------------------------
// Aborting during before, and during retry.

Bdd(feature)
  .scenario('An action aborted during its before method does not run its reducer.')
  .given('An action with an ASYNC before method, which is in progress.')
  .when('The store aborts the action type, while the before method is still running.')
  .then('The reducer does not run, and the action finishes aborted.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadAfterBefore extends LoadText {
      constructor(text: string, gate: Gate, trace: string[], readonly beforeGate: Gate) { super(text, gate, trace); }

      async before() { await this.beforeGate.promise; }
    }

    const store = newStore();
    const beforeGate = new Gate();

    const action = new LoadAfterBefore('A', openGate(), trace, beforeGate);
    const promise = store.dispatchAndWait(action);

    store.abort(LoadAfterBefore);
    beforeGate.open();

    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(status.hasFinishedMethodBefore).toBe(true);
    expect(trace).toEqual([]);
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('An action aborted while waiting to retry stops retrying right away.')
  .given('An action with retry, with a long retry delay, whose first attempt failed, so it waits to retry.')
  .when('The store aborts the action type.')
  .then('The action stops waiting, and finishes aborted, without retrying.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadWithRetry extends LoadText {
      retry = { initialDelay: 5000 };

      async reduce(): Promise<(state: State) => State> {
        this.trace.push(`reduce ${this.text}`);
        await this.gate.promise;
        throw new Error('Failed');
      }
    }

    const store = newStore();

    const action = new LoadWithRetry('A', openGate(), trace);
    const promise = store.dispatchAndWait(action);
    await delayMillis(10); // The first attempt failed, and the action waits 5 seconds to retry.
    expect(trace).toEqual(['reduce A']);

    store.abort(LoadWithRetry);

    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['reduce A']);
    expect(store.isFailed(LoadWithRetry)).toBe(false);
  });

Bdd(feature)
  .scenario('An action aborted during an attempt is not retried when the attempt fails.')
  .given('An action with retry, whose first attempt is running.')
  .when('The store aborts the action type, and then the attempt fails.')
  .then('The action is not retried, and finishes aborted.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadWithRetry extends LoadText {
      retry = { initialDelay: 10 };

      async reduce(): Promise<(state: State) => State> {
        this.trace.push(`reduce ${this.text}`);
        await this.gate.promise;
        throw new Error('Failed');
      }
    }

    const store = newStore();
    const gate = new Gate();

    const action = new LoadWithRetry('A', gate, trace);
    const promise = store.dispatchAndWait(action);

    store.abort(LoadWithRetry);
    gate.open();

    const status = await promise;
    await delayMillis(50);
    expect(status.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['reduce A']);
  });

// ---------------------------------------------------------------------------------------------
// The abortSignal.

Bdd(feature)
  .scenario('The abortSignal of an aborted action has an AbortError as its reason, like a cancelled fetch.')
  .given('An action in progress.')
  .when('The store aborts the action type.')
  .then('The reason of its abortSignal is an AbortError, and a fetch that rejects with it is aborted silently.')
  .run(async (_) => {
    const store = newStore();

    const action = new FetchText('A', new Gate());
    const promise = store.dispatchAndWait(action);

    store.abort(FetchText);
    expect(action.abortSignal.reason.name).toBe('AbortError');

    const status = await promise;
    expect(status.isDispatchAborted).toBe(true);
    expect(status.originalError).toBeInstanceOf(AbortDispatchException);
  });

// ---------------------------------------------------------------------------------------------
// Aborting from a component.

Bdd(feature)
  .scenario('A component can abort the action it started, when it unmounts.')
  .given('A component that dispatches an action on mount, and aborts the action type on unmount.')
  .when('The component unmounts while the action is in progress.')
  .then('The request is cancelled, and the action finishes aborted, without changing the state.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    let action!: FetchText;

    const Comp: React.FC = () => {
      useStoreEffect({
        onMount: (s: Store<State>) => {
          action = new FetchText('A', new Gate(), trace);
          s.dispatch(action);
        },
        onUnmount: (s: Store<State>) => s.abort(FetchText),
      });
      return null;
    };

    const renderer = await render(store, Comp);
    expect(store.isWaiting(FetchText)).toBe(true);
    expect(action.isAborted).toBe(false);

    await unmount(renderer);
    expect(action.isAborted).toBe(true);
    expect(trace).toEqual(['A cancelled']);
    expect(store.isWaiting(FetchText)).toBe(false);
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('A component can abort an action type with the abort function from useStore.')
  .given('A component that gets the abort function from useStore, destructured.')
  .and('An action of some type in progress.')
  .when('The component calls abort with that action type.')
  .then('The action is aborted.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    let abortFromHook!: (type: abstract new (...args: any[]) => KissAction<State>) => void;

    const Comp: React.FC = () => {
      const { abort } = useStore();
      abortFromHook = abort;
      return null;
    };

    const renderer = await render(store, Comp);

    const action = new FetchText('A', new Gate(), trace);
    const promise = store.dispatchAndWait(action);
    expect(action.isAborted).toBe(false);

    abortFromHook(FetchText);

    expect(action.isAborted).toBe(true);
    expect(trace).toEqual(['A cancelled']);
    expect((await promise).isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');

    await unmount(renderer);
  });

// ---------------------------------------------------------------------------------------------
// React helpers.

async function render(store: Store<State>, Comp: React.FC) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(StoreProvider<State>, { store, children: React.createElement(Comp) }));
  });
  await flush();
  return renderer;
}

async function unmount(renderer: ReactTestRenderer) {
  await act(async () => {
    renderer.unmount();
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
  });
}
