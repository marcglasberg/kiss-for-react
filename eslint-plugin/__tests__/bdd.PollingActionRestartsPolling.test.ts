import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: polling-action-restarts-polling');

const rule = 'polling-action-restarts-polling';

const prelude = `import { KissAction, Poll } from 'kiss-for-react';

class State {
  constructor(readonly prices: number[]) {}
}

declare function loadPrices(): Promise<number[]>;

class LoadPrices extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
  pollInterval = 5000;
  createPollingAction() { return %CREATE%; }
  async reduce() { const prices = await loadPrices(); return () => new State(prices); }
}
`;

/** The code, with `createPollingAction()` returning the given expression. */
const codeWith = (creation: string, extra = '') => prelude.replace('%CREATE%', creation) + extra;

/** Adds the examples, each one with and without type information (or just that, without examples). */
const withTypeInfo = (builder: any, examples: any[][] = [[]]) => examples.reduce((b, example) =>
  b.example(...example, val('Type information', true)).example(...example, val('Type information', false)), builder);

withTypeInfo(Bdd(feature)
  .scenario('createPollingAction() that creates the action with a Poll value that controls the polling is a warning.')
  .given('An action with polling.')
  .when('Its createPollingAction() returns new LoadPrices(Poll.{Value}).')
  .then('There is a warning in Poll.{Value}.')
  .and('The suggestion uses Poll.once, and then there is no warning.'), [
  [val('Value', 'start')],
  [val('Value', 'stop')],
  [val('Value', 'runNowAndRestart')],
])
  .run(async (ctx: any) => {
    const value = ctx.example.val('Value');
    const result = lint(rule, codeWith(`new LoadPrices(Poll.${value})`), {types: ctx.example.val('Type information')});

    expect(result.messages.map((m) => m.text)).toEqual([`Poll.${value}`]);
    expect(result.messages[0].message).toBe(
      `The action returned by \`createPollingAction()\` must use \`Poll.once\`, not \`Poll.${value}\`, so that ` +
      'the ticks don\'t start, stop or restart the polling.');
    expect(result.messages[0].suggestions).toEqual(['Use `Poll.once`.']);
    expect(result.typeErrors).toEqual([]);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('createPollingAction() { return new LoadPrices(Poll.once); }');
    expect(lint(rule, suggested).messages).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('createPollingAction() that creates the action with Poll.once, or without a poll, is fine.')
  .given('An action with polling, whose poll is Poll.once by default.')
  .when('Its createPollingAction() returns {Creation}.')
  .then('There is no warning.'), [
  [val('Creation', 'new LoadPrices(Poll.once)')],
  [val('Creation', 'new LoadPrices()')],
])
  .run(async (ctx: any) => {
    const result = lint(rule, codeWith(ctx.example.val('Creation')), {types: ctx.example.val('Type information')});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('createPollingAction() that passes this.poll is a warning.')
  .given('An action with polling.')
  .when('Its createPollingAction() returns new LoadPrices(this.poll).')
  .then('There is a warning in this.poll, saying it is Poll.start or Poll.runNowAndRestart while the polling runs.')
  .and('The suggestion uses Poll.once.'))
  .run(async (ctx: any) => {
    const result = lint(rule, codeWith('new LoadPrices(this.poll)'), {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['this.poll']);
    expect(result.messages[0].message).toContain('not `this.poll`, which is `Poll.start` or `Poll.runNowAndRestart` while the polling runs');
    expect(result.withSuggestion(0, 0)).toContain('return new LoadPrices(Poll.once);');
  });

withTypeInfo(Bdd(feature)
  .scenario('createPollingAction() that creates an action without a poll, whose default is not Poll.once, is a warning.')
  .given('An action whose poll parameter is Poll.start by default.')
  .when('Its createPollingAction() returns new PollPrices(), without the poll.')
  .then('There is a warning in new PollPrices(), saying it uses Poll.start.')
  .and('The suggestion passes Poll.once, and then there is no warning.'))
  .run(async (ctx: any) => {
    const code = `import { KissAction, Poll } from 'kiss-for-react';

class State {
  constructor(readonly prices: number[]) {}
}

class PollPrices extends KissAction<State> {
  constructor(readonly market: string, readonly poll = Poll.start) { super(); }
  createPollingAction() { return new PollPrices(this.market); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new PollPrices(this.market)']);
    expect(result.messages[0].message).toBe(
      '`PollPrices` is created without a `poll`, so it uses `Poll.start`. The action returned by ' +
      '`createPollingAction()` must use `Poll.once`, so that the ticks don\'t start, stop or restart the polling.');
    expect(result.messages[0].suggestions).toEqual(['Use `Poll.once`.']);
    expect(result.typeErrors).toEqual([]);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('return new PollPrices(this.market, Poll.once);');
    expect(lint(rule, suggested).messages).toEqual([]);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('A poll property that is not Poll.once, in the created action, is a warning without a suggestion.')
  .given('A tick action with the property poll = Poll.start.')
  .when('createPollingAction() returns a new tick action.')
  .then('There is a warning in the new expression, without suggestions.'))
  .run(async (ctx: any) => {
    const code = codeWith('new Tick()', `
class Tick extends KissAction<State> {
  poll = Poll.start;
  reduce() { return null; }
}
`);
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Tick()']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, the default poll of an action declared in another file is checked too.')
  .given('An action declared in another file, whose poll parameter is Poll.start by default.')
  .when('createPollingAction() creates it without a poll.')
  .then('There is a warning with type information, and none without it.')
  .run(async (_) => {
    const files = {
      'tick.ts': `import { KissAction, Poll } from 'kiss-for-react';
export class State { constructor(readonly prices: number[]) {} }
export class Tick extends KissAction<State> {
  constructor(readonly poll = Poll.start) { super(); }
  reduce() { return null; }
}
`,
    };
    const code = `import { KissAction, Poll } from 'kiss-for-react';
import { State, Tick } from './tick';

class PollPrices extends KissAction<State> {
  constructor(readonly poll = Poll.once) { super(); }
  createPollingAction() { return new Tick(); }
  reduce() { return null; }
}
`;
    const result = lint(rule, code, {types: true, files});
    expect(result.messages.map((m) => m.text)).toEqual(['new Tick()']);
    expect(result.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false, files}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A createPollingAction() in a class that is not an action is not checked.')
  .given('A class that is not an action, with createPollingAction() returning new LoadPrices(Poll.start).')
  .when('The code is linted.')
  .then('There is no warning.')
  .run(async (_) => {
    const code = codeWith('new LoadPrices()', `
class Factory {
  createPollingAction() { return new LoadPrices(Poll.start); }
}
`);
    for (const types of [true, false]) expect(lint(rule, code, {types}).messages).toEqual([]);
  });
