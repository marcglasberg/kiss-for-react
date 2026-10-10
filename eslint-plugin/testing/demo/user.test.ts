/* eslint-disable kiss-for-react/expect-without-waiting */

// Demonstrates the rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react) that are only
// reported in tests. Each warning is marked with a comment right above the line it underlines:
// the rule name, then what the problem is (in parentheses, when needed), then its quick fixes, if
// any. Each variant of a rule is shown separately.
//
// The plugin treats this file as a test, because its name ends with `.test.ts` (the same for
// `.spec.ts`, and for files in a `__tests__` directory). Some rules are only reported in tests,
// like `expect-without-waiting`. Others are NOT reported in tests, like
// `testing-feature-in-production`, so the test-only Kiss features at the end of this file are OK.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.

import { createStore } from 'kiss-for-react';
import { Action, Increment, LoadUser, SaveUser, State } from './state';

/** A base action that sets `checkInternet`, so the default `before` of its subclasses is async. */
abstract class OnlineAction extends Action {
  checkInternet = { dialog: false };
}

class ClearName extends OnlineAction {
  reduce() {
    return this.state.copy({ name: '' });
  }
}

/** Retries forever. */
class LoadUserForever extends Action {
  retry = { maxRetries: -1 };
  nonReentrant = true;

  async reduce() {
    await new Promise((resolve) => setTimeout(resolve, 10));
    return (state: State) => state.copy({ name: 'Mary' });
  }
}

// =================================================================================================
// expect-without-waiting
// =================================================================================================

test('Loads the user (the test function is not async)', () => {
  const store = createStore<State>({ initialState: State.initialState });

  // kiss-for-react/expect-without-waiting
  // (`LoadUser` is async, so the `expect` below checks the state before the action finishes)
  // Fix (automatic): Will replace it with `await store.dispatchAndWait(new LoadUser())`, and
  // make the test function `async`.
  store.dispatch(new LoadUser());
  expect(store.state.name).toBe('Mary');
});

test('Loads the user (the test function is async)', async () => {
  const store = createStore<State>({ initialState: State.initialState });

  // kiss-for-react/expect-without-waiting
  // (In an async test function)
  // Fix (automatic): Will replace it with `await store.dispatchAndWait(new LoadUser())`.
  store.dispatch(new LoadUser());
  expect(store.state.name).toBe('Mary');
});

test('Clears the name', async () => {
  const store = createStore<State>({ initialState: State.initialState });

  // kiss-for-react/expect-without-waiting
  // (`ClearName` is async too, since it sets `checkInternet`, inherited from `OnlineAction`)
  // Fix (automatic): Will replace it with `await store.dispatchAndWait(new ClearName())`.
  store.dispatch(new ClearName());
  expect(store.state.name).toBe('');
});

function checkUserIsLoaded(): void {
  const store = createStore<State>({ initialState: State.initialState });

  // kiss-for-react/expect-without-waiting
  // (No quick fix, since this helper function can't be made `async`: it returns `void`)
  store.dispatch(new SaveUser());
  expect(store.state.name).toBe('');
}

test('Waiting, or a sync action, is OK', async () => {
  const store = createStore<State>({ initialState: State.initialState });

  await store.dispatchAndWait(new LoadUser()); // OK: waits for the action.
  expect(store.state.name).toBe('Mary');

  store.dispatch(new Increment()); // OK: a sync action finishes during its dispatch.
  expect(store.state.counter).toBe(1);

  store.dispatch(new SaveUser()); // OK: waits before the `expect`.
  await store.waitAllActions([]);
  expect(store.state.name).toBe('Mary');

  // OK: checks the state while the action runs, on purpose, since later it waits and checks
  // the state again.
  store.dispatch(new LoadUser());
  expect(store.state.name).toBe('Mary');
  await store.waitCondition((state) => state.name === 'Mary', { timeoutMillis: 1000 });
  expect(store.state.name).toBe('Mary');

  checkUserIsLoaded();
});

// =================================================================================================
// Rules NOT reported in tests
// =================================================================================================

test('The test-only features of Kiss are OK in tests', async () => {
  const store = createStore<State>({
    initialState: State.initialState,
    actionObserver: (action) => console.log(action), // OK: debug-observer-in-release.
  });

  store.mocks.add(SaveUser, () => null); // OK: testing-feature-in-production.
  store.record.start(); // OK: testing-feature-in-production.
  store.forceInternetOnOffSimulation = () => true; // OK: testing-feature-in-production.
  store.dispatch(new LoadUser());
  await store.waitActionType(LoadUser); // OK: testing-feature-in-production.
  expect(store.record.result()).toHaveLength(2);

  const status = await store.dispatchAndWait(new LoadUser());
  expect(status.hasFinishedMethodReduce).toBe(true); // OK: action-status-details-in-production.

  expect(store.isWaiting(Increment)).toBe(false); // OK: wait-fail-never-matches.

  // OK: wait-condition-without-timeout.
  await store.waitCondition((state) => state.name === 'Mary', { timeoutMillis: 0 });

  await store.dispatchAndWait(new LoadUserForever()); // OK: dispatch-and-wait-unlimited-retries.
});
