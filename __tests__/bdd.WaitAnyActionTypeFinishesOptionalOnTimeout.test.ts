import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { KissAction, Store, TimeoutException, useStore } from '../src';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('waitAnyActionTypeFinishes with an optional onTimeout');

class State {
  constructor(readonly count: number) {
  }
}

class Slow extends KissAction<State> {
  async reduce() {
    await delayMillis(10);
    return (state: State) => new State(state.count + 1);
  }
}

type Options = { timeoutMillis?: number, onTimeout?: () => void };

// Waits with the store, passing options whose `onTimeout` may be undefined.
// This only compiles if the method accepts an optional `onTimeout`.
function waitWithStore(store: Store<State>, { timeoutMillis, onTimeout }: Options) {
  return store.waitAnyActionTypeFinishes([Slow], { timeoutMillis, onTimeout });
}

// The same, from inside an action.
class WaitInsideAction extends KissAction<State> {
  constructor(readonly options: Options) { super(); }

  async reduce() {
    const { timeoutMillis, onTimeout } = this.options;
    WaitInsideAction.result = await this.waitAnyActionTypeFinishes([Slow], { timeoutMillis, onTimeout });
    return null;
  }

  static result: KissAction<State> | null | undefined;
}

// The same, with the object returned by `useStore()` in components.
function waitWithUseStore(store: ReturnType<typeof useStore>, { timeoutMillis, onTimeout }: Options) {
  return store.waitAnyActionTypeFinishes([Slow], { timeoutMillis, onTimeout });
}

// Type checks: they only compile if the return types are right.
async function typeChecks(store: Store<State>, onTimeout?: () => void) {

  // Without `onTimeout`, the wait never resolves with null, so the result is not nullable.
  const a1: KissAction<State> = await store.waitAnyActionTypeFinishes([Slow]);
  const a2: KissAction<State> = await store.waitAnyActionTypeFinishes([Slow], { timeoutMillis: 10 });

  // With an `onTimeout` that may be given, the result may be null.
  // @ts-expect-error: the result may be null.
  const a3: KissAction<State> = await store.waitAnyActionTypeFinishes([Slow], { onTimeout });
  const a4: KissAction<State> | null = await store.waitAnyActionTypeFinishes([Slow], { onTimeout });

  // The same when the options are in a variable, and not written in the call.
  const options: Options = { onTimeout };
  // @ts-expect-error: the result may be null.
  const a5: KissAction<State> = await store.waitAnyActionTypeFinishes([Slow], options);

  return [a1, a2, a3, a4, a5];
}

void typeChecks;

type Waiter = (store: Store<State>, options: Options) => Promise<KissAction<State> | null>;

const waiters: Record<string, Waiter> = {
  'the store': waitWithStore,
  'an action': async (store, options) => {
    WaitInsideAction.result = undefined;
    await store.dispatchAndWait(new WaitInsideAction(options));
    return WaitInsideAction.result!;
  },
  'useStore': (store, options) => waitWithUseStore(store as unknown as ReturnType<typeof useStore>, options),
};

Bdd(feature)
  .scenario('Waiting with an onTimeout that may be undefined, and is given, using <Waiter>.')
  .given('An onTimeout callback, in a variable that could also be undefined.')
  .when('We wait with <Waiter> for an action type that never finishes, passing the variable and a timeout.')
  .then('The onTimeout is called, and the wait resolves with null.')
  .example(val('Waiter', 'the store'))
  .example(val('Waiter', 'an action'))
  .example(val('Waiter', 'useStore'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({ initialState: new State(0), logger: null });
    let timedOut = false;
    const onTimeout: (() => void) | undefined = () => { timedOut = true; };

    // When:
    const result = await waiters[ctx.example.val('Waiter')](store, { timeoutMillis: 10, onTimeout });

    // Then:
    expect(timedOut).toBe(true);
    expect(result).toBeNull();
  });

Bdd(feature)
  .scenario('Waiting with an onTimeout that is undefined, using <Waiter>.')
  .given('An onTimeout variable that is undefined.')
  .when('We wait with <Waiter> for an action type that never finishes, passing the variable and a timeout.')
  .then('The wait fails with a TimeoutException, as if no onTimeout was given.')
  .example(val('Waiter', 'the store'))
  .example(val('Waiter', 'useStore'))
  .run(async (ctx) => {
    // Given:
    const store = new Store<State>({ initialState: new State(0), logger: null });
    const onTimeout: (() => void) | undefined = undefined;

    // When/Then:
    await expect(waiters[ctx.example.val('Waiter')](store, { timeoutMillis: 10, onTimeout }))
      .rejects.toBeInstanceOf(TimeoutException);
  });

Bdd(feature)
  .scenario('Waiting with an onTimeout that may be undefined, when the action finishes in time.')
  .given('An onTimeout callback, in a variable that could also be undefined.')
  .when('We wait for an action type, passing the variable, and an action of that type finishes.')
  .then('The wait resolves with that action, and onTimeout is not called.')
  .run(async (_) => {
    // Given:
    const store = new Store<State>({ initialState: new State(0), logger: null });
    let timedOut = false;
    const onTimeout: (() => void) | undefined = () => { timedOut = true; };

    // When:
    const promise = waitWithStore(store, { timeoutMillis: 1000, onTimeout });
    const action = new Slow();
    store.dispatch(action);

    // Then:
    expect(await promise).toBe(action);
    expect(timedOut).toBe(false);
  });
