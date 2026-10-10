import { expect, jest } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import {
  KissAction,
  OptimisticCommand,
  OptimisticSync,
  OptimisticSyncWithPush,
  Poll,
  PushMetadata,
  ServerPush,
  Store,
  StoreException,
} from '../../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: incompatible-action-features');

const rule = 'incompatible-action-features';

const prelude = `import { KissAction, OptimisticCommand, OptimisticSync, OptimisticSyncWithPush, Poll, PushMetadata, ServerPush } from 'kiss-for-react';

class State {
  constructor(readonly text: string) {}
}

declare function loadText(): Promise<string>;
declare function saveText(text: string): Promise<void>;
`;

const commandMethods = `
  optimisticValue() { return 'new'; }
  getValueFromState(state: State) { return state.text; }
  applyValueToState(state: State, text: string) { return new State(text); }
  async sendCommandToServer(text: string) { await saveText(text); }`;

const syncMethods = `
  valueToApply() { return 'new'; }
  applyOptimisticValueToState(state: State, text: string) { return new State(text); }
  getValueFromState(state: State) { return state.text; }
  async sendValueToServer(text: string) { await saveText(text); }`;

const syncWithPushMethods = `
  valueToApply() { return 'new'; }
  applyOptimisticValueToState(state: State, text: string) { return new State(text); }
  getValueFromState(state: State) { return state.text; }
  getServerRevisionFromState(state: State, key: any) { return -1; }
  async sendValueToServer(text: string, localRevision: number, deviceId: number) {
    await saveText(text);
    this.informServerRevision(Date.now());
  }`;

const serverPushMethods = `
  constructor(readonly text: string, readonly metadata: PushMetadata) { super(); }
  associatedAction() { return SaveTextWithPush; }
  pushMetadata() { return this.metadata; }
  applyServerPushToState(state: State, key: any, serverRevision: number) { return new State(this.text); }
  getServerRevisionFromState(state: State, key: any) { return -1; }`;

/** The `OptimisticSyncWithPush` associated with the `ServerPush` actions of the tests. */
const syncWithPushAction = `
class SaveTextWithPush extends OptimisticSyncWithPush<State, string> {${syncWithPushMethods}
}
`;

/** How each feature is turned on, in the code. */
const DECLARATIONS: Record<string, string> = {
  nonReentrant: 'nonReentrant = true;',
  retry: 'retry = { on: true };',
  checkInternet: 'checkInternet = { dialog: false };',
  debounce: 'debounce = 300;',
  throttle: 'throttle = 1000;',
  fresh: 'fresh = 1000;',
  sequential: 'sequential = true;',
  poll: 'poll = Poll.once;',
  unlimitedRetryCheckInternet: 'unlimitedRetryCheckInternet = true;',
};

const FEATURES = Object.keys(DECLARATIONS);

/** The pairs of features the store doesn't allow in the same action. */
const INCOMPATIBLE_PAIRS = [
  ['debounce', 'retry'],
  ['throttle', 'nonReentrant'],
  ['fresh', 'nonReentrant'],
  ['fresh', 'throttle'],
  ['sequential', 'debounce'],
  ['poll', 'retry'],
  ['poll', 'debounce'],
  ['unlimitedRetryCheckInternet', 'retry'],
  ['unlimitedRetryCheckInternet', 'checkInternet'],
  ['unlimitedRetryCheckInternet', 'nonReentrant'],
  ['unlimitedRetryCheckInternet', 'debounce'],
  ['unlimitedRetryCheckInternet', 'throttle'],
  ['unlimitedRetryCheckInternet', 'fresh'],
  ['unlimitedRetryCheckInternet', 'sequential'],
  ['unlimitedRetryCheckInternet', 'poll'],
];

/** The features an `OptimisticCommand` can't use. */
const INCOMPATIBLE_WITH_COMMAND = ['nonReentrant', 'debounce', 'throttle', 'fresh', 'poll', 'unlimitedRetryCheckInternet'];

/** The features an `OptimisticSync` can't use: all but `checkInternet`. */
const INCOMPATIBLE_WITH_SYNC = ['nonReentrant', 'retry', 'debounce', 'throttle', 'fresh', 'sequential', 'poll', 'unlimitedRetryCheckInternet'];

/** The features a `ServerPush` can't use: all of them. */
const INCOMPATIBLE_WITH_SERVER_PUSH = ['nonReentrant', 'retry', 'checkInternet', 'debounce', 'throttle', 'fresh', 'sequential', 'poll', 'unlimitedRetryCheckInternet'];

/** An action with both features, the first one declared first. */
function actionWith(first: string, second: string): string {
  return `${prelude}
class LoadText extends KissAction<State> {
  ${DECLARATIONS[first]}
  ${DECLARATIONS[second]}
  createPollingAction() { return new LoadText(); }
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
}

/** Adds one example for each incompatible pair. */
const withPairs = <T>(builder: T): T => INCOMPATIBLE_PAIRS.reduce(
  (b: any, [first, second]) => b.example(val('First', first), val('Second', second)), builder);

withPairs(Bdd(feature)
  .scenario('Two features that can\'t be combined, in the same action, are an error.')
  .given('An action with {First}, and then {Second}.')
  .when('The code is linted.')
  .then('There is an error in {Second}, saying they can\'t be combined.')
  .and('The suggestions remove one or the other, and the code compiles without the error.'))
  .run(async (ctx) => {
    const first = ctx.example.val('First') as string;
    const second = ctx.example.val('Second') as string;
    const result = lint(rule, actionWith(first, second), {types: false});

    expect(result.messages.map((m) => m.text)).toEqual([second]);
    expect(result.messages[0].message).toContain(`\`${first}\` and \`${second}\` can't be combined in the same action.`);
    expect(result.messages[0].suggestions).toEqual([`Remove \`${first}\`.`, `Remove \`${second}\`.`]);
    expect(result.typeErrors).toEqual([]);

    for (const index of [0, 1]) {
      const suggested = result.withSuggestion(0, index);
      expect(suggested).not.toContain(DECLARATIONS[index === 0 ? first : second]);
      expect(lint(rule, suggested).messages).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('The error explains why, when it helps.')
  .given('An action with {First} and {Second}.')
  .when('The code is linted.')
  .then('The error says: {Reason}')
  .example(val('First', 'unlimitedRetryCheckInternet'), val('Second', 'retry'), val('Reason', '`unlimitedRetryCheckInternet` already retries.'))
  .example(val('First', 'unlimitedRetryCheckInternet'), val('Second', 'checkInternet'), val('Reason', '`unlimitedRetryCheckInternet` already checks the internet.'))
  .example(val('First', 'unlimitedRetryCheckInternet'), val('Second', 'nonReentrant'), val('Reason', '`unlimitedRetryCheckInternet` is already non-reentrant.'))
  .example(val('First', 'poll'), val('Second', 'retry'), val('Reason', 'Add `retry` to the action returned by `createPollingAction()` instead.'))
  .example(val('First', 'sequential'), val('Second', 'debounce'), val('Reason', 'The debounce period would only start when the action gets its turn in the queue.'))
  .run(async (ctx) => {
    const result = lint(rule, actionWith(ctx.example.val('First'), ctx.example.val('Second')), {types: true});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain(ctx.example.val('Reason'));
  });

Bdd(feature)
  .scenario('The rule reports exactly the combinations the store does not allow.')
  .given('Each pair of features, turned on in the same action.')
  .when('The code is linted, and the same action is dispatched.')
  .then('The lint reports the pair if, and only if, the dispatch throws a StoreException.')
  .note('This keeps the rule in sync with the store.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (let i = 0; i < FEATURES.length; i++) {
      for (let j = i + 1; j < FEATURES.length; j++) {
        const pair = `${FEATURES[i]} + ${FEATURES[j]}`;
        if (lint(rule, actionWith(FEATURES[i], FEATURES[j]), {types: false}).messages.length > 0) reported.push(pair);
        if (dispatchThrows(new RuntimeAction(), [FEATURES[i], FEATURES[j]])) thrown.push(pair);
      }
    }
    expect(reported).toEqual(thrown);
    expect(reported).toHaveLength(INCOMPATIBLE_PAIRS.length);
  });

Bdd(feature)
  .scenario('The rule reports exactly the features an OptimisticCommand does not allow.')
  .given('An OptimisticCommand with each feature.')
  .when('The code is linted, and the same command is dispatched.')
  .then('The lint reports the feature if, and only if, the dispatch throws a StoreException.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (const name of FEATURES) {
      const code = `${prelude}
class SaveText extends OptimisticCommand<State, string> {
  ${DECLARATIONS[name]}${commandMethods}
}
`;
      if (lint(rule, code, {types: false}).messages.length > 0) reported.push(name);
      if (dispatchThrows(new RuntimeCommand(), [name])) thrown.push(name);
    }
    expect(reported).toEqual(thrown);
    expect(reported).toEqual(INCOMPATIBLE_WITH_COMMAND);
  });

Bdd(feature)
  .scenario('An OptimisticCommand with a feature it can\'t use is an error.')
  .given('An OptimisticCommand with {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, with a suggestion to remove it.')
  .example(val('Feature', 'nonReentrant'), val('Type information', true))
  .example(val('Feature', 'nonReentrant'), val('Type information', false))
  .example(val('Feature', 'throttle'), val('Type information', true))
  .example(val('Feature', 'unlimitedRetryCheckInternet'), val('Type information', false))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = `${prelude}
class SaveText extends OptimisticCommand<State, string> {
  ${DECLARATIONS[name]}${commandMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`An \`OptimisticCommand\` can't use \`${name}\`.`);
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An OptimisticCommand that retries forever is an error.')
  .given('An OptimisticCommand with retry = {Retry}.')
  .when('The code is linted.')
  .then('There is an error in retry: {Result}.')
  .example(val('Retry', '{ maxRetries: -1 }'), val('Result', 'it can\'t retry forever'))
  .example(val('Retry', '{ unlimitedRetries: true }'), val('Result', 'it can\'t retry forever'))
  .example(val('Retry', '{ maxRetries: 3 }'), val('Result', 'none'))
  .run(async (ctx) => {
    const code = `${prelude}
class SaveText extends OptimisticCommand<State, string> {
  retry = ${ctx.example.val('Retry')};${commandMethods}
}
`;
    const result = lint(rule, code, {types: true});
    if (ctx.example.val('Result') === 'none') {
      expect(result.messages).toEqual([]);
    } else {
      expect(result.messages.map((m) => m.text)).toEqual(['retry']);
      expect(result.messages[0].message).toContain('An `OptimisticCommand` can\'t retry forever');
    }
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The rule reports exactly the features an OptimisticSync does not allow.')
  .given('An OptimisticSync with each feature.')
  .when('The code is linted, and the same action is dispatched.')
  .then('The lint reports the feature if, and only if, the dispatch throws a StoreException.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (const name of FEATURES) {
      const code = `${prelude}
class SaveText extends OptimisticSync<State, string> {
  ${DECLARATIONS[name]}${syncMethods}
}
`;
      if (lint(rule, code, {types: false}).messages.length > 0) reported.push(name);
      if (dispatchThrows(new RuntimeSync(), [name])) thrown.push(name);
    }
    expect(reported).toEqual(thrown);
    expect(reported).toEqual(INCOMPATIBLE_WITH_SYNC);
  });

Bdd(feature)
  .scenario('An OptimisticSync with a feature it can\'t use is an error.')
  .given('An OptimisticSync with {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, with a suggestion to remove it.')
  .example(val('Feature', 'retry'), val('Type information', true))
  .example(val('Feature', 'retry'), val('Type information', false))
  .example(val('Feature', 'sequential'), val('Type information', true))
  .example(val('Feature', 'nonReentrant'), val('Type information', false))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = `${prelude}
class SaveText extends OptimisticSync<State, string> {
  ${DECLARATIONS[name]}${syncMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`An \`OptimisticSync\` can't use \`${name}\`.`);
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The rule reports exactly the features an OptimisticSyncWithPush does not allow.')
  .given('An OptimisticSyncWithPush with each feature.')
  .when('The code is linted, and the same action is dispatched.')
  .then('The lint reports the feature if, and only if, the dispatch throws a StoreException.')
  .and('It allows the same features as an OptimisticSync.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (const name of FEATURES) {
      const code = `${prelude}
class SaveText extends OptimisticSyncWithPush<State, string> {
  ${DECLARATIONS[name]}${syncWithPushMethods}
}
`;
      if (lint(rule, code, {types: false}).messages.length > 0) reported.push(name);
      if (dispatchThrows(new RuntimeSyncWithPush(), [name])) thrown.push(name);
    }
    expect(reported).toEqual(thrown);
    expect(reported).toEqual(INCOMPATIBLE_WITH_SYNC);
  });

Bdd(feature)
  .scenario('An OptimisticSyncWithPush with a feature it can\'t use is an error.')
  .given('An OptimisticSyncWithPush with {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, saying an OptimisticSyncWithPush can\'t use it, with a suggestion to remove it.')
  .example(val('Feature', 'retry'), val('Type information', true))
  .example(val('Feature', 'retry'), val('Type information', false))
  .example(val('Feature', 'sequential'), val('Type information', true))
  .example(val('Feature', 'nonReentrant'), val('Type information', false))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = `${prelude}
class SaveText extends OptimisticSyncWithPush<State, string> {
  ${DECLARATIONS[name]}${syncWithPushMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`An \`OptimisticSyncWithPush\` can't use \`${name}\`.`);
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The rule reports exactly the features a ServerPush does not allow.')
  .given('A ServerPush with each feature.')
  .when('The code is linted, and the same action is dispatched.')
  .then('The lint reports the feature if, and only if, the dispatch throws a StoreException.')
  .and('It does not allow any feature, not even checkInternet.')
  .run(async (_) => {
    const reported: string[] = [];
    const thrown: string[] = [];
    for (const name of FEATURES) {
      const code = `${prelude}${syncWithPushAction}
class PushText extends ServerPush<State> {
  ${DECLARATIONS[name]}${serverPushMethods}
}
`;
      if (lint(rule, code, {types: false}).messages.length > 0) reported.push(name);
      if (dispatchThrows(new RuntimeServerPush(), [name])) thrown.push(name);
    }
    expect(reported).toEqual(thrown);
    expect(reported).toEqual(INCOMPATIBLE_WITH_SERVER_PUSH);
  });

Bdd(feature)
  .scenario('A ServerPush with a feature is an error.')
  .given('A ServerPush with {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, saying a ServerPush can\'t use it, with a suggestion to remove it.')
  .example(val('Feature', 'checkInternet'), val('Type information', true))
  .example(val('Feature', 'checkInternet'), val('Type information', false))
  .example(val('Feature', 'sequential'), val('Type information', true))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = `${prelude}${syncWithPushAction}
class PushText extends ServerPush<State> {
  ${DECLARATIONS[name]}${serverPushMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toContain(`A \`ServerPush\` can't use \`${name}\``);
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An OptimisticSync with checkInternet is not reported.')
  .given('An OptimisticSync with checkInternet.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const code = `${prelude}
class SaveText extends OptimisticSync<State, string> {
  ${DECLARATIONS.checkInternet}${syncMethods}
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toEqual([]);
      expect(result.typeErrors).toEqual([]);
    }
  });

Bdd(feature)
  .scenario('A feature inherited from a superclass counts too.')
  .given('An abstract action with throttle = 1000.')
  .and('A subclass with nonReentrant = true.')
  .when('The code is linted.')
  .then('There is an error in nonReentrant, with a suggestion to remove it (not the inherited throttle).')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class ThrottledAction extends KissAction<State> {
  throttle = 1000;
}

class LoadText extends ThrottledAction {
  nonReentrant = true;
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['nonReentrant']);
    expect(result.messages[0].suggestions).toEqual(['Remove `nonReentrant`.']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Two features inherited from a superclass are only reported in the superclass.')
  .given('An abstract action with retry and debounce.')
  .and('A subclass that declares neither.')
  .when('The code is linted.')
  .then('There is one error, in the superclass.')
  .run(async (_) => {
    const code = `${prelude}
abstract class BaseAction extends KissAction<State> {
  retry = { on: true };
  debounce = 300;
}

class LoadText extends BaseAction {
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    const result = lint(rule, code, {types: true});
    const debounceLine = code.split('\n').findIndex((line) => line.includes('debounce = 300')) + 1;
    expect(result.messages.map((m) => [m.text, m.line])).toEqual([['debounce', debounceLine]]);
  });

Bdd(feature)
  .scenario('A feature turned off by a subclass does not count.')
  .given('An abstract action with {Inherited}.')
  .and('A subclass with {Own}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Inherited', 'retry = { on: true }'), val('Own', 'debounce = 300, and retry = { on: false }'), val('Type information', true))
  .example(val('Inherited', 'retry = { on: true }'), val('Own', 'debounce = 300, and retry = { on: false }'), val('Type information', false))
  .example(val('Inherited', 'throttle = 1000'), val('Own', 'nonReentrant = true, and throttle = false'), val('Type information', false))
  .run(async (ctx) => {
    const own = (ctx.example.val('Own') as string).split(', and ').map((d) => `  ${d};`).join('\n');
    const code = `${prelude}
abstract class BaseAction extends KissAction<State> {
  ${ctx.example.val('Inherited')};
}

class LoadText extends BaseAction {
${own}
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A poll constructor parameter counts as polling.')
  .given('An action with retry, and a constructor parameter "readonly poll = Poll.once".')
  .when('The code is linted.')
  .then('There is an error in poll, with a suggestion to remove retry only.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
class LoadText extends KissAction<State> {
  retry = { on: true };
  constructor(readonly poll = Poll.once) { super(); }
  createPollingAction() { return new LoadText(); }
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['poll']);
    expect(result.messages[0].suggestions).toEqual(['Remove `retry`.']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Features that can be combined, and classes that are not actions, are not reported.')
  .given('{Code}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Code', 'An action with nonReentrant, retry and checkInternet'))
  .example(val('Code', 'An action with throttle and retry'))
  .example(val('Code', 'An action with sequential and nonReentrant'))
  .example(val('Code', 'A class that is not an action, with throttle and nonReentrant'))
  .run(async (ctx) => {
    const declarations: Record<string, string> = {
      'An action with nonReentrant, retry and checkInternet': 'nonReentrant = true; retry = { on: true }; checkInternet = { dialog: false };',
      'An action with throttle and retry': 'throttle = 1000; retry = { on: true };',
      'An action with sequential and nonReentrant': 'sequential = true; nonReentrant = true;',
    };
    const description = ctx.example.val('Code') as string;
    const code = description.startsWith('A class that is not an action') ? `${prelude}
class Settings {
  throttle = 1000;
  nonReentrant = true;
}
` : `${prelude}
class LoadText extends KissAction<State> {
  ${declarations[description]}
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toEqual([]);
      expect(result.typeErrors).toEqual([]);
    }
  });

// ---------------------------------------------------------------------------------------------
// The real actions, to check that the rule agrees with the store.

class RuntimeState {
  constructor(readonly text: string) {}
}

/** Turns on the features in the action, as the code in `DECLARATIONS` does. */
function turnOn(action: any, features: string[]) {
  const values: Record<string, any> = {
    nonReentrant: true,
    retry: { on: true },
    checkInternet: { dialog: false },
    debounce: 300,
    throttle: 1000,
    fresh: 1000,
    sequential: true,
    poll: Poll.once,
    unlimitedRetryCheckInternet: true,
  };
  for (const feature of features) action[feature] = values[feature];
}

/** True if dispatching the action with the features throws a `StoreException` right away. */
function dispatchThrows(action: KissAction<RuntimeState>, features: string[]): boolean {
  turnOn(action, features);
  jest.useFakeTimers();
  const store = new Store<RuntimeState>({ initialState: new RuntimeState(''), logger: null });
  try {
    store.dispatch(action);
    return false;
  } catch (error) {
    if (!(error instanceof StoreException)) throw error;
    return true;
  } finally {
    store.setShutDown(true);
    jest.clearAllTimers();
    jest.useRealTimers();
  }
}

class RuntimeAction extends KissAction<RuntimeState> {
  createPollingAction() {
    return new RuntimeAction();
  }

  protected hasInternet(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async reduce() {
    return null;
  }
}

class RuntimeCommand extends OptimisticCommand<RuntimeState, string> {
  createPollingAction() {
    return new RuntimeAction();
  }

  optimisticValue() {
    return 'new';
  }

  getValueFromState(state: RuntimeState) {
    return state.text;
  }

  applyValueToState(state: RuntimeState, text: string) {
    return new RuntimeState(text);
  }

  async sendCommandToServer() {
    return null;
  }
}

class RuntimeSync extends OptimisticSync<RuntimeState, string> {
  createPollingAction() {
    return new RuntimeAction();
  }

  valueToApply() {
    return 'new';
  }

  applyOptimisticValueToState(state: RuntimeState, text: string) {
    return new RuntimeState(text);
  }

  getValueFromState(state: RuntimeState) {
    return state.text;
  }

  async sendValueToServer() {
    return null;
  }
}

class RuntimeSyncWithPush extends OptimisticSyncWithPush<RuntimeState, string> {
  createPollingAction() {
    return new RuntimeAction();
  }

  valueToApply() {
    return 'new';
  }

  applyOptimisticValueToState(state: RuntimeState, text: string) {
    return new RuntimeState(text);
  }

  getValueFromState(state: RuntimeState) {
    return state.text;
  }

  getServerRevisionFromState() {
    return -1;
  }

  async sendValueToServer() {
    this.informServerRevision(1);
    return null;
  }
}

class RuntimeServerPush extends ServerPush<RuntimeState> {
  createPollingAction() {
    return new RuntimeAction();
  }

  associatedAction() {
    return RuntimeSyncWithPush;
  }

  pushMetadata(): PushMetadata {
    return { serverRevision: 1, localRevision: 1, deviceId: 1 };
  }

  applyServerPushToState(state: RuntimeState) {
    return state;
  }

  getServerRevisionFromState() {
    return -1;
  }
}
