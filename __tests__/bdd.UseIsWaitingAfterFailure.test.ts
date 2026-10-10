import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import {
  KissAction,
  Store,
  StoreProvider,
  useExceptionFor,
  useIsFailed,
  useIsWaiting,
  UserException,
} from '../src';

reporter(new FeatureFileReporter());

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const feature = new Feature('useIsWaiting after an action fails');

class State {
  constructor(readonly count: number) {}
}

/** How the action ends: OK, with a `UserException`, or with an error that is not a `UserException`. */
type Outcome = 'ok' | 'user exception' | 'error';

abstract class BaseLoad extends KissAction<State> {}

class Load extends BaseLoad {
  constructor(readonly finish: Promise<void>, readonly outcome: Outcome) {
    super();
  }

  async reduce() {
    await this.finish;
    if (this.outcome === 'user exception') throw new UserException('Failed to load.');
    if (this.outcome === 'error') throw new Error('Failed to load.');
    return (state: State) => new State(state.count + 1);
  }
}

class Other extends KissAction<State> {
  constructor(readonly finish: Promise<void>) {
    super();
  }

  async reduce() {
    await this.finish;
    return (state: State) => new State(state.count + 1);
  }
}

function createStore() {
  return new Store<State>({
    initialState: new State(0),
    logger: () => {},
    // Swallows the errors that are not a `UserException`, so that dispatching an action that
    // fails doesn't throw. A `UserException` is never thrown, and must be kept for `useIsFailed`.
    errorObserver: ({ error }) => (error instanceof UserException) ? error : null,
    showUserException: () => {},
  });
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

/** Records what a hook returns on every render of its component. */
class Recording<T> {
  readonly values: T[] = [];

  get last(): T {
    return this.values[this.values.length - 1];
  }
}

/** Renders the components side by side, under a `StoreProvider`. */
function render(store: Store<State>, ...components: React.FC[]) {
  act(() => {
    TestRenderer.create(
      React.createElement(StoreProvider<State>, {
        store,
        children: components.map((c, i) => React.createElement(c, { key: i })),
      }),
    );
  });
}

/** A component that shows a spinner while an action of the given type is in progress. */
function spinner(type: abstract new (...args: any[]) => KissAction<State>) {
  const waiting = new Recording<boolean>();
  const Spinner: React.FC = () => {
    waiting.values.push(useIsWaiting(type));
    return null;
  };
  return { waiting, Spinner };
}

/** A component that shows an error message if the action of the given type failed. */
function errorMessage(type: new (...args: any[]) => KissAction<State>, hook: 'useIsFailed' | 'useExceptionFor') {
  const failed = new Recording<boolean>();
  const ErrorMessage: React.FC = () => {
    failed.values.push(hook === 'useIsFailed' ? useIsFailed(type) : useExceptionFor(type) !== null);
    return null;
  };
  return { failed, ErrorMessage };
}

/** Dispatches a `Load` that stays in progress until `finish()` is called. */
async function dispatchLoad(store: Store<State>, outcome: Outcome) {
  const d = deferred();
  await act(async () => {
    store.dispatch(new Load(d.promise, outcome));
  });
  return {
    finish: async () => {
      await act(async () => {
        d.resolve();
        await store.waitAllActions([]);
      });
    },
  };
}

Bdd(feature)
  .scenario('The spinner shows while an action runs, and hides when it fails.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('Another component that shows an error message if that action failed.')
  .when('The action is dispatched, and later fails.')
  .then('The spinner shows while the action is in progress.')
  .and('The spinner hides when the action fails, and the error message shows.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(false);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'user exception');
    expect(store.isWaiting(Load)).toBe(true);
    expect(waiting.last).toBe(true);
    expect(failed.last).toBe(false);

    // When / Then: after it fails.
    await load.finish();
    expect(store.isWaiting(Load)).toBe(false);
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(true);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed is dispatched again.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('Another component that uses {Hook} to show an error message if that action failed.')
  .and('The action was dispatched and failed.')
  .when('The action is dispatched again, and this time it succeeds.')
  .then('The spinner shows while the action is in progress, and the error message hides.')
  .and('The spinner hides when the action finishes, and the error message stays hidden.')
  .example(val('Hook', 'useIsFailed'))
  .example(val('Hook', 'useExceptionFor'))
  .run(async (ctx) => {
    const hook = ctx.example.val('Hook') as 'useIsFailed' | 'useExceptionFor';

    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    const { failed, ErrorMessage } = errorMessage(Load, hook);
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(true);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(store.isWaiting(Load)).toBe(true);
    expect(waiting.last).toBe(true);
    expect(failed.last).toBe(false);

    // When / Then: after it finishes.
    await load.finish();
    expect(store.isWaiting(Load)).toBe(false);
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(false);
    expect(store.state.count).toBe(1);

    // The spinner showed during both runs, and hid after each one.
    expect(waiting.values).toEqual([false, true, false, true, false]);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed is dispatched again, and fails again.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('Another component that shows an error message if that action failed.')
  .and('The action was dispatched and failed.')
  .when('The action is dispatched again, and fails again.')
  .then('The spinner shows while the action is in progress, and the error message hides.')
  .and('The spinner hides when the action fails, and the error message shows again.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(failed.last).toBe(true);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'user exception');
    expect(store.isWaiting(Load)).toBe(true);
    expect(waiting.last).toBe(true);
    expect(failed.last).toBe(false);

    // When / Then: after it fails again.
    await load.finish();
    expect(store.isWaiting(Load)).toBe(false);
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(true);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed with an error that is not a UserException is dispatched again.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('Another component that shows an error message if that action failed.')
  .and('The action was dispatched and failed with an error that is not a UserException.')
  .when('The action is dispatched again.')
  .then('The spinner shows while the action is in progress.')
  .and('The spinner hides when the action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'error')).finish();
    // Only a UserException counts as "failed".
    expect(failed.last).toBe(false);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(store.isWaiting(Load)).toBe(true);
    expect(waiting.last).toBe(true);

    // When / Then: after it finishes.
    await load.finish();
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(false);
  });

Bdd(feature)
  .scenario('A spinner for a base class shows when a subclass action that failed is dispatched again.')
  .given('A component that shows a spinner while an action of a base class is in progress.')
  .and('Another component that shows an error message if a subclass action failed.')
  .and('The subclass action was dispatched and failed.')
  .when('The subclass action is dispatched again.')
  .then('The spinner shows while the subclass action is in progress.')
  .and('The spinner hides when the subclass action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(BaseLoad);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(failed.last).toBe(true);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(store.isWaiting(BaseLoad)).toBe(true);
    expect(waiting.last).toBe(true);
    expect(failed.last).toBe(false);

    // When / Then: after it finishes.
    await load.finish();
    expect(waiting.last).toBe(false);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed is dispatched again, if nothing shows the error.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('No component shows if that action failed.')
  .and('The action was dispatched and failed.')
  .when('The action is dispatched again.')
  .then('The spinner shows while the action is in progress.')
  .and('The spinner hides when the action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    render(store, Spinner);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(waiting.last).toBe(false);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(waiting.last).toBe(true);

    // When / Then: after it finishes.
    await load.finish();
    expect(waiting.values).toEqual([false, true, false, true, false]);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed is dispatched again, if the same component shows the error.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('The same component also shows an error message if that action failed.')
  .and('The action was dispatched and failed.')
  .when('The action is dispatched again.')
  .then('The spinner shows while the action is in progress, and the error message hides.')
  .and('The spinner hides when the action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const waiting = new Recording<boolean>();
    const failed = new Recording<boolean>();
    const SpinnerAndErrorMessage: React.FC = () => {
      waiting.values.push(useIsWaiting(Load));
      failed.values.push(useIsFailed(Load));
      return null;
    };
    render(store, SpinnerAndErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(true);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(waiting.last).toBe(true);
    expect(failed.last).toBe(false);

    // When / Then: after it finishes.
    await load.finish();
    expect(waiting.last).toBe(false);
    expect(failed.last).toBe(false);
  });

Bdd(feature)
  .scenario('The spinner shows when an action that failed is dispatched again, after its error was cleared.')
  .given('A component that shows a spinner while an action is in progress.')
  .and('Another component that shows an error message if that action failed.')
  .and('The action was dispatched and failed.')
  .and('The error was cleared with clearExceptionFor.')
  .when('The action is dispatched again.')
  .then('The spinner shows while the action is in progress.')
  .and('The spinner hides when the action finishes.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Load);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    act(() => store.clearExceptionFor(Load));
    expect(failed.last).toBe(false);

    // When / Then: while in progress.
    const load = await dispatchLoad(store, 'ok');
    expect(waiting.last).toBe(true);

    // When / Then: after it finishes.
    await load.finish();
    expect(waiting.last).toBe(false);
  });

Bdd(feature)
  .scenario('The spinner for one action is not affected when a different action that failed is dispatched again.')
  .given('A component that shows a spinner while action A is in progress.')
  .and('Another component that shows an error message if action B failed.')
  .and('Action B was dispatched and failed.')
  .when('Action B is dispatched again.')
  .then('The spinner for action A stays hidden.')
  .run(async (_) => {
    // Given
    const store = createStore();
    const { waiting, Spinner } = spinner(Other);
    const { failed, ErrorMessage } = errorMessage(Load, 'useIsFailed');
    render(store, Spinner, ErrorMessage);
    await (await dispatchLoad(store, 'user exception')).finish();
    expect(failed.last).toBe(true);

    // When
    const load = await dispatchLoad(store, 'ok');
    expect(failed.last).toBe(false);

    // Then
    expect(store.isWaiting(Other)).toBe(false);
    expect(waiting.values.every((w) => w === false)).toBe(true);
    await load.finish();
    expect(waiting.values.every((w) => w === false)).toBe(true);
  });
