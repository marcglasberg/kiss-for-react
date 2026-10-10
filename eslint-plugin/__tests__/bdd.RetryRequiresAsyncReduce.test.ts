import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: retry-requires-async-reduce');

const rule = 'retry-requires-async-reduce';

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
  add(n: number): State { return new State(this.count + n); }
}
`;

Bdd(feature)
  .scenario('An action with retry and a sync reduce is an error.')
  .given('An action with retry = {Retry}, and a sync reduce.')
  .when('The code is linted.')
  .then('There is an error in retry.')
  .and('There are two suggestions: remove retry, or make reduce async.')
  .example(val('Retry', '{ on: true }'), val('Type information', true))
  .example(val('Retry', '{ on: true }'), val('Type information', false))
  .example(val('Retry', '{ maxRetries: 5 }'), val('Type information', true))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Increment extends KissAction<State> {
  retry = ${ctx.example.val('Retry')};

  reduce() {
    return this.state.add(1);
  }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['retry']);
    expect(result.messages[0].message).toContain('Retry only works with an async `reduce`');
    expect(result.messages[0].suggestions).toEqual(['Remove `retry`.', 'Make `reduce` async.']);
  });

Bdd(feature)
  .scenario('The suggestions remove retry, or make reduce async, and the code compiles.')
  .given('An action with retry, and a sync reduce.')
  .when('The {Suggestion} suggestion is applied.')
  .then('The code is {Result}.')
  .and('It compiles.')
  .example(val('Suggestion', 'first'), val('Result', 'without retry'))
  .example(val('Suggestion', 'second'), val('Result', 'with an async reduce that returns a function'))
  .run(async (ctx) => {
    const isFirst = ctx.example.val('Suggestion') === 'first';
    const code = `${prelude}
class Increment extends KissAction<State> {
  retry = { on: true };

  reduce() {
    if (this.state.count > 10) return null;
    return this.state.add(1);
  }
}
`;
    const suggested = lint(rule, code).withSuggestion(0, isFirst ? 0 : 1);

    if (isFirst) {
      expect(suggested).not.toContain('retry');
      expect(suggested).toContain('class Increment extends KissAction<State> {\n\n  reduce() {');
    } else {
      expect(suggested).toContain('async reduce() {');
      expect(suggested).toContain('if (this.state.count > 10) return null;');
      expect(suggested).toContain('return () => this.state.add(1);');
    }
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Retry with an async reduce, or retry turned off, is fine.')
  .given('An action with {Case}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Case', 'retry and an async reduce'), val('Code', `
  retry = { on: true };
  async reduce() { return (state: State) => state.add(1); }`))
  .example(val('Case', 'retry and a reduce that returns a Promise'), val('Code', `
  retry = { on: true };
  reduce(): Promise<(state: State) => State> { return Promise.resolve((state: State) => state.add(1)); }`))
  .example(val('Case', 'retry turned off, and a sync reduce'), val('Code', `
  retry = { on: false };
  reduce() { return this.state.add(1); }`))
  .example(val('Case', 'no retry, and a sync reduce'), val('Code', `
  reduce() { return this.state.add(1); }`))
  .run(async (ctx) => {
    const code = `${prelude}
class Increment extends KissAction<State> {${ctx.example.val('Code')}
}
`;
    expect(lint(rule, code).messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action with unlimitedRetryCheckInternet and a sync reduce is an error.')
  .given('An action with unlimitedRetryCheckInternet = {Value}, and a sync reduce.')
  .when('The code is linted.')
  .then('There is an error in unlimitedRetryCheckInternet.')
  .and('There are two suggestions: remove unlimitedRetryCheckInternet, or make reduce async.')
  .example(val('Value', 'true'), val('Type information', true))
  .example(val('Value', 'true'), val('Type information', false))
  .example(val('Value', '{ maxDelayNoInternet: 3000 }'), val('Type information', true))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = `${prelude}
class Increment extends KissAction<State> {
  unlimitedRetryCheckInternet = ${ctx.example.val('Value')};

  reduce() {
    return this.state.add(1);
  }
}
`;
    const result = lint(rule, code, {types});
    expect(result.messages.map((m) => m.text)).toEqual(['unlimitedRetryCheckInternet']);
    expect(result.messages[0].message).toContain('`unlimitedRetryCheckInternet` only works with an async `reduce`');
    expect(result.messages[0].suggestions).toEqual(['Remove `unlimitedRetryCheckInternet`.', 'Make `reduce` async.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).not.toContain('unlimitedRetryCheckInternet');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('unlimitedRetryCheckInternet with an async reduce, or turned off, is fine.')
  .given('An action with {Code}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Code', 'unlimitedRetryCheckInternet = true, and an async reduce'))
  .example(val('Code', 'unlimitedRetryCheckInternet = false, and a sync reduce'))
  .run(async (ctx) => {
    const isAsync = (ctx.example.val('Code') as string).includes('async');
    const code = `${prelude}
class Increment extends KissAction<State> {
  unlimitedRetryCheckInternet = ${isAsync};

  ${isAsync ? 'async reduce() { return () => this.state.add(1); }' : 'reduce() { return this.state.add(1); }'}
}
`;
    const result = lint(rule, code, {types: true});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });
