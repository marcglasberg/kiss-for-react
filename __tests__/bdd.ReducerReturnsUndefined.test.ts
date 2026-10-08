import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Reducer returns undefined');

class State {
  constructor(readonly count: number) {
  }
}

// The `any` casts simulate JavaScript users, or reducers typed as `any`.
// The TypeScript types don't allow returning `undefined`.

class SyncReturnsUndefined extends KissAction<State> {
  reduce(): any {
    return undefined;
  }
}

class AsyncReturnsUndefined extends KissAction<State> {
  async reduce(): Promise<any> {
    return undefined;
  }
}

class AsyncFunctionReturnsUndefined extends KissAction<State> {
  async reduce(): Promise<any> {
    return (_: State) => undefined;
  }
}

class AsyncBeforeSyncReduceReturnsUndefined extends KissAction<State> {
  async before() {
  }

  reduce(): any {
    return undefined;
  }
}

Bdd(feature)
  .scenario('A SYNC reducer that returns undefined does not change the state.')
  .given('A SYNC action whose reducer returns undefined.')
  .when('The action is dispatched with dispatch, dispatchSync, or dispatchAndWait.')
  .then('The state is not changed.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1), logger: null});
    const initial = store.state;

    store.dispatch(new SyncReturnsUndefined());
    expect(store.state).toBe(initial);

    store.dispatchSync(new SyncReturnsUndefined());
    expect(store.state).toBe(initial);

    await store.dispatchAndWait(new SyncReturnsUndefined());
    expect(store.state).toBe(initial);
  });

Bdd(feature)
  .scenario('An ASYNC reducer that resolves to undefined does not change the state.')
  .given('An ASYNC action whose reducer resolves to undefined, or to a function that returns undefined.')
  .when('The action is dispatched.')
  .then('The state is not changed.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1), logger: null});
    const initial = store.state;

    await store.dispatchAndWait(new AsyncReturnsUndefined());
    expect(store.state).toBe(initial);

    await store.dispatchAndWait(new AsyncFunctionReturnsUndefined());
    expect(store.state).toBe(initial);
  });

Bdd(feature)
  .scenario('A SYNC reducer that returns undefined after an ASYNC "before" does not change the state.')
  .given('An action with an ASYNC "before" method, whose SYNC reducer returns undefined.')
  .when('The action is dispatched.')
  .then('The state is not changed.')
  .run(async (_) => {
    const store = new Store<State>({initialState: new State(1), logger: null});
    const initial = store.state;

    await store.dispatchAndWait(new AsyncBeforeSyncReduceReturnsUndefined());
    expect(store.state).toBe(initial);
  });

Bdd(feature)
  .scenario('The reducer type allows returning null, but not undefined.')
  .given('Actions whose reducers return null, or undefined.')
  .when('The code is type-checked.')
  .then('Returning null compiles.')
  .and('Returning undefined does not compile.')
  .run(async (_) => {
    // Each `@ts-expect-error` fails the compilation if the error does NOT happen.
    class SyncNull extends KissAction<State> {
      reduce() { return null; }
    }

    class AsyncNull extends KissAction<State> {
      async reduce() { return null; }
    }

    class AsyncFunctionNull extends KissAction<State> {
      async reduce() { return (_: State) => null; }
    }

    class SyncUndefined extends KissAction<State> {
      // @ts-expect-error Returning undefined is not allowed.
      reduce() { return undefined; }
    }

    class SyncVoid extends KissAction<State> {
      // @ts-expect-error Forgetting to return is not allowed.
      reduce(): void { }
    }

    class AsyncUndefined extends KissAction<State> {
      // @ts-expect-error Resolving to undefined is not allowed.
      async reduce() { return undefined; }
    }

    class AsyncFunctionUndefined extends KissAction<State> {
      // @ts-expect-error A function returning undefined is not allowed.
      async reduce() { return (_: State) => undefined; }
    }

    const store = new Store<State>({initialState: new State(1), logger: null});
    const initial = store.state;
    for (const action of [new SyncNull(), new AsyncNull(), new AsyncFunctionNull(),
      new SyncUndefined(), new SyncVoid(), new AsyncUndefined(), new AsyncFunctionUndefined()] as KissAction<State>[]) {
      await store.dispatchAndWait(action);
      expect(store.state).toBe(initial);
    }
  });
