import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/missingKeyParams';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: missing-key-params');

const prelude = `import { OptimisticCommand } from 'kiss-for-react';

class State {
  constructor(readonly todos: Record<string, string>) {}
  withTodo(id: string, text: string): State { return new State({ ...this.todos, [id]: text }); }
}

declare function saveTodo(id: string, text: string): Promise<void>;
`;

const commandMethods = `
  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.todos[this.todoId]; }
  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }
  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }`;

Bdd(feature)
  .scenario('An OptimisticCommand with fields, without a key, is a warning.')
  .given('A subclass of OptimisticCommand with the fields todoId and text.')
  .and('It doesn\'t override nonReentrantKeyParams or computeNonReentrantKey.')
  .when('The code is linted.')
  .then('There is a warning in the class name.')
  .and('The suggestion overrides nonReentrantKeyParams, returning the fields, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${prelude}
class SaveTodo extends OptimisticCommand<State, string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
${commandMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['SaveTodo']);
    expect(result.messages[0].message).toContain('`SaveTodo` has fields, but its non-reentrant key doesn\'t depend on them.');
    expect(result.messages[0].suggestions).toEqual(['Override `nonReentrantKeyParams()`, returning `this.todoId`, `this.text`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  constructor(readonly todoId: string, readonly text: string) { super(); }

  nonReentrantKeyParams() { return [this.todoId, this.text]; }
`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Fields declared as properties are found too.')
  .given('A subclass of OptimisticCommand with fields declared as properties.')
  .when('The suggestion is applied.')
  .then('nonReentrantKeyParams is added after the last field, returning the fields.')
  .and('The code compiles.')
  .run(async (_) => {
    const code = `${prelude}
class SaveTodo extends OptimisticCommand<State, string> {
  readonly todoId = 'A';
  readonly text = 'Buy milk';
${commandMethods}
}
`;
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  readonly text = 'Buy milk';\n\n  nonReentrantKeyParams() { return [this.todoId, this.text]; }\n`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('OptimisticCommands that are not reported.')
  .given('A subclass of OptimisticCommand that {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'overrides nonReentrantKeyParams'), val('Code', `
class SaveTodo extends OptimisticCommand<State, string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; }
${commandMethods}
}`))
  .example(val('Case', 'overrides computeNonReentrantKey'), val('Code', `
class SaveTodo extends OptimisticCommand<State, string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
  computeNonReentrantKey() { return this.todoId; }
${commandMethods}
}`))
  .example(val('Case', 'inherits nonReentrantKeyParams from its superclass'), val('Code', `
abstract class TodoCommand extends OptimisticCommand<State, string> {
  abstract readonly todoId: string;
  nonReentrantKeyParams() { return this.todoId; }
}
class SaveTodo extends TodoCommand {
  constructor(readonly todoId: string, readonly text: string) { super(); }
${commandMethods}
}`))
  .example(val('Case', 'has no fields (only retry)'), val('Code', `
class ClearTodos extends OptimisticCommand<State, Record<string, string>> {
  retry = { maxRetries: 5 };
  optimisticValue() { return {}; }
  getValueFromState(state: State) { return state.todos; }
  applyValueToState(state: State, value: Record<string, string>) { return new State(value); }
  async sendCommandToServer() {}
}`))
  .run(async (ctx) => {
    const code = `${prelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

const actionPrelude = `import { KissAction } from 'kiss-for-react';

class State {}

declare function loadTodo(id: string): Promise<void>;
`;

Bdd(feature)
  .scenario('A nonReentrant action with fields, without a key, is a warning.')
  .given('An action with nonReentrant = true {Where}, and the field todoId.')
  .and('It does not override nonReentrantKeyParams or computeNonReentrantKey.')
  .when('The code is linted.')
  .then('There is a warning in the class name.')
  .and('The suggestion overrides nonReentrantKeyParams, returning the field, and the code compiles.')
  .example(val('Where', 'in the action'), val('Type information', true), val('Code', `
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Where', 'in the action'), val('Type information', false), val('Code', `
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Where', 'in its superclass'), val('Type information', true), val('Code', `
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadTodo extends NonReentrantAction {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Where', 'in its superclass'), val('Type information', false), val('Code', `
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadTodo extends NonReentrantAction {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .run(async (ctx) => {
    const code = `${actionPrelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadTodo']);
    expect(result.messages[0].message).toContain("`LoadTodo` has fields, but its non-reentrant key doesn't depend on them.");
    expect(result.messages[0].suggestions).toEqual(['Override `nonReentrantKeyParams()`, returning `this.todoId`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  constructor(readonly todoId: string) { super(); }

  nonReentrantKeyParams() { return this.todoId; }
`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('Actions that are not non-reentrant, or that have a key, are not reported.')
  .given('An action with fields, that extends KissAction, and {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'is not nonReentrant'), val('Code', `
class LoadTodo extends KissAction<State> {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Case', 'has nonReentrant = false'), val('Code', `
class LoadTodo extends KissAction<State> {
  nonReentrant = false;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Case', 'is nonReentrant, and overrides nonReentrantKeyParams'), val('Code', `
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Case', 'is nonReentrant, and overrides computeNonReentrantKey'), val('Code', `
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  computeNonReentrantKey() { return this.todoId; }
  async reduce() { await loadTodo(this.todoId); return null; }
}`))
  .example(val('Case', 'is nonReentrant, but has no fields'), val('Code', `
class LoadTodos extends KissAction<State> {
  nonReentrant = true;
  retry = { on: true };
  async reduce() { await loadTodo('all'); return null; }
}`))
  .run(async (ctx) => {
    const code = `${actionPrelude}${ctx.example.val('Code')}
`;
    const result = lint(rule, code);
    expect(result.typeErrors).toEqual([]);
    expect(result.messages).toEqual([]);
    expect(lint(rule, code, {types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, an OptimisticCommand base class of another file is known.')
  .given('An abstract command in another file, that extends OptimisticCommand.')
  .and('A subclass with fields, without a key.')
  .when('The code is linted.')
  .then('With type information, there is a warning.')
  .and('Without type information, there is no warning, since the superclass is unknown.')
  .run(async (_) => {
    const files = {
      'command.ts': `import { OptimisticCommand } from 'kiss-for-react';
export class State {
  constructor(readonly todos: Record<string, string>) {}
  withTodo(id: string, text: string): State { return new State({ ...this.todos, [id]: text }); }
}
export abstract class Command<T> extends OptimisticCommand<State, T> {}`,
    };
    const code = `import { Command, State } from './command';

declare function saveTodo(id: string, text: string): Promise<void>;

class SaveTodo extends Command<string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
${commandMethods}
}
`;
    const result = lint(rule, code, {files});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(['SaveTodo']);
    expect(lint(rule, code, {files, types: false}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An action with unlimitedRetryCheckInternet and fields, without a key, is a warning.')
  .given('An action with unlimitedRetryCheckInternet = true, and the field todoId.')
  .and('It does not override nonReentrantKeyParams or computeNonReentrantKey.')
  .when('The code is linted.')
  .then('There is a warning in the class name, since the action is non-reentrant.')
  .and('With nonReentrantKeyParams, there is no warning.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const action = (keyParams: string) => `${actionPrelude}
class LoadTodo extends KissAction<State> {
  unlimitedRetryCheckInternet = true;
  constructor(readonly todoId: string) { super(); }${keyParams}
  async reduce() { await loadTodo(this.todoId); return null; }
}
`;
    const result = lint(rule, action(''), {types});
    expect(result.messages.map((m) => m.text)).toEqual(['LoadTodo']);
    expect(result.messages[0].suggestions).toEqual(['Override `nonReentrantKeyParams()`, returning `this.todoId`.']);

    const withKey = lint(rule, action('\n  nonReentrantKeyParams() { return this.todoId; }'), {types});
    expect(withKey.messages).toEqual([]);
    expect(withKey.typeErrors).toEqual([]);
  });

// ---------------------------------------------------------------------------------------------
// OptimisticSync

const syncPrelude = `import { OptimisticSync } from 'kiss-for-react';

class State {
  constructor(readonly likes: Record<string, boolean>) {}
  withLike(id: string, liked: boolean): State { return new State({ ...this.likes, [id]: liked }); }
}

declare function setLiked(id: string, liked: boolean): Promise<void>;
`;

const syncMethods = `
  valueToApply() { return !this.state.likes[this.itemId]; }
  applyOptimisticValueToState(state: State, liked: boolean) { return state.withLike(this.itemId, liked); }
  getValueFromState(state: State) { return state.likes[this.itemId] ?? false; }
  async sendValueToServer(liked: boolean) { await setLiked(this.itemId, liked); }`;

Bdd(feature)
  .scenario('An OptimisticSync with fields, without a key, is a warning.')
  .given('A subclass of OptimisticSync with the field itemId.')
  .and('It doesn\'t override optimisticSyncKeyParams or computeOptimisticSyncKey.')
  .when('The code is linted.')
  .then('There is a warning in the class name, saying the value of other items may never be sent.')
  .and('The suggestion overrides optimisticSyncKeyParams, returning the field, and the code compiles.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const code = `${syncPrelude}
class ToggleLike extends OptimisticSync<State, boolean> {
  constructor(readonly itemId: string) { super(); }
${syncMethods}
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});
    expect(result.messages.map((m) => m.text)).toEqual(['ToggleLike']);
    expect(result.messages[0].message).toContain('`ToggleLike` has fields, but its optimistic sync key doesn\'t depend on them.');
    expect(result.messages[0].message).toContain('its value may never be sent to the server');
    expect(result.messages[0].suggestions).toEqual(['Override `optimisticSyncKeyParams()`, returning `this.itemId`.']);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain(`  constructor(readonly itemId: string) { super(); }

  optimisticSyncKeyParams() { return this.itemId; }
`);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
    expect(lint(rule, suggested).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('OptimisticSyncs that are not reported.')
  .given('An OptimisticSync that {Case}.')
  .when('The code is linted.')
  .then('There are no warnings.')
  .example(val('Case', 'overrides optimisticSyncKeyParams'), val('Code', `
  optimisticSyncKeyParams() { return this.itemId; }`))
  .example(val('Case', 'overrides computeOptimisticSyncKey'), val('Code', `
  computeOptimisticSyncKey() { return this.itemId; }`))
  .example(val('Case', 'only overrides nonReentrantKeyParams, which it does not use, so it is still reported'), val('Code', `
  nonReentrantKeyParams() { return this.itemId; }`))
  .run(async (ctx) => {
    const code = `${syncPrelude}
class ToggleLike extends OptimisticSync<State, boolean> {
  constructor(readonly itemId: string) { super(); }
${syncMethods}${ctx.example.val('Code')}
}
`;
    const reported = (ctx.example.val('Case') as string).includes('still reported');
    for (const types of [true, false]) {
      const result = lint(rule, code, {types});
      expect(result.typeErrors).toEqual([]);
      expect(result.messages.map((m) => m.text)).toEqual(reported ? ['ToggleLike'] : []);
    }
  });
