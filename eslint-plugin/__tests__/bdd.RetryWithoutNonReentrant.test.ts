import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/retryWithoutNonReentrant';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: retry-without-non-reentrant');

const prelude = `import { KissAction, OptimisticCommand } from 'kiss-for-react';

class State {
  constructor(readonly text: string) {}
}

declare function loadText(): Promise<string>;
`;

Bdd(feature)
  .scenario('An action with retry, but not nonReentrant, is a warning.')
  .given('An action with retry = {Retry}, an async reduce, and no nonReentrant.')
  .when('The code is linted.')
  .then('There is a warning in retry.')
  .and('The suggestion adds nonReentrant = true after retry, and the code compiles.')
  .example(val('Retry', '{ on: true }'), val('Type information', true))
  .example(val('Retry', '{ on: true }'), val('Type information', false))
  .example(val('Retry', '{ maxRetries: 5 }'), val('Type information', true))
  .run(async (ctx) => {
    const retry = ctx.example.val('Retry') as string;
    const code = `${prelude}
class LoadText extends KissAction<State> {
  retry = ${retry};

  async reduce() {
    const text = await loadText();
    return (state: State) => new State(text);
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['retry']);
    expect(result.messages[0].message).toContain('This action has `retry`, but not `nonReentrant = true`.');
    expect(result.messages[0].suggestions).toEqual(['Add `nonReentrant = true;`.']);
    expect(result.fixed).toBe(code);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  retry = ${retry};\n  nonReentrant = true;\n`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('The suggestion adds override when retry has it.')
  .given('An action with override retry, and no nonReentrant.')
  .when('The suggestion is applied.')
  .then('It adds override nonReentrant = true.')
  .run(async (_) => {
    const code = `${prelude}
class LoadText extends KissAction<State> {
  override retry = { on: true };
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    const suggested = lint(rule, code).withSuggestion(0, 0);
    expect(suggested).toContain('  override retry = { on: true };\n  override nonReentrant = true;\n');
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions with retry that are not reported.')
  .given('An action with retry, and {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'nonReentrant = true'), val('Code', `
class LoadText extends KissAction<State> {
  retry = { on: true };
  nonReentrant = true;
  async reduce() { const text = await loadText(); return () => new State(text); }
}`))
  .example(val('Case', 'nonReentrant = false, which is deliberate'), val('Code', `
class LoadText extends KissAction<State> {
  retry = { on: true };
  nonReentrant = false;
  async reduce() { const text = await loadText(); return () => new State(text); }
}`))
  .example(val('Case', 'nonReentrant = true in its superclass'), val('Code', `
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadText extends NonReentrantAction {
  retry = { on: true };
  async reduce() { const text = await loadText(); return () => new State(text); }
}`))
  .example(val('Case', 'an overridden abortDispatch'), val('Code', `
class LoadText extends KissAction<State> {
  retry = { on: true };
  abortDispatch() { return this.state.text !== ''; }
  async reduce() { const text = await loadText(); return () => new State(text); }
}`))
  .example(val('Case', 'retry turned off'), val('Code', `
class LoadText extends KissAction<State> {
  retry = { on: false };
  async reduce() { const text = await loadText(); return () => new State(text); }
}`))
  .example(val('Case', 'a sync reduce, which is reported by retry-requires-async-reduce'), val('Code', `
class LoadText extends KissAction<State> {
  retry = { on: true };
  reduce() { return new State('text'); }
}`))
  .example(val('Case', 'it is an OptimisticCommand, which is always non-reentrant'), val('Code', `
class SaveText extends OptimisticCommand<State, string> {
  constructor(readonly text: string) { super(); }
  retry = { maxRetries: 5 };
  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.text; }
  applyValueToState(state: State, value: string) { return new State(value); }
  async sendCommandToServer(value: string) { return value; }
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Without type information, an OptimisticCommand from another file is recognized by its methods.')
  .given('An action that extends a base command of another file, which extends OptimisticCommand.')
  .and('It has retry, and implements sendCommandToServer.')
  .when('The code is linted.')
  .then('There are no warnings, with or without type information.')
  .run(async (_) => {
    const files = {
      'command.ts': `import { OptimisticCommand } from 'kiss-for-react';
export class State { constructor(readonly text: string) {} }
export abstract class Command<T> extends OptimisticCommand<State, T> {}`,
    };
    const code = `import { Command, State } from './command';

class SaveText extends Command<string> {
  constructor(readonly text: string) { super(); }
  retry = { maxRetries: 5 };
  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.text; }
  applyValueToState(state: State, value: string) { return new State(value); }
  async sendCommandToServer(value: string) { return value; }
}
`;
    const result = lint(rule, code, {files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Retry without nonReentrant is not reported in tests.')
  .given('A test file with an action with retry, and no nonReentrant.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .run(async (_) => {
    const code = `${prelude}
class LoadText extends KissAction<State> {
  retry = { on: true };
  async reduce() { const text = await loadText(); return () => new State(text); }
}
`;
    expect(lint(rule, code, {filename: '__tests__/loadText.test.ts'}).messages).toEqual([]);
  });
