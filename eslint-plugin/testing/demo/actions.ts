/* eslint-disable kiss-for-react/async-after */
/* eslint-disable kiss-for-react/after-throws */
/* eslint-disable kiss-for-react/missing-super-in-override */
/* eslint-disable kiss-for-react/retry-requires-async-reduce */
/* eslint-disable kiss-for-react/retry-without-non-reentrant */
/* eslint-disable kiss-for-react/async-feature-in-sync-action */
/* eslint-disable kiss-for-react/extend-base-action */
/* eslint-disable kiss-for-react/avoid-abort-dispatch */
/* eslint-disable kiss-for-react/avoid-wrap-reduce */
/* eslint-disable kiss-for-react/missing-key-params */

// Demonstrates the action methods and features rules of the Kiss ESLint plugin
// (eslint-plugin-kiss-for-react). Each warning is marked with a comment right above the line it
// underlines: the rule name, then what the problem is (in parentheses, when needed), then its
// quick fixes, if any. Each variant of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule, delete its line.
// This file is not meant to run. See README.md in this directory.
//
// The last 3 rules (`avoid-abort-dispatch`, `avoid-wrap-reduce` and `missing-key-params`) are
// opt-in: they're not in `kiss.configs.recommended`, but the demo config turns them on.

import { KissAction, OptimisticCommand, ReduxReducer } from 'kiss-for-react';
import { Action, fetchName, saveName, State } from './state';

// ---------------------------------------------------------------------------------------------
// async-after

class AfterWithAwait extends Action {
  reduce() {
    return null;
  }

  // kiss-for-react/async-after
  // (Kiss doesn't wait for it: the code after the `await` runs after the action finished)
  async after() {
    await saveName(this.state.name);
  }
}

class AfterAsyncWithoutAwait extends Action {
  reduce() {
    return null;
  }

  // kiss-for-react/async-after
  // (The same, without an `await`)
  // Fix (suggestion): Will remove `async`.
  async after() {
    console.log('Done');
  }
}

class AfterReturnsPromiseType extends Action {
  reduce() {
    return null;
  }

  // kiss-for-react/async-after
  // (The declared return type is a `Promise`)
  after(): Promise<void> {
    return saveName(this.state.name);
  }
}

class AfterReturnsPromise extends Action {
  reduce() {
    return null;
  }

  // kiss-for-react/async-after
  // (It returns a promise, without declaring it)
  after() {
    return saveName(this.state.name);
  }
}

class AfterOk extends Action {
  reduce() {
    return null;
  }

  after() { // OK: sync.
    console.log('Done');
  }
}

// ---------------------------------------------------------------------------------------------
// after-throws

class AfterThrows extends Action {
  reduce() {
    return null;
  }

  after() {
    if (this.state.name === '') {
      // kiss-for-react/after-throws
      // (Kiss ignores errors thrown by `after`, and only logs them)
      throw new Error('No name');
    }
  }
}

class AfterThrowsInTryFinally extends Action {
  reduce() {
    return null;
  }

  after() {
    try {
      // kiss-for-react/after-throws
      // (A `try` with only a `finally` doesn't catch it)
      if (this.state.name === '') throw new Error('No name');
    } finally {
      console.log('Done');
    }
  }
}

class AfterThrowsInCatch extends Action {
  reduce() {
    return null;
  }

  after() {
    try {
      if (this.state.name === '') throw new Error('No name'); // OK: caught below.
    } catch (error) {
      // kiss-for-react/after-throws
      // (A `throw` inside a `catch`)
      throw new Error('Cleanup failed', { cause: error });
    }
  }
}

class AfterThrowsOk extends Action {
  reduce() {
    return null;
  }

  after() {
    try {
      if (this.state.name === '') throw new Error('No name'); // OK: caught below.
    } catch (error) {
      console.log(error);
    }
    setTimeout(() => {
      throw new Error('Later'); // OK: inside a callback, which may run somewhere else.
    });
  }
}

// ---------------------------------------------------------------------------------------------
// missing-super-in-override

class BeforeWithoutSuper extends Action {
  checkInternet = { dialog: true };

  // kiss-for-react/missing-super-in-override
  // (The default `before` checks the internet. Without `super.before()`, nothing checks it)
  // Fix (suggestion): Will add `await super.before();` as the first statement.
  async before() {
    await saveName('');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class SyncBeforeWithoutSuper extends Action {
  checkInternet = { dialog: false };

  // kiss-for-react/missing-super-in-override
  // (A sync `before`)
  // Fix (suggestion): Will add `await super.before();` as the first statement, and make `before`
  // async.
  before() {
    console.log('Before');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class BeforeWithoutSuperTyped extends Action {
  checkInternet = { dialog: true };

  // kiss-for-react/missing-super-in-override
  // (No suggestion, since the declared return type `void` is not a `Promise`)
  before(): void {
    console.log('Before');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

/** A base action that sets `checkInternet`. */
abstract class OnlineAction extends Action {
  checkInternet = { dialog: true };
}

class BeforeWithoutSuperInherited extends OnlineAction {
  // kiss-for-react/missing-super-in-override
  // (`checkInternet` is inherited from `OnlineAction`)
  // Fix (suggestion): Will add `await super.before();` as the first statement.
  async before() {
    await saveName('');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

/** A base action whose `before` doesn't call `super.before()`. */
abstract class PreparingAction extends Action {
  async before() {
    await saveName('');
  }
}

class InheritsBeforeWithoutSuper extends PreparingAction {
  // kiss-for-react/missing-super-in-override
  // (The `before` of `PreparingAction` doesn't call `super.before()`)
  checkInternet = { dialog: true };

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class OptimisticWithReduce extends OptimisticCommand<State, string> {
  optimisticValue() {
    return 'Mary';
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(state: State, value: string) {
    return state.copy({ name: value });
  }

  async sendCommandToServer(value: string) {
    await saveName(value);
  }

  // kiss-for-react/missing-super-in-override
  // (The `reduce` of `OptimisticCommand` does the optimistic update. This turns it off)
  async reduce() {
    await saveName(this.state.name);
    return null;
  }
}

class BeforeWithSuperOk extends Action {
  checkInternet = { dialog: true };

  async before() { // OK: calls `super.before()`.
    await super.before();
    await saveName('');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class BeforeReadsCheckInternetOk extends Action {
  checkInternet = { dialog: true };

  async before() { // OK: it reads `this.checkInternet`, so it probably checks the internet itself.
    if (this.checkInternet.dialog) await saveName('');
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

// ---------------------------------------------------------------------------------------------
// retry-requires-async-reduce

class RetryWithSyncReduce extends Action {
  // kiss-for-react/retry-requires-async-reduce
  // (Retry only works with an async `reduce`. Dispatching this action fails)
  // Fix (suggestion): Will remove `retry`.
  // Fix (suggestion): Will make `reduce` async, and return
  // `() => this.state.copy({ counter: 0 })`.
  retry = { on: true };

  reduce() {
    return this.state.copy({ counter: 0 });
  }
}

class RetryOptionsWithSyncReduce extends Action {
  // kiss-for-react/retry-requires-async-reduce
  // (Any options turn retry on. Only one suggestion, since `reduce` has a declared return type)
  // Fix (suggestion): Will remove `retry`.
  retry = { maxRetries: 5 };

  reduce(): State | null {
    return this.state.copy({ counter: 0 });
  }
}

class RetryOffOk extends Action {
  retry = { on: false }; // OK: retry is off.

  reduce() {
    return this.state.copy({ counter: 0 });
  }
}

// ---------------------------------------------------------------------------------------------
// retry-without-non-reentrant

class RetryWithoutNonReentrant extends Action {
  // kiss-for-react/retry-without-non-reentrant
  // (A new dispatch may run while the previous one is still retrying)
  // Fix (suggestion): Will add `nonReentrant = true;`.
  retry = { on: true };

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class RetryWithNonReentrantOk extends Action {
  retry = { on: true }; // OK: non-reentrant.
  nonReentrant = true;

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class RetryReentrantOnPurposeOk extends Action {
  retry = { on: true }; // OK: `nonReentrant = false` is a deliberate choice.
  nonReentrant = false;

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class RetryWithAbortDispatchOk extends Action {
  retry = { on: true }; // OK: `abortDispatch` decides when the action runs.

  // kiss-for-react/avoid-abort-dispatch
  // (The opt-in rule below)
  abortDispatch() {
    return this.state.name === '';
  }

  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

class RetryInOptimisticCommandOk extends OptimisticCommand<State, string> {
  retry = { on: true }; // OK: an `OptimisticCommand` is always non-reentrant.

  optimisticValue() {
    return 'Mary';
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(state: State, value: string) {
    return state.copy({ name: value });
  }

  async sendCommandToServer(value: string) {
    await saveName(value);
  }
}

// ---------------------------------------------------------------------------------------------
// async-feature-in-sync-action

class NonReentrantInSyncAction extends Action {
  // kiss-for-react/async-feature-in-sync-action
  // (A sync action never runs twice at the same time, so `nonReentrant` does nothing)
  // Fix (suggestion): Will remove `nonReentrant`.
  nonReentrant = true;

  reduce() {
    return this.state.copy({ counter: this.state.counter + 1 });
  }
}

class CheckInternetInSyncAction extends Action {
  // kiss-for-react/async-feature-in-sync-action
  // (A sync `reduce` doesn't use the network, and `checkInternet` makes `dispatchSync` throw)
  // Fix (suggestion): Will remove `checkInternet`.
  checkInternet = { dialog: true };
  nonReentrant = true; // OK: `checkInternet` makes the action async.

  reduce() {
    return this.state.copy({ counter: this.state.counter + 1 });
  }
}

class SyncActionWithBeforeOk extends Action {
  nonReentrant = true; // OK: the action overrides `before`, which may make it async.

  async before() {
    await saveName('');
  }

  reduce() {
    return this.state.copy({ counter: this.state.counter + 1 });
  }
}

// ---------------------------------------------------------------------------------------------
// extend-base-action

// kiss-for-react/extend-base-action
// (Extend the base action `Action`, so the action gets what all the actions share)
// Fix (suggestion): Will replace `KissAction<State>` with `Action`.
class ExtendsKissAction extends KissAction<State> {
  reduce() {
    return this.state.copy({ counter: 0 });
  }
}

/** A state without a base action. */
class Settings {
  constructor(readonly darkMode: boolean) {}

  static initialState: Settings = new Settings(false);
}

// kiss-for-react/extend-base-action
// (There's no base action for `Settings`, so it says to create one)
class ExtendsKissActionWithoutBase extends KissAction<Settings> {
  reduce() {
    return new Settings(!this.state.darkMode);
  }
}

abstract class SettingsAction extends KissAction<Settings> {} // OK: abstract (a base action).

class Reset<St> extends KissAction<St> { // OK: a generic state.
  constructor(readonly initial: St) {
    super();
  }

  reduce() {
    return this.initial;
  }
}

// ---------------------------------------------------------------------------------------------
// avoid-abort-dispatch (opt-in)

class OverridesAbortDispatch extends Action {
  // kiss-for-react/avoid-abort-dispatch
  // (A complex power feature. Prefer `nonReentrant`, `retry` or `checkInternet`)
  abortDispatch() {
    return this.state.name === '';
  }

  reduce() {
    return null;
  }
}

class AbortDispatchProperty extends Action {
  // kiss-for-react/avoid-abort-dispatch
  // (A property with a function)
  abortDispatch = () => this.state.name === '';

  reduce() {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// avoid-wrap-reduce (opt-in)

class OverridesWrapReduce extends Action {
  // kiss-for-react/avoid-wrap-reduce
  // (A complex power feature. Prefer `nonReentrant`, `retry` or `checkInternet`)
  wrapReduce(reduce: () => ReduxReducer<State>) {
    return () => {
      console.log('Reducing');
      return reduce();
    };
  }

  reduce() {
    return null;
  }
}

class WrapReduceProperty extends Action {
  // kiss-for-react/avoid-wrap-reduce
  // (A property with a function)
  wrapReduce = (reduce: () => ReduxReducer<State>) => reduce;

  reduce() {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// missing-key-params (opt-in)

// kiss-for-react/missing-key-params
// (All `SaveName` share the non-reentrant key, so `SaveName('A')` blocks `SaveName('B')`)
// Fix (suggestion): Will add `nonReentrantKeyParams() { return this.userId; }`.
class SaveName extends OptimisticCommand<State, string> {
  constructor(readonly userId: string) {
    super();
  }

  optimisticValue() {
    return 'Mary';
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(state: State, value: string) {
    return state.copy({ name: value });
  }

  async sendCommandToServer(value: string) {
    await saveName(value);
  }
}

// kiss-for-react/missing-key-params
// (With several fields, including properties. `retry` is not a field)
// Fix (suggestion): Will add `nonReentrantKeyParams() { return [this.userId, this.name]; }`,
// after the last field. Then remove the fields that shouldn't be part of the key.
class SaveUserName extends OptimisticCommand<State, string> {
  retry = { on: true };

  constructor(readonly userId: string) {
    super();
  }

  name = 'Mary';

  optimisticValue() {
    return this.name;
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(state: State, value: string) {
    return state.copy({ name: value });
  }

  async sendCommandToServer(value: string) {
    await saveName(value);
  }
}

class SaveNameWithKeyOk extends OptimisticCommand<State, string> { // OK: overrides the key.
  constructor(readonly userId: string) {
    super();
  }

  nonReentrantKeyParams() {
    return this.userId;
  }

  optimisticValue() {
    return 'Mary';
  }

  getValueFromState(state: State) {
    return state.name;
  }

  applyValueToState(state: State, value: string) {
    return state.copy({ name: value });
  }

  async sendCommandToServer(value: string) {
    await saveName(value);
  }
}
