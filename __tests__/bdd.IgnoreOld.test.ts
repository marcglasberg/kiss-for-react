import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import {
  AbortDispatchException,
  KissAction,
  OptimisticCommand,
  OptimisticSync,
  OptimisticSyncWithPush,
  Poll,
  PushMetadata,
  ServerPush,
  Store,
  StoreException,
  UserException,
} from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('IgnoreOld');
const logger = (_obj: any) => {};

class State {
  constructor(readonly text: string, readonly cache: Record<string, string> = {}) {
  }

  withCached(id: string, text: string) {
    return new State(this.text, { ...this.cache, [id]: text });
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

// Simulates `fetch`: returns the `text` when the `gate` opens, or throws an `AbortError` as
// soon as the `signal` is aborted.
function fakeFetch(text: string, gate: Gate, signal: AbortSignal, trace: string[]): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    signal.addEventListener('abort', () => {
      trace.push(`${text} cancelled`);
      const error = new Error('The operation was aborted.');
      error.name = 'AbortError';
      reject(error);
    });
    gate.promise.then(() => resolve(text));
  });
}

// Loads the `text` (the request finishes when the `gate` opens), and puts it into the state.
class LoadText extends KissAction<State> {
  ignoreOld: boolean = true;

  constructor(readonly text: string, readonly gate: Gate, readonly trace: string[] = []) { super(); }

  async reduce(): Promise<((state: State) => State) | null> {
    await this.gate.promise;
    this.trace.push(`${this.text} isAborted:${this.isAborted}`);
    return (state: State) => new State(this.text, state.cache);
  }
}

// Same as `LoadText`, but the request uses the `abortSignal`, like `fetch` would.
class FetchText extends KissAction<State> {
  ignoreOld: boolean = true;

  constructor(readonly text: string, readonly gate: Gate, readonly trace: string[] = []) { super(); }

  async reduce() {
    const text = await fakeFetch(this.text, this.gate, this.abortSignal, this.trace);
    return (state: State) => new State(text, state.cache);
  }
}

// ---------------------------------------------------------------------------------------------
// The results of old actions.

Bdd(feature)
  .scenario('The result of an older action is ignored when a newer action is dispatched.')
  .given('An action with ignoreOld.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The state has "B", since the result of "A" is ignored.')
  .and('The action "A" is aborted silently: dispatchAndWait resolves, and its status says it was aborted.')
  .run(async (_) => {
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new LoadText('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(new LoadText('B', gateB));

    gateB.open();
    await promiseB;
    expect(store.state.text).toBe('B');

    gateA.open();
    const statusA = await promiseA;
    expect(store.state.text).toBe('B');
    expect(statusA.isDispatchAborted).toBe(true);
    expect(statusA.isCompletedOk).toBe(false);
    expect(statusA.isCompletedFailed).toBe(true);
    expect(statusA.hasFinishedMethodAfter).toBe(true);
    expect(statusA.originalError).toBeInstanceOf(AbortDispatchException);
    expect(statusA.wrappedError).toBeNull();
    expect(actionA.isAborted).toBe(true);
  });

Bdd(feature)
  .scenario('Without ignoreOld, the result of an older action overwrites the newer one.')
  .given('An action WITHOUT ignoreOld.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The state has "A", which is old information.')
  .run(async (_) => {
    class LoadTextAllowOld extends LoadText {
      ignoreOld = false;
    }

    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new LoadTextAllowOld('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(new LoadTextAllowOld('B', gateB));

    gateB.open();
    await promiseB;
    gateA.open();
    const statusA = await promiseA;

    expect(store.state.text).toBe('A');
    expect(statusA.isCompletedOk).toBe(true);
    expect(actionA.isAborted).toBe(false);
  });

Bdd(feature)
  .scenario('The result of an older action is ignored even if it arrives before the newer one.')
  .given('An action with ignoreOld.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "A" finishes first, and then the request for "B".')
  .then('The state is not changed by "A", while "B" is loading.')
  .and('The state has "B" at the end.')
  .run(async (_) => {
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const promiseA = store.dispatchAndWait(new LoadText('A', gateA));
    const promiseB = store.dispatchAndWait(new LoadText('B', gateB));

    gateA.open();
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');
    expect(store.isWaiting(LoadText)).toBe(true);

    gateB.open();
    await promiseB;
    expect(store.state.text).toBe('B');
    expect(store.isWaiting(LoadText)).toBe(false);
  });

Bdd(feature)
  .scenario('Only the newest action changes the state.')
  .given('An action with ignoreOld.')
  .when('The action is dispatched with "A", "B" and "C", in this order.')
  .and('The requests finish in the order "B", "C", "A".')
  .then('Only the result of "C" is applied.')
  .run(async (_) => {
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate(), gateC = new Gate();
    const states: string[] = [];
    store.dispatchAndWait(new LoadText('A', gateA)).then(() => states.push(`A:${store.state.text}`));
    store.dispatchAndWait(new LoadText('B', gateB)).then(() => states.push(`B:${store.state.text}`));
    store.dispatchAndWait(new LoadText('C', gateC)).then(() => states.push(`C:${store.state.text}`));

    gateB.open();
    await delayMillis(5);
    gateC.open();
    await delayMillis(5);
    gateA.open();
    await store.waitAllActions([]);

    expect(states).toEqual(['B:Initial', 'C:C', 'A:C']);
    expect(store.state.text).toBe('C');
  });

Bdd(feature)
  .scenario('An old action is aborted even if its reducer returns null.')
  .given('An action with ignoreOld, whose reducer returns null.')
  .when('The action is dispatched with "A", and then the same action is dispatched again.')
  .and('The reducer of "A" returns null.')
  .then('The action "A" is aborted silently.')
  .run(async (_) => {
    class LoadNothing extends LoadText {
      async reduce() {
        await this.gate.promise;
        return null;
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadNothing('A', gateA));
    const promiseB = store.dispatchAndWait(new LoadNothing('B', new Gate()));

    gateA.open();
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');
    store.setShutDown(true);
    void promiseB;
  });

Bdd(feature)
  .scenario('A newer action makes the older ones old, even if it does not change the state.')
  .given('An action with ignoreOld.')
  .when('The action is dispatched with "A", and then again, but this time its reducer returns null.')
  .and('The second action finishes first, and then the request for "A".')
  .then('The state is not changed, since the result of "A" is ignored.')
  .run(async (_) => {
    class LoadNothing extends LoadText {
      async reduce() {
        await this.gate.promise;
        return null;
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const actionA = new LoadText('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    // Same key as `LoadText`, so that it can make "A" old.
    const statusB = await store.dispatchAndWait(new class extends LoadNothing {
      computeIgnoreOldKey() { return [LoadText, null]; }
    }('B', openGate()));
    expect(statusB.isCompletedOk).toBe(true);

    gateA.open();
    await promiseA;
    expect(store.state.text).toBe('Initial');
    expect(actionA.isAborted).toBe(true);
  });

Bdd(feature)
  .scenario('If the newer action fails, the older results are still ignored.')
  .given('An action with ignoreOld.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "B" fails, and then the request for "A" finishes.')
  .then('The state is not changed.')
  .and('The error of "B" is processed as usual, and "B" is not old.')
  .run(async (_) => {
    class LoadOrFail extends LoadText {
      async reduce() {
        await this.gate.promise;
        if (this.text === 'B') throw new UserException('Failed B');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const shown: string[] = [];
    const store = new Store<State>({
      initialState: new State('Initial'),
      logger: logger,
      showUserException: (exception, _count, next) => {
        shown.push(exception.message);
        next();
      },
    });
    const gateA = new Gate(), gateB = new Gate();

    const promiseA = store.dispatchAndWait(new LoadOrFail('A', gateA));
    const actionB = new LoadOrFail('B', gateB);
    const promiseB = store.dispatchAndWait(actionB);

    gateB.open();
    const statusB = await promiseB;
    expect(statusB.isCompletedFailed).toBe(true);
    expect(statusB.isDispatchAborted).toBe(false);
    expect(actionB.isAborted).toBe(false);
    expect(store.isFailed(LoadOrFail)).toBe(true);
    expect(shown).toEqual(['Failed B']);

    gateA.open();
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('The result of a SYNC reducer is ignored when the action becomes old during an ASYNC before.')
  .given('An action with ignoreOld, with an ASYNC before, and a SYNC reducer.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The before of "B" finishes first, and then the before of "A".')
  .then('The state has "B", since the result of "A" is ignored.')
  .run(async (_) => {
    class SetText extends KissAction<State> {
      ignoreOld = true;

      constructor(readonly text: string, readonly gate: Gate) { super(); }

      async before() { await this.gate.promise; }

      reduce() { return new State(this.text); }
    }

    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const promiseA = store.dispatchAndWait(new SetText('A', gateA));
    const promiseB = store.dispatchAndWait(new SetText('B', gateB));

    gateB.open();
    await promiseB;
    expect(store.state.text).toBe('B');

    gateA.open();
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('A SYNC action with ignoreOld is still SYNC.')
  .given('An action with ignoreOld, with a SYNC reducer.')
  .when('The action is dispatched with dispatchSync, twice.')
  .then('Each one changes the state right away.')
  .run(async (_) => {
    class SetText extends KissAction<State> {
      ignoreOld = true;

      constructor(readonly text: string) { super(); }

      reduce() { return new State(this.text); }
    }

    const store = newStore();
    const actionA = new SetText('A');
    store.dispatchSync(actionA);
    expect(store.state.text).toBe('A');

    store.dispatchSync(new SetText('B'));
    expect(store.state.text).toBe('B');
    expect(actionA.isAborted).toBe(false);
    expect(actionA.status.isCompletedOk).toBe(true);
  });

Bdd(feature)
  .scenario('The result of an old action is ignored even when it goes through a custom wrapReduce.')
  .given('An action with ignoreOld, and a custom wrapReduce that changes the result of the reducer.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The state has the result of "B", changed by the wrapReduce.')
  .run(async (_) => {
    class LoadWrapped extends LoadText {
      wrapReduce(reduce: () => any) {
        return async () => {
          const fn = await reduce();
          return (state: State) => new State(fn(state).text + '!', state.cache);
        };
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadWrapped('A', gateA));
    await store.dispatchAndWait(new LoadWrapped('B', openGate()));
    expect(store.state.text).toBe('B!');

    gateA.open();
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('B!');
  });

// ---------------------------------------------------------------------------------------------
// isAborted.

Bdd(feature)
  .scenario('An action becomes old as soon as a newer action is dispatched.')
  .given('An action with ignoreOld, dispatched with "A", which is still running.')
  .when('The action is dispatched with "B".')
  .then('"A" is old right away, and "B" is not.')
  .and('Both can check it with isAborted, after their requests finish.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new LoadText('A', gateA, trace);
    const actionB = new LoadText('B', gateB, trace);
    expect(actionA.isAborted).toBe(false);

    const promiseA = store.dispatchAndWait(actionA);
    expect(actionA.isAborted).toBe(false);

    const promiseB = store.dispatchAndWait(actionB);
    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(false);

    gateB.open();
    await promiseB;
    gateA.open();
    await promiseA;

    expect(trace).toEqual(['B isAborted:false', 'A isAborted:true']);
  });

Bdd(feature)
  .scenario('isAborted keeps the value it had when the action finished.')
  .given('An action with ignoreOld, dispatched with "A", "B" and "C".')
  .and('"B" finished before "C" was dispatched, while "A" was still running.')
  .then('"B" is not old, even after "C" is dispatched, and its abortSignal is not aborted.')
  .and('"A" is still old after it finishes, even after the keys are cleared.')
  .run(async (_) => {
    const store = newStore();
    const gateA = new Gate(), gateC = new Gate();

    const actionA = new LoadText('A', gateA);
    const actionB = new LoadText('B', openGate());
    const promiseA = store.dispatchAndWait(actionA);
    await store.dispatchAndWait(actionB);
    expect(actionB.isAborted).toBe(false);

    // "A" is still running, so the key is still kept by the store.
    const promiseC = store.dispatchAndWait(new LoadText('C', gateC));
    expect(actionB.isAborted).toBe(false);
    expect(actionB.abortSignal.aborted).toBe(false);

    gateA.open();
    await promiseA;
    gateC.open();
    await promiseC;

    store.clearInternalActionProps();
    expect(actionA.isAborted).toBe(true);
    expect(actionB.isAborted).toBe(false);
  });

Bdd(feature)
  .scenario('isAborted is always false for an action without ignoreOld.')
  .given('An action WITHOUT ignoreOld, dispatched with "A", which is still running.')
  .when('The action is dispatched with "B".')
  .then('"A" is not old.')
  .run(async (_) => {
    class LoadTextAllowOld extends LoadText {
      ignoreOld = false;
    }

    const store = newStore();
    const gateA = new Gate();
    const actionA = new LoadTextAllowOld('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    await store.dispatchAndWait(new LoadTextAllowOld('B', openGate()));
    expect(actionA.isAborted).toBe(false);

    gateA.open();
    await promiseA;
    expect(actionA.isAborted).toBe(false);
  });

Bdd(feature)
  .scenario('Only the state returned by the reducer of an old action is ignored. Its other effects still happen.')
  .given('An action with ignoreOld, whose reducer dispatches another action after its request finishes.')
  .and('The reducer {Checks isAborted} before dispatching it.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The other action is dispatched {Dispatched}.')
  .example(val('Checks isAborted', 'checks isAborted'), val('Dispatched', 'only by "B"'))
  .example(val('Checks isAborted', 'does not check isAborted'), val('Dispatched', 'by "B" and by "A"'))
  .run(async (ctx) => {
    const checks = ctx.example.val('Checks isAborted') === 'checks isAborted';
    const logged: string[] = [];

    class Log extends KissAction<State> {
      constructor(readonly text: string) { super(); }

      reduce() {
        logged.push(this.text);
        return null;
      }
    }

    class LoadAndLog extends LoadText {
      async reduce() {
        await this.gate.promise;
        if (!checks || !this.isAborted) this.dispatch(new Log(this.text));
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadAndLog('A', gateA));
    await store.dispatchAndWait(new LoadAndLog('B', openGate()));
    gateA.open();
    await promiseA;

    expect(logged).toEqual(checks ? ['B'] : ['B', 'A']);
    expect(store.state.text).toBe('B');
  });

// ---------------------------------------------------------------------------------------------
// abortSignal.

Bdd(feature)
  .scenario('The abortSignal of an action is aborted when it becomes old, which cancels its request.')
  .given('An action with ignoreOld, that passes its abortSignal to its request.')
  .when('The action is dispatched with "A", and then with "B", before the request for "A" finishes.')
  .then('The request for "A" is cancelled right away, and its signal is aborted with an AbortError.')
  .and('The action "A" is aborted silently, even though its request threw an AbortError.')
  .and('The state has "B" at the end, and the signal of "B" is not aborted.')
  .run(async (_) => {
    const trace: string[] = [];
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new FetchText('A', gateA, trace);
    const actionB = new FetchText('B', gateB, trace);
    const promiseA = store.dispatchAndWait(actionA);
    expect(actionA.abortSignal.aborted).toBe(false);

    const promiseB = store.dispatchAndWait(actionB);
    expect(actionA.abortSignal.aborted).toBe(true);
    expect(actionA.abortSignal.reason.name).toBe('AbortError');
    expect(trace).toEqual(['A cancelled']);

    // The action "A" finishes right away, without waiting for its gate.
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.isFailed(FetchText)).toBe(false);
    expect(store.state.text).toBe('Initial');

    gateB.open();
    const statusB = await promiseB;
    expect(statusB.isCompletedOk).toBe(true);
    expect(actionB.abortSignal.aborted).toBe(false);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('An old action can check its abortSignal between steps that do not accept a signal.')
  .given('An action with ignoreOld, that loads in two steps, and calls abortSignal.throwIfAborted() between them.')
  .and('It only reads its abortSignal after the first step.')
  .when('The action is dispatched with "A", and then with "B", during the first step of "A".')
  .then('The second step of "A" does not run, and "A" is aborted silently.')
  .run(async (_) => {
    const steps: string[] = [];

    class LoadInSteps extends LoadText {
      async reduce() {
        await this.gate.promise;
        steps.push(`${this.text} step 1`);
        this.abortSignal.throwIfAborted();
        steps.push(`${this.text} step 2`);
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadInSteps('A', gateA));
    await store.dispatchAndWait(new LoadInSteps('B', openGate()));
    gateA.open();
    const statusA = await promiseA;

    expect(steps).toEqual(['B step 1', 'B step 2', 'A step 1']);
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('The abortSignal of an action without ignoreOld is never aborted.')
  .given('An action WITHOUT ignoreOld, that passes its abortSignal to its request.')
  .when('The action is dispatched with "A", and then with "B", before the request for "A" finishes.')
  .then('The request for "A" is not cancelled.')
  .run(async (_) => {
    class FetchTextAllowOld extends FetchText {
      ignoreOld = false;
    }

    const trace: string[] = [];
    const store = newStore();
    const gateA = new Gate();

    const actionA = new FetchTextAllowOld('A', gateA, trace);
    const promiseA = store.dispatchAndWait(actionA);
    await store.dispatchAndWait(new FetchTextAllowOld('B', openGate(), trace));

    gateA.open();
    await promiseA;
    expect(actionA.abortSignal.aborted).toBe(false);
    expect(trace).toEqual([]);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('The abortSignal is always the same, and is not aborted before the action is dispatched.')
  .given('An action that was not dispatched yet.')
  .when('Its abortSignal is read twice.')
  .then('It is the same signal, and it is not aborted.')
  .run(async (_) => {
    const action = new LoadText('A', new Gate());
    expect(action.abortSignal).toBe(action.abortSignal);
    expect(action.abortSignal.aborted).toBe(false);
    expect(action.isAborted).toBe(false);
  });

// ---------------------------------------------------------------------------------------------
// The errors of old actions.

Bdd(feature)
  .scenario('The errors of an old action are ignored.')
  .given('An action with ignoreOld, that throws a {Error} when its request finishes.')
  .and('It has a wrapError, an after method, and the store has an errorObserver.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "A" finishes, and the action throws the error.')
  .then('The error is ignored: no error dialog, it does not count as failed, and dispatchAndWait resolves.')
  .and('Neither the wrapError nor the errorObserver are called, but the after method runs.')
  .example(val('Error', 'UserException'))
  .example(val('Error', 'Error'))
  .run(async (ctx) => {
    const isUserException = ctx.example.val('Error') === 'UserException';
    const shown: string[] = [];
    const observed: string[] = [];
    const wrapped: string[] = [];
    const after: string[] = [];

    class LoadAndFail extends LoadText {
      async reduce(): Promise<((state: State) => State) | null> {
        await this.gate.promise;
        if (this.text === 'A') throw isUserException ? new UserException('Failed A') : new Error('Failed A');
        return (state: State) => new State(this.text, state.cache);
      }

      wrapError(error: any) {
        wrapped.push(String(error));
        return error;
      }

      after() { after.push(this.text); }
    }

    const store = new Store<State>({
      initialState: new State('Initial'),
      logger: logger,
      showUserException: (exception, _count, next) => {
        shown.push(exception.message);
        next();
      },
      errorObserver: ({ error }) => {
        observed.push(String(error));
        return error;
      },
    });
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadAndFail('A', gateA));
    await store.dispatchAndWait(new LoadAndFail('B', openGate()));

    gateA.open();
    const statusA = await promiseA;

    expect(statusA.isDispatchAborted).toBe(true);
    expect(statusA.originalError).toBeInstanceOf(AbortDispatchException);
    expect(store.isFailed(LoadAndFail)).toBe(false);
    expect(shown).toEqual([]);
    expect(wrapped).toEqual([]);
    expect(observed).toEqual([]);
    expect(after).toEqual(['B', 'A']);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('The error thrown by the before method of an old action is ignored.')
  .given('An action with ignoreOld, whose ASYNC before method throws an error.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The before of "A" throws the error.')
  .then('The error is ignored, and "A" is aborted silently.')
  .run(async (_) => {
    class CheckAndLoad extends LoadText {
      async before() {
        await this.gate.promise;
        if (this.text === 'A') throw new Error('Failed before A');
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new CheckAndLoad('A', gateA));
    await store.dispatchAndWait(new CheckAndLoad('B', openGate()));
    gateA.open();
    const statusA = await promiseA;

    expect(statusA.isDispatchAborted).toBe(true);
    expect(statusA.hasFinishedMethodBefore).toBe(false);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('The error of an old action that nobody waits for does not become an unhandled rejection.')
  .given('An action with ignoreOld, that throws an error when its request finishes.')
  .when('The action is dispatched with "A" (without waiting for it), and then with "B".')
  .and('The request for "A" finishes, and the action throws the error.')
  .then('There is no unhandled rejection.')
  .run(async (_) => {
    class LoadAndFail extends LoadText {
      async reduce(): Promise<((state: State) => State) | null> {
        await this.gate.promise;
        if (this.text === 'A') throw new Error('Failed A');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const rejections: any[] = [];
    const onRejection = (reason: any) => rejections.push(reason);
    process.on('unhandledRejection', onRejection);
    try {
      const store = newStore();
      const gateA = new Gate();
      const actionA = new LoadAndFail('A', gateA);

      store.dispatch(actionA);
      await store.dispatchAndWait(new LoadAndFail('B', openGate()));
      gateA.open();
      await store.waitAllActions([]);
      await delayMillis(10);

      expect(actionA.status.isDispatchAborted).toBe(true);
      expect(rejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onRejection);
    }
  });

Bdd(feature)
  .scenario('A StoreException thrown by an old action is not ignored, since it points to a bug.')
  .given('An action with ignoreOld, that throws a StoreException when its request finishes.')
  .when('The action is dispatched with "A", and then with "B".')
  .and('The request for "A" finishes, and the action throws the StoreException.')
  .then('dispatchAndWait of "A" rejects with the StoreException.')
  .run(async (_) => {
    class LoadAndThrow extends LoadText {
      async reduce(): Promise<((state: State) => State) | null> {
        await this.gate.promise;
        if (this.text === 'A') throw new StoreException('Bug in A');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadAndThrow('A', gateA));
    await store.dispatchAndWait(new LoadAndThrow('B', openGate()));
    gateA.open();

    await expect(promiseA).rejects.toThrow('Bug in A');
    expect(store.state.text).toBe('B');
  });

// ---------------------------------------------------------------------------------------------
// Keys.

Bdd(feature)
  .scenario('Actions with different keys do not affect each other.')
  .given('An action with ignoreOld, that uses ignoreOldKeyParams to have a key per item id.')
  .and('It puts each loaded item into a cache.')
  .when('The action is dispatched for item "1", and then for item "2".')
  .and('The request for item "2" finishes first.')
  .then('Both items are put into the cache.')
  .and('But two actions for the same item do affect each other.')
  .run(async (_) => {
    class LoadItem extends KissAction<State> {
      ignoreOld = true;

      constructor(readonly id: string, readonly text: string, readonly gate: Gate) { super(); }

      ignoreOldKeyParams() { return this.id; }

      async reduce() {
        await this.gate.promise;
        return (state: State) => state.withCached(this.id, this.text);
      }
    }

    const store = newStore();
    const gate1 = new Gate(), gate2 = new Gate(), gate1b = new Gate();

    const action1 = new LoadItem('1', 'one', gate1);
    const promise1 = store.dispatchAndWait(action1);
    const promise2 = store.dispatchAndWait(new LoadItem('2', 'two', gate2));
    expect(action1.isAborted).toBe(false);

    gate2.open();
    await promise2;
    gate1.open();
    await promise1;

    expect(store.state.cache).toEqual({ '1': 'one', '2': 'two' });

    const promise1Old = store.dispatchAndWait(new LoadItem('1', 'older', gate1b));
    await store.dispatchAndWait(new LoadItem('1', 'newer', openGate()));
    gate1b.open();
    await promise1Old;

    expect(store.state.cache).toEqual({ '1': 'newer', '2': 'two' });
  });

Bdd(feature)
  .scenario('The params of the key are compared by their contents.')
  .given('An action with ignoreOld, whose ignoreOldKeyParams returns a new {Params} each time.')
  .when('The action is dispatched with params {First}, and then with params {Second}.')
  .then('The first action {Result}.')
  .example(val('Params', 'array'), val('First', '[1, "A"]'), val('Second', '[1, "A"]'), val('Result', 'becomes old'))
  .example(val('Params', 'array'), val('First', '[1, "A"]'), val('Second', '[1, "B"]'), val('Result', 'does not become old'))
  .example(val('Params', 'object'), val('First', '{ id: 1 }'), val('Second', '{ id: 1 }'), val('Result', 'becomes old'))
  .example(val('Params', 'object'), val('First', '{ id: 1 }'), val('Second', '{ id: 2 }'), val('Result', 'does not become old'))
  .run(async (ctx) => {
    const parse = (text: string) => text.startsWith('[')
      ? JSON.parse(text)
      : { id: Number(text.replace(/\D/g, '')) };

    class LoadWithParams extends LoadText {
      constructor(readonly params: any, gate: Gate) { super('X', gate); }

      ignoreOldKeyParams() { return Array.isArray(this.params) ? [...this.params] : { ...this.params }; }
    }

    const store = newStore();
    const first = new LoadWithParams(parse(ctx.example.val('First')), openGate());
    const second = new LoadWithParams(parse(ctx.example.val('Second')), openGate());
    const promise = store.dispatchAndWait(first);
    await store.dispatchAndWait(second);
    await promise;

    expect(first.isAborted).toBe(ctx.example.val('Result') === 'becomes old');
  });

Bdd(feature)
  .scenario('By default, actions of different classes do not affect each other.')
  .given('An action class with ignoreOld, and a subclass of it, that change the same part of the state.')
  .when('The class is dispatched with "A", and then the subclass with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The state has "A", since they have different keys.')
  .run(async (_) => {
    class LoadOtherText extends LoadText {
    }

    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const promiseA = store.dispatchAndWait(new LoadText('A', gateA));
    const promiseB = store.dispatchAndWait(new LoadOtherText('B', gateB));

    gateB.open();
    await promiseB;
    gateA.open();
    await promiseA;

    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('Actions of different classes affect each other when computeIgnoreOldKey returns the same key.')
  .given('Two different action classes with ignoreOld, that override computeIgnoreOldKey to return the same key.')
  .when('The first class is dispatched with "A", and then the second class with "B".')
  .and('The request for "B" finishes first, and then the request for "A".')
  .then('The state has "B", since the result of "A" is ignored.')
  .run(async (_) => {
    class LoadText1 extends LoadText {
      computeIgnoreOldKey() { return 'text'; }
    }

    class LoadText2 extends LoadText {
      computeIgnoreOldKey() { return 'text'; }
    }

    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new LoadText1('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(new LoadText2('B', gateB));
    expect(actionA.isAborted).toBe(true);

    gateB.open();
    await promiseB;
    gateA.open();
    await promiseA;

    expect(store.state.text).toBe('B');
  });

// ---------------------------------------------------------------------------------------------
// Dispatches that don't make the other actions old.

Bdd(feature)
  .scenario('A dispatch that is aborted before it runs does not make the running action old.')
  .given('An action with ignoreOld and {Feature}, dispatched with "A", which is still running.')
  .when('The action is dispatched with "B", which is aborted by {Feature}.')
  .then('"A" is not old, and its abortSignal is not aborted.')
  .and('The state has "A" at the end.')
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .example(val('Feature', 'abortDispatch'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature');

    class LoadAborted extends LoadText {
      constructor(text: string, gate: Gate) {
        super(text, gate);
        if (feature === 'throttle') (this as any).throttle = 1000;
        if (feature === 'fresh') (this as any).fresh = 1000;
      }

      abortDispatch() { return feature === 'abortDispatch' && this.text === 'B'; }
    }

    const store = newStore();
    const gateA = new Gate();

    const actionA = new LoadAborted('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    const statusB = await store.dispatchAndWait(new LoadAborted('B', openGate()));
    expect(statusB.isDispatchAborted).toBe(true);
    expect(actionA.isAborted).toBe(false);
    expect(actionA.abortSignal.aborted).toBe(false);

    gateA.open();
    await promiseA;
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('A newer action aborted by checkInternet still makes the older actions old.')
  .given('An action with ignoreOld and checkInternet set to abort, dispatched with "A", which is still running.')
  .when('There is no internet, and the action is dispatched with "B".')
  .then('"B" is aborted, since there is no internet.')
  .and('"A" is old, since "B" was dispatched, so the state is not changed.')
  .run(async (_) => {
    let internet = true;

    class LoadOnline extends LoadText {
      checkInternet = { abort: true as const };

      get internetOnOffSimulation() { return internet; }
    }

    const store = newStore();
    const gateA = new Gate();

    const actionA = new LoadOnline('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    await delayMillis(5); // "A" checked the internet, and its request started.

    internet = false;
    const statusB = await store.dispatchAndWait(new LoadOnline('B', openGate()));
    expect(statusB.isDispatchAborted).toBe(true);
    expect(actionA.isAborted).toBe(true);

    gateA.open();
    await promiseA;
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('Polling: only the dispatches that run the reducer make the running action old.')
  .given('An action with polling and ignoreOld, dispatched with "A" and Poll.once, which is still running.')
  .and('Polling is {Polling}.')
  .when('The action is dispatched with {Poll}.')
  .then('"A" {Result}.')
  .example(val('Polling', 'active'), val('Poll', 'Poll.stop'), val('Result', 'is not old'))
  .example(val('Polling', 'active'), val('Poll', 'Poll.start'), val('Result', 'is not old'))
  .example(val('Polling', 'not active'), val('Poll', 'Poll.start'), val('Result', 'is old'))
  .example(val('Polling', 'active'), val('Poll', 'Poll.runNowAndRestart'), val('Result', 'is old'))
  .example(val('Polling', 'active'), val('Poll', 'Poll.once'), val('Result', 'is old'))
  .run(async (ctx) => {
    const pollValues: Record<string, Poll> = {
      'Poll.stop': Poll.stop,
      'Poll.start': Poll.start,
      'Poll.runNowAndRestart': Poll.runNowAndRestart,
      'Poll.once': Poll.once,
    };

    class LoadPolled extends KissAction<State> {
      ignoreOld = true;
      pollInterval = 100000;

      constructor(readonly text: string, readonly gate: Gate, readonly poll = Poll.once) { super(); }

      createPollingAction() { return new LoadPolled(this.text, openGate()); }

      async reduce() {
        await this.gate.promise;
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    try {
      if (ctx.example.val('Polling') === 'active')
        await store.dispatchAndWait(new LoadPolled('Polling', openGate(), Poll.start));

      const gateA = new Gate();
      const actionA = new LoadPolled('A', gateA);
      const promiseA = store.dispatchAndWait(actionA);
      await store.dispatchAndWait(new LoadPolled('B', openGate(), pollValues[ctx.example.val('Poll')]));

      const isAborted = ctx.example.val('Result') === 'is old';
      expect(actionA.isAborted).toBe(isAborted);
      expect(actionA.abortSignal.aborted).toBe(isAborted);

      gateA.open();
      await promiseA;
      expect(store.state.text).toBe(isAborted ? 'B' : 'A');
    } finally {
      store.setShutDown(true);
    }
  });

// ---------------------------------------------------------------------------------------------
// Combining with other features.

Bdd(feature)
  .scenario('ignoreOld cancels an older debounced action whose request already started.')
  .given('An action with debounce and ignoreOld, that passes its abortSignal to its request.')
  .when('The action is dispatched with "A", and its request starts after the debounce period.')
  .and('Then it is dispatched with "B".')
  .then('The request for "A" is cancelled.')
  .and('The state has "B" at the end.')
  .run(async (_) => {
    class SearchText extends FetchText {
      debounce = 10;
    }

    const trace: string[] = [];
    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new SearchText('A', gateA, trace));
    await delayMillis(40); // The debounce period passed, and the request for "A" started.
    expect(trace).toEqual([]);

    await store.dispatchAndWait(new SearchText('B', openGate(), trace));
    expect(trace).toEqual(['A cancelled']);
    expect(store.state.text).toBe('B');

    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('A debounced action replaced during its wait time is old, and is aborted without running its reducer.')
  .given('An action with debounce and ignoreOld.')
  .when('The action is dispatched with "A", and then with "B" during the wait time.')
  .then('"A" is old, and finishes aborted, without running its reducer.')
  .and('"B" runs its reducer, and changes the state.')
  .run(async (_) => {
    class SearchText extends FetchText {
      debounce = 30;
    }

    const trace: string[] = [];
    const store = newStore();

    const actionA = new SearchText('A', openGate(), trace);
    const promiseA = store.dispatchAndWait(actionA);
    const promiseB = store.dispatchAndWait(new SearchText('B', openGate(), trace));

    const statusA = await promiseA;
    expect(actionA.isAborted).toBe(true);
    expect(statusA.isDispatchAborted).toBe(true);
    expect(statusA.hasFinishedMethodReduce).toBe(false);

    await promiseB;
    expect(trace).toEqual([]);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('An action that becomes old while waiting to retry stops retrying right away.')
  .given('An action with ignoreOld and retry, with a long retry delay.')
  .when('The action is dispatched with "A", and its request fails, so it waits to retry.')
  .and('Then it is dispatched with "B".')
  .then('The action "A" stops waiting, and is aborted silently, without retrying.')
  .and('The state has "B" at the end.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadWithRetry extends LoadText {
      retry = { initialDelay: 5000 };

      async reduce() {
        this.trace.push(`reduce ${this.text}`);
        await this.gate.promise;
        if (this.text === 'A') throw new Error('Failed A');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();

    const promiseA = store.dispatchAndWait(new LoadWithRetry('A', openGate(), trace));
    await delayMillis(10); // "A" failed, and is waiting 5 seconds to retry.

    const gateB = new Gate();
    const promiseB = store.dispatchAndWait(new LoadWithRetry('B', gateB, trace));

    // "A" finishes right away, while "B" is still running.
    const statusA = await promiseA;
    expect(statusA.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['reduce A', 'reduce B']);

    gateB.open();
    await promiseB;
    expect(trace).toEqual(['reduce A', 'reduce B']);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('An action that becomes old during an attempt is not retried when the attempt fails.')
  .given('An action with ignoreOld and retry.')
  .when('The action is dispatched with "A", and then with "B", while the first attempt of "A" is running.')
  .and('The first attempt of "A" fails.')
  .then('"A" is not retried, and is aborted silently.')
  .run(async (_) => {
    const trace: string[] = [];

    class LoadWithRetry extends LoadText {
      retry = { initialDelay: 10 };

      async reduce() {
        this.trace.push(`reduce ${this.text}`);
        await this.gate.promise;
        if (this.text === 'A') throw new Error('Failed A');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    const gateA = new Gate();

    const promiseA = store.dispatchAndWait(new LoadWithRetry('A', gateA, trace));
    await store.dispatchAndWait(new LoadWithRetry('B', openGate(), trace));
    gateA.open();
    const statusA = await promiseA;
    await delayMillis(50);

    expect(statusA.isDispatchAborted).toBe(true);
    expect(trace).toEqual(['reduce A', 'reduce B']);
    expect(store.state.text).toBe('B');
  });

Bdd(feature)
  .scenario('An action with ignoreOld and retry that does not become old retries as usual.')
  .given('An action with ignoreOld and retry, whose first attempt fails.')
  .when('The action is dispatched.')
  .then('It retries, and its second attempt changes the state.')
  .run(async (_) => {
    let attempts = 0;

    class LoadWithRetry extends LoadText {
      retry = { initialDelay: 10 };

      async reduce() {
        attempts++;
        if (attempts === 1) throw new Error('Failed');
        return (state: State) => new State(this.text, state.cache);
      }
    }

    const store = newStore();
    const status = await store.dispatchAndWait(new LoadWithRetry('A', openGate()));

    expect(status.isCompletedOk).toBe(true);
    expect(attempts).toBe(2);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('ignoreOld can be combined with some features.')
  .given('An action with ignoreOld, and also with {Feature}.')
  .when('The action is dispatched.')
  .then('The action runs and changes the state.')
  .example(val('Feature', 'throttle'))
  .example(val('Feature', 'fresh'))
  .example(val('Feature', 'retry'))
  .example(val('Feature', 'checkInternet'))
  .example(val('Feature', 'debounce'))
  .example(val('Feature', 'poll'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature');
    const values: Record<string, any> = {
      throttle: 1000,
      fresh: 1000,
      retry: { on: true },
      checkInternet: { dialog: false },
      debounce: 10,
      poll: Poll.once,
    };

    class LoadTextWith extends LoadText {
      constructor() {
        super('A', openGate());
        (this as any)[feature] = values[feature];
      }

      get internetOnOffSimulation() { return true; }

      createPollingAction() { return new LoadTextWith(); }
    }

    const store = newStore();
    const status = await store.dispatchAndWait(new LoadTextWith());
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('ignoreOld can not be combined with features that never let actions overlap.')
  .given('An action with ignoreOld, and also with {Feature}.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, that mentions ignoreOld.')
  .example(val('Feature', 'nonReentrant'))
  .example(val('Feature', 'sequential'))
  .example(val('Feature', 'unlimitedRetryCheckInternet'))
  .run(async (ctx) => {
    const feature = ctx.example.val('Feature');

    class LoadTextWith extends LoadText {
      constructor() {
        super('A', new Gate());
        (this as any)[feature] = true;
      }
    }

    const store = newStore();
    expect(() => store.dispatch(new LoadTextWith())).toThrow(StoreException);
    expect(() => store.dispatch(new LoadTextWith())).toThrow(/ignoreOld and/);
    expect(store.state.text).toBe('Initial');
  });

Bdd(feature)
  .scenario('A subclass can turn ignoreOld off, and then use the features it can not be combined with.')
  .given('An action with ignoreOld, and a subclass that turns it off, and uses nonReentrant.')
  .when('The subclass is dispatched.')
  .then('The dispatch does not throw, and the action runs.')
  .run(async (_) => {
    class LoadNonReentrant extends LoadText {
      ignoreOld = false;
      nonReentrant = true;
    }

    const store = newStore();
    const status = await store.dispatchAndWait(new LoadNonReentrant('A', openGate()));
    expect(status.isCompletedOk).toBe(true);
    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('ignoreOld can not be used in the optimistic actions.')
  .given('An {Action} with ignoreOld.')
  .when('The action is dispatched.')
  .then('The dispatch throws a StoreException, and the state is not changed.')
  .example(val('Action', 'OptimisticCommand'))
  .example(val('Action', 'OptimisticSync'))
  .example(val('Action', 'OptimisticSyncWithPush'))
  .example(val('Action', 'ServerPush'))
  .run(async (ctx) => {
    class Save extends OptimisticCommand<State, string> {
      ignoreOld = true;

      optimisticValue() { return 'A'; }

      getValueFromState(state: State) { return state.text; }

      applyValueToState(_state: State, value: string) { return new State(value); }

      async sendCommandToServer() {}
    }

    class Toggle extends OptimisticSync<State, string> {
      ignoreOld = true;

      valueToApply() { return 'A'; }

      applyOptimisticValueToState(_state: State, value: string) { return new State(value); }

      getValueFromState(state: State) { return state.text; }

      async sendValueToServer() { return null; }
    }

    class TogglePush extends OptimisticSyncWithPush<State, string> {
      ignoreOld = true;

      valueToApply() { return 'A'; }

      applyOptimisticValueToState(_state: State, value: string) { return new State(value); }

      getValueFromState(state: State) { return state.text; }

      getServerRevisionFromState() { return -1; }

      async sendValueToServer() {
        this.informServerRevision(1);
        return null;
      }
    }

    class Push extends ServerPush<State> {
      ignoreOld = true;

      associatedAction() { return TogglePush; }

      pushMetadata(): PushMetadata { return { serverRevision: 1, localRevision: 1, deviceId: 1 }; }

      applyServerPushToState(_state: State) { return new State('A'); }

      getServerRevisionFromState() { return -1; }
    }

    const actions: Record<string, () => KissAction<State>> = {
      OptimisticCommand: () => new Save(),
      OptimisticSync: () => new Toggle(),
      OptimisticSyncWithPush: () => new TogglePush(),
      ServerPush: () => new Push(),
    };

    const store = newStore();
    expect(() => store.dispatch(actions[ctx.example.val('Action')]())).toThrow(StoreException);
    expect(() => store.dispatch(actions[ctx.example.val('Action')]())).toThrow(/ignoreOld/);
    expect(store.state.text).toBe('Initial');
  });

// ---------------------------------------------------------------------------------------------
// Clearing, memory and toString.

Bdd(feature)
  .scenario('After clearing the internal action props, newer actions do not make older ones old.')
  .given('An action with ignoreOld, dispatched with "A", which is still running.')
  .when('The store clears the internal action props.')
  .and('The action is dispatched with "B", and then with "C".')
  .then('"C" makes "B" old, but not "A".')
  .and('The state has "A" at the end, since "A" finished last, and was not old.')
  .run(async (_) => {
    const store = newStore();
    const gateA = new Gate(), gateB = new Gate();

    const actionA = new LoadText('A', gateA);
    const promiseA = store.dispatchAndWait(actionA);
    store.clearInternalActionProps();

    const actionB = new LoadText('B', gateB);
    const promiseB = store.dispatchAndWait(actionB);
    expect(actionA.isAborted).toBe(false);

    await store.dispatchAndWait(new LoadText('C', openGate()));
    expect(actionB.isAborted).toBe(true);
    expect(actionB.abortSignal.aborted).toBe(true);
    expect(actionA.isAborted).toBe(false);
    expect(actionA.abortSignal.aborted).toBe(false);
    expect(store.state.text).toBe('C');

    gateB.open();
    await promiseB;
    gateA.open();
    await promiseA;

    expect(store.state.text).toBe('A');
  });

Bdd(feature)
  .scenario('The ignoreOld property is not shown in the description of the action.')
  .given('An action with ignoreOld, and a field.')
  .when('The action is printed with toString.')
  .then('It shows the field, but not ignoreOld.')
  .run(async (_) => {
    class SetText extends KissAction<State> {
      ignoreOld = true;

      constructor(readonly text: string) { super(); }

      reduce() { return new State(this.text); }
    }

    expect(new SetText('A').toString()).toBe('SetText(text:A)');
  });
