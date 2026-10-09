/* eslint-disable kiss-for-react/testing-feature-in-production */
/* eslint-disable kiss-for-react/action-status-details-in-production */
/* eslint-disable kiss-for-react/debug-observer-in-release */

// Demonstrates the rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react) about debugging
// and testing features used in production code. Each warning is marked with a comment right above
// the line it underlines: the rule name, then what the problem is (in parentheses, when needed),
// then its quick fixes, if any. Each variant of a rule is shown separately.
//
// None of these rules are reported in tests. See `user.test.ts`, where the same code is OK.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.

import {
  createStore,
  KissAction,
  Persistor,
  PersistorPrinterDecorator,
  Store,
  useStore,
} from 'kiss-for-react';
import { Action, Increment, LoadUser, SaveUser, State, store } from './state';

declare const persistor: Persistor<State>;
declare const isDev: boolean;
declare function track(name: string): void;

// =================================================================================================
// testing-feature-in-production
// =================================================================================================

async function testingFeaturesDemo() {
  // kiss-for-react/testing-feature-in-production
  // (`mocks` replaces the actions you dispatch with other actions, or ignores them)
  store.mocks.add(LoadUser, () => null);

  // kiss-for-react/testing-feature-in-production
  // (`record` records every state change of every action)
  store.record.start();

  // kiss-for-react/testing-feature-in-production
  // (A wait method meant for tests. Waiting for actions that other code dispatches can easily
  // deadlock)
  await store.waitActionType(LoadUser);

  // kiss-for-react/testing-feature-in-production
  // (The same for `waitAllActionTypes`)
  await store.waitAllActionTypes([LoadUser, SaveUser]);

  // kiss-for-react/testing-feature-in-production
  // (The same for `waitAnyActionTypeFinishes`)
  await store.waitAnyActionTypeFinishes([LoadUser]);

  // kiss-for-react/testing-feature-in-production
  // (The same for `waitActionCondition`)
  await store.waitActionCondition((actions) => actions.size === 0);

  // kiss-for-react/testing-feature-in-production
  // (`waitAllActions` with no actions waits until no actions are running)
  await store.waitAllActions([]);

  // kiss-for-react/testing-feature-in-production
  // (The same with `null`)
  await store.waitAllActions(null);

  const action = new LoadUser();
  store.dispatch(action);
  await store.waitAllActions([action]); // OK: waits only for the actions you dispatched.
  await store.dispatchAndWait(new SaveUser()); // OK
}

class WaitsForOtherActions extends Action {
  async reduce() {
    // kiss-for-react/testing-feature-in-production
    // (In an action)
    await this.waitActionType(LoadUser);
    return null;
  }
}

function WaitsInComponent() {
  const store = useStore();
  const onSave = async () => {
    // kiss-for-react/testing-feature-in-production
    // (With the store returned by `useStore`)
    await store.waitAllActionTypes([LoadUser]);
  };
  return { onSave };
}

// =================================================================================================
// action-status-details-in-production
// =================================================================================================

async function actionStatusDemo(action: KissAction<State>) {
  const status = await store.dispatchAndWait(new LoadUser());

  // kiss-for-react/action-status-details-in-production
  // (Meant for tests and debugging. In the app, use `isCompleted`, `isCompletedOk` or
  // `isCompletedFailed`)
  if (status.hasFinishedMethodReduce) console.log('Reduced.');

  // kiss-for-react/action-status-details-in-production
  // (The same for `hasFinishedMethodBefore`, of an action's status)
  if (action.status.hasFinishedMethodBefore) console.log('Started.');

  // kiss-for-react/action-status-details-in-production
  // (`hasFinishedMethodAfter` has the same value as `isCompleted`)
  // Fix (automatic): Will replace `hasFinishedMethodAfter` with `isCompleted`.
  if (status.hasFinishedMethodAfter) console.log('Finished.');

  // kiss-for-react/action-status-details-in-production
  // (Destructuring the details)
  const { hasFinishedMethodReduce, isCompletedOk } = action.status;

  if (status.isCompletedOk) console.log('OK.'); // OK
  if (status.isCompletedFailed) console.log('Failed.'); // OK
  if (action.status.isCompleted) console.log('Finished.'); // OK
  return { hasFinishedMethodReduce, isCompletedOk };
}

// =================================================================================================
// debug-observer-in-release
// =================================================================================================

function debugToolsDemo() {
  createStore<State>({
    initialState: State.initialState,
    // kiss-for-react/debug-observer-in-release
    // (`PersistorPrinterDecorator` prints all persistence calls. Use it only in development)
    // Fix (suggestion): Will replace it with the persistor it decorates: `persistor`.
    persistor: new PersistorPrinterDecorator(persistor),
  });

  // kiss-for-react/debug-observer-in-release
  // (Also when it's not created in the store options)
  // Fix (suggestion): Will replace it with the persistor it decorates: `persistor`.
  const debugPersistor = new PersistorPrinterDecorator<State>(persistor);
  new Store<State>({ initialState: State.initialState, persistor: debugPersistor });

  createStore<State>({
    initialState: State.initialState,
    // kiss-for-react/debug-observer-in-release
    // (An `actionObserver` that only prints to the console)
    // Fix (suggestion): Will remove the `actionObserver`.
    actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini),
  });

  createStore<State>({
    initialState: State.initialState,
    // kiss-for-react/debug-observer-in-release
    // (A `stateObserver` that only prints to the console, declared as a function below)
    // Fix (suggestion): Will remove the `stateObserver`.
    stateObserver,
  });
}

function stateObserver(action: KissAction<State>, prevState: State, newState: State) {
  console.info('Action:', action);
  console.debug('State:', prevState, newState);
}

function debugToolsOkDemo() {
  createStore<State>({
    initialState: State.initialState,
    persistor: isDev ? new PersistorPrinterDecorator(persistor) : persistor, // OK: only in dev.
    actionObserver: isDev ? (action) => console.log(action) : undefined, // OK: only in dev.
    stateObserver: (isDev && stateObserver) || undefined, // OK: only in dev.
  });

  // OK: an observer that does more than print.
  createStore<State>({
    initialState: State.initialState,
    actionObserver: (action, dispatchCount, ini) => {
      console.log(action);
      if (ini) track(action.constructor.name);
    },
  });

  // OK: inside an `if`.
  if (isDev) {
    createStore<State>({
      initialState: State.initialState,
      persistor: new PersistorPrinterDecorator(persistor),
      actionObserver: (action) => console.log(action),
    });
  }

  store.dispatch(new Increment());
}
