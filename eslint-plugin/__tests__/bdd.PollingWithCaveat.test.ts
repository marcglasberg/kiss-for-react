import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: polling-with-caveat');

const rule = 'polling-with-caveat';

const prelude = `import { KissAction, Poll } from 'kiss-for-react';

class State {
  constructor(readonly prices: number[]) {}
}

declare function loadPrices(): Promise<number[]>;

class LoadPrices extends KissAction<State> {
  async reduce() { const prices = await loadPrices(); return () => new State(prices); }
}
`;

/** How each feature is turned on, in the code. */
const DECLARATIONS: Record<string, string> = {
  checkInternet: 'checkInternet = { dialog: false };',
  nonReentrant: 'nonReentrant = true;',
  throttle: 'throttle = 5000;',
  fresh: 'fresh = 5000;',
  sequential: 'sequential = true;',
};

/** An action that starts and stops the polling, with the given members. */
function pollingAction(members: string): string {
  return `${prelude}
class PollPrices extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
  ${members}
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`;
}

Bdd(feature)
  .scenario('A feature that may block Poll.stop, in the action that starts and stops the polling, is an error.')
  .given('An action with a poll, and {Feature}.')
  .when('The code is linted.')
  .then('There is an error in {Feature}, saying {Reason}.')
  .and('The suggestion removes {Feature}, and the code compiles without the error.')
  .example(val('Feature', 'checkInternet'), val('Reason', 'a `Poll.stop` dispatched while there is no internet fails'), val('Type information', true))
  .example(val('Feature', 'checkInternet'), val('Reason', 'a `Poll.stop` dispatched while there is no internet fails'), val('Type information', false))
  .example(val('Feature', 'nonReentrant'), val('Reason', 'a `Poll.stop` dispatched while a run is in progress is ignored'), val('Type information', true))
  .example(val('Feature', 'nonReentrant'), val('Reason', 'a `Poll.stop` dispatched while a run is in progress is ignored'), val('Type information', false))
  .example(val('Feature', 'throttle'), val('Reason', 'a `Poll.stop` dispatched inside the throttle period is ignored'), val('Type information', true))
  .example(val('Feature', 'throttle'), val('Reason', 'a `Poll.stop` dispatched inside the throttle period is ignored'), val('Type information', false))
  .example(val('Feature', 'fresh'), val('Reason', 'a `Poll.stop` dispatched while the data is fresh is ignored'), val('Type information', true))
  .example(val('Feature', 'fresh'), val('Reason', 'a `Poll.stop` dispatched while the data is fresh is ignored'), val('Type information', false))
  .example(val('Feature', 'sequential'), val('Reason', 'a `Poll.stop` has to wait for its turn in the queue'), val('Type information', true))
  .example(val('Feature', 'sequential'), val('Reason', 'a `Poll.stop` has to wait for its turn in the queue'), val('Type information', false))
  .run(async (ctx) => {
    const name = ctx.example.val('Feature') as string;
    const code = pollingAction(DECLARATIONS[name]);
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});

    expect(result.messages.map((m) => m.text)).toEqual([name]);
    expect(result.messages[0].message).toBe(
      `Don't add \`${name}\` to the action that starts and stops the polling, because ` +
      `${ctx.example.val('Reason')}, so you may be unable to stop the polling. Add it to the action ` +
      'returned by `createPollingAction()` instead.');
    expect(result.messages[0].suggestions).toEqual([`Remove \`${name}\`.`]);
    expect(result.typeErrors).toEqual([]);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).not.toContain(DECLARATIONS[name]);
    expect(lint(rule, suggested).messages).toEqual([]);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('With checkInternet = { abort: true }, the error says Poll.stop is aborted.')
  .given('An action with a poll, and checkInternet = { abort: true }.')
  .when('The code is linted.')
  .then('The error says a Poll.stop dispatched while there is no internet is aborted.')
  .run(async (_) => {
    const result = lint(rule, pollingAction('checkInternet = { abort: true };'), {types: true});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain('a `Poll.stop` dispatched while there is no internet is aborted');
  });

Bdd(feature)
  .scenario('A poll property counts too, and each feature is reported.')
  .given('An action with poll = Poll.once as a property, nonReentrant and throttle.')
  .when('The code is linted.')
  .then('There are errors in nonReentrant and throttle.')
  .run(async (_) => {
    const code = `${prelude}
class PollPrices extends KissAction<State> {
  poll = Poll.once;
  nonReentrant = true;
  throttle = 5000;
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`;
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages.map((m) => m.text)).toEqual(['nonReentrant', 'throttle']);
    }
  });

Bdd(feature)
  .scenario('A feature inherited from a superclass, in an action with a poll, is reported in the poll.')
  .given('An abstract action with throttle.')
  .and('A subclass with a poll.')
  .when('The code is linted.')
  .then('There is an error in the poll of the subclass, without suggestions.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class ThrottledAction extends KissAction<State> {
  throttle = 5000;
}

class PollPrices extends ThrottledAction {
  constructor(readonly poll = Poll.once) { super(); }
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['poll']);
    expect(result.messages[0].message).toContain('Don\'t add `throttle`');
    expect(result.messages[0].suggestions).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A feature in a subclass of an action with a poll is reported in the feature.')
  .given('An abstract action with a poll.')
  .and('A subclass with nonReentrant.')
  .when('The code is linted.')
  .then('There is an error in nonReentrant, in the subclass only.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
abstract class PollingAction extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
}

class PollPrices extends PollingAction {
  nonReentrant = true;
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['nonReentrant']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('A poll and a feature, both inherited, are only reported in the superclass.')
  .given('An abstract action with a poll and fresh.')
  .and('A subclass that declares neither.')
  .when('The code is linted.')
  .then('There is one error, in the fresh of the superclass.')
  .run(async (_) => {
    const code = `${prelude}
abstract class PollingAction extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
  fresh = 5000;
}

class PollPrices extends PollingAction {
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: true});
    const freshLine = code.split('\n').findIndex((line) => line.includes('fresh = 5000')) + 1;
    expect(result.messages.map((m) => [m.text, m.line])).toEqual([['fresh', freshLine]]);
  });

Bdd(feature)
  .scenario('Code that does not block Poll.stop is not reported.')
  .given('{Code}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Code', 'The features in the tick action, returned by createPollingAction()'))
  .example(val('Code', 'An action with a poll, pollInterval and pollWaitsForRun'))
  .example(val('Code', 'An action with a poll, and throttle = false in a subclass'))
  .example(val('Code', 'An action with a poll and retry (reported by incompatible-action-features)'))
  .example(val('Code', 'A class that is not an action, with a poll and throttle'))
  .run(async (ctx) => {
    const codes: Record<string, string> = {
      'The features in the tick action, returned by createPollingAction()': `${prelude}
class LoadPricesTick extends KissAction<State> {
  checkInternet = { dialog: false };
  nonReentrant = true;
  async reduce() { const prices = await loadPrices(); return () => new State(prices); }
}

class PollPrices extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
  createPollingAction() { return new LoadPricesTick(); }
  reduce() { return null; }
}
`,
      'An action with a poll, pollInterval and pollWaitsForRun': pollingAction('pollInterval = 5000;\n  pollWaitsForRun = false;'),
      'An action with a poll, and throttle = false in a subclass': `${prelude}
abstract class ThrottledAction extends KissAction<State> {
  throttle: number | boolean = 5000;
}

class PollPrices extends ThrottledAction {
  constructor(readonly poll = Poll.once) { super(); }
  throttle = false;
  createPollingAction() { return new LoadPrices(); }
  reduce() { return null; }
}
`,
      'An action with a poll and retry (reported by incompatible-action-features)': pollingAction('retry = { on: true };'),
      'A class that is not an action, with a poll and throttle': `${prelude}
class Settings {
  poll = Poll.once;
  throttle = 5000;
}
`,
    };
    const code = codes[ctx.example.val('Code') as string];
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.messages).toEqual([]);
      expect(result.typeErrors).toEqual([]);
    }
  });
