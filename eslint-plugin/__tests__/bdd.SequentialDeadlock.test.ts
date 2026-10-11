import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: sequential-deadlock');

const rule = 'sequential-deadlock';

const prelude = `import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly count: number) {}
}

abstract class Action extends KissAction<State> {}

class Child extends Action {
  sequential = true;
  async reduce() { return null; }
}

class NotSequential extends Action {
  async reduce() { return null; }
}
`;

/** A sequential action `Parent`, with the given members and `reduce` body. */
function parent(reduceBody: string, members = ''): string {
  return `${prelude}
class Parent extends Action {
  sequential = true;
  ${members}
  async reduce() {
    ${reduceBody}
    return null;
  }
}
`;
}

/** Adds the examples, each one with and without type information (or just that, without examples). */
const withTypeInfo = (builder: any, examples: any[][] = [[]]) => examples.reduce((b, example) =>
  b.example(...example, val('Type information', true)).example(...example, val('Type information', false)), builder);

withTypeInfo(Bdd(feature)
  .scenario('A sequential action that waits for another action of the same queue is an error.')
  .given('Two sequential actions, Parent and Child, with the default queue.')
  .when('Parent awaits this.dispatchAndWait(new Child()).')
  .then('There is an error in new Child(), saying it deadlocks.')
  .and('The suggestion uses dispatch, without waiting, and then there is no error.'))
  .run(async (ctx: any) => {
    const code = parent('await this.dispatchAndWait(new Child());');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});

    expect(result.messages.map((m) => m.text)).toEqual(['new Child()']);
    expect(result.messages[0].message).toBe(
      '`Parent` and `Child` use the same sequential queue, so waiting for `Child` with `dispatchAndWait` ' +
      'deadlocks: `Child` only runs after `Parent` finishes. Use `dispatch` instead, without waiting, ' +
      'or give the actions different keys in `sequentialKeyParams()`.');
    expect(result.messages[0].suggestions).toEqual(['Use `dispatch`, without waiting.']);
    expect(result.typeErrors).toEqual([]);

    const suggested = result.withSuggestion(0, 0);
    expect(suggested).toContain('    this.dispatch(new Child());');
    expect(lint(rule, suggested).messages).toEqual([]);
    expect(lint(rule, suggested).typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('Waiting for another action of the same class is an error too.')
  .given('A sequential action Parent.')
  .when('Parent awaits this.dispatchAndWait(new Parent()).')
  .then('There is an error in new Parent().'))
  .run(async (ctx: any) => {
    const result = lint(rule, parent('await this.dispatchAndWait(new Parent());'), {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Parent()']);
  });

withTypeInfo(Bdd(feature)
  .scenario('Waiting for an action that is not sequential, or not waiting, is fine.')
  .given('A sequential action Parent.')
  .when('Parent {Waits}.')
  .then('There is no error.'), [
  [val('Waits', 'awaits this.dispatchAndWait(new NotSequential())'), val('Code', 'await this.dispatchAndWait(new NotSequential());')],
  [val('Waits', 'dispatches Child without waiting'), val('Code', 'this.dispatch(new Child());')],
  [val('Waits', 'calls dispatchAndWait without awaiting it'), val('Code', 'void this.dispatchAndWait(new Child());')],
  [val('Waits', 'awaits dispatchAndWait in a closure'), val('Code', 'setTimeout(async () => { await this.dispatchAndWait(new Child()); }, 0);')],
])
  .run(async (ctx: any) => {
    const result = lint(rule, parent(ctx.example.val('Code')), {types: ctx.example.val('Type information')});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An action that is not sequential can wait for a sequential action.')
  .given('An action that is not sequential.')
  .when('It awaits this.dispatchAndWait(new Child()), and Child is sequential.')
  .then('There is no error.')
  .run(async (_) => {
    const code = `${prelude}
class Parent extends Action {
  async reduce() {
    await this.dispatchAndWait(new Child());
    return null;
  }
}
`;
    for (const types of [true, false]) expect(lint(rule, code, {types}).messages).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('Actions with the same key in sequentialKeyParams use the same queue.')
  .given('A sequential action Parent, whose sequentialKeyParams returns {Parent key}.')
  .and('A sequential action Other, whose sequentialKeyParams returns {Other key}.')
  .when('Parent awaits this.dispatchAndWait(new Other()).')
  .then('There {Result}.'), [
  [val('Parent key', `'saves'`), val('Other key', `"saves"`), val('Result', 'is an error')],
  [val('Parent key', `'saves'`), val('Other key', `'loads'`), val('Result', 'is no error')],
  [val('Parent key', '1'), val('Other key', '1'), val('Result', 'is an error')],
  [val('Parent key', 'null'), val('Other key', 'null'), val('Result', 'is an error')],
  [val('Parent key', 'null'), val('Other key', `'saves'`), val('Result', 'is no error')],
  [val('Parent key', 'this.constructor'), val('Other key', 'this.constructor'), val('Result', 'is no error')],
  [val('Parent key', 'Parent'), val('Other key', 'Parent'), val('Result', 'is an error')],
  [val('Parent key', 'this.id'), val('Other key', 'this.id'), val('Result', 'is no error')],
  [val('Parent key', 'this.id'), val('Other key', 'null'), val('Result', 'is no error')],
])
  .run(async (ctx: any) => {
    const code = `${prelude}
class Other extends Action {
  sequential = true;
  readonly id = 1;
  sequentialKeyParams() { return ${ctx.example.val('Other key')}; }
  async reduce() { return null; }
}

class Parent extends Action {
  sequential = true;
  readonly id = 1;
  sequentialKeyParams() { return ${ctx.example.val('Parent key')}; }
  async reduce() {
    await this.dispatchAndWait(new Other());
    return null;
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    const expected = ctx.example.val('Result') === 'is an error' ? ['new Other()'] : [];
    expect(result.messages.map((m) => m.text)).toEqual(expected);
    expect(result.typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('With this.constructor as the key, waiting for an action of the same class is an error.')
  .given('A sequential action whose sequentialKeyParams returns this.constructor.')
  .when('It awaits this.dispatchAndWait of a new action of the same class.')
  .then('There is an error.'))
  .run(async (ctx: any) => {
    const code = parent('await this.dispatchAndWait(new Parent());', 'sequentialKeyParams() { return this.constructor; }');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Parent()']);
  });

withTypeInfo(Bdd(feature)
  .scenario('Waiting for a sequential action class of the same queue is an error, without a suggestion.')
  .given('Two sequential actions, Parent and Child, with the default queue.')
  .when('Parent awaits {Code}.')
  .then('There is an error in {Reported}, without suggestions.'), [
  [val('Code', 'this.waitActionType(Child)'), val('Reported', 'Child'), val('Method', 'waitActionType')],
  [val('Code', 'this.waitAllActionTypes([NotSequential, Child])'), val('Reported', 'Child'), val('Method', 'waitAllActionTypes')],
  [val('Code', 'this.store.waitActionType(Child)'), val('Reported', 'Child'), val('Method', 'waitActionType')],
])
  .run(async (ctx: any) => {
    const code = parent(`await ${ctx.example.val('Code')};`);
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Reported')]);
    expect(result.messages[0].message).toContain(`with \`${ctx.example.val('Method')}\` deadlocks`);
    expect(result.messages[0].message).toContain('Don\'t wait for `Child`, or give the actions different keys');
    expect(result.messages[0].suggestions).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('Waiting for its own class with waitActionType is not reported.')
  .given('A sequential action Parent.')
  .when('Parent awaits this.waitActionType(Parent).')
  .then('There is no error, since Kiss throws instead of waiting.'))
  .run(async (ctx: any) => {
    const result = lint(rule, parent('await this.waitActionType(Parent);'), {types: ctx.example.val('Type information')});
    expect(result.messages).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('In a list of actions, only the ones of the same queue are reported.')
  .given('A sequential action Parent.')
  .when('Parent awaits this.store.dispatchAndWaitAll([new NotSequential(), new Child()]).')
  .then('There is an error in new Child() only.')
  .and('The suggestion uses dispatchAll, without waiting.'))
  .run(async (ctx: any) => {
    const code = parent('await this.store.dispatchAndWaitAll([new NotSequential(), new Child()]);');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Child()']);
    expect(result.messages[0].suggestions).toEqual(['Use `dispatchAll`, without waiting.']);
    expect(result.withSuggestion(0, 0)).toContain('    this.store.dispatchAll([new NotSequential(), new Child()]);');
    expect(lint(rule, result.withSuggestion(0, 0)).typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('When the result of the wait is used, there is no suggestion.')
  .given('A sequential action Parent.')
  .when('Parent uses the result of await this.dispatchAndWait(new Child()).')
  .then('There is an error, without suggestions.'))
  .run(async (ctx: any) => {
    const code = parent('const status = await this.dispatchAndWait(new Child());\n    if (status.isCompletedFailed) throw new Error();');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Child()']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('Returning the wait from a method of the action counts as waiting.')
  .given('A sequential action Parent.')
  .when('A method of Parent returns this.dispatchAndWait(new Child()), and before awaits that method.')
  .then('There is an error in new Child(), without suggestions.'))
  .run(async (ctx: any) => {
    const code = parent('', 'waitChild() { return this.dispatchAndWait(new Child()); }\n  async before() { await this.waitChild(); }');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Child()']);
    expect(result.messages[0].suggestions).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('An action kept in a const is checked too.')
  .given('A sequential action Parent.')
  .when('Parent creates const child = new Child(), and awaits this.dispatchAndWait(child).')
  .then('There is an error in child.'))
  .run(async (ctx: any) => {
    const code = parent('const child = new Child();\n    await this.dispatchAndWait(child);');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['child']);
  });

withTypeInfo(Bdd(feature)
  .scenario('A sequential feature inherited from a superclass counts too.')
  .given('An abstract action with sequential = true.')
  .and('Two subclasses of it, Parent and Kid.')
  .when('Parent awaits this.dispatchAndWait(new Kid()).')
  .then('There is an error in new Kid().'))
  .run(async (ctx: any) => {
    const code = `${prelude}
abstract class SequentialAction extends Action {
  sequential = true;
}

class Kid extends SequentialAction {
  async reduce() { return null; }
}

class Parent extends SequentialAction {
  async reduce() {
    await this.dispatchAndWait(new Kid());
    return null;
  }
}
`;
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['new Kid()']);
    expect(result.typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('With type information, an action declared in another file is checked too.')
  .given('A sequential action Child, declared in another file.')
  .when('A sequential action awaits this.dispatchAndWait(new Child()).')
  .then('There is an error with type information, and none without it.')
  .run(async (_) => {
    const files = {
      'child.ts': `import { KissAction } from 'kiss-for-react';
export class State { constructor(readonly count: number) {} }
export class Child extends KissAction<State> {
  sequential = true;
  async reduce() { return null; }
}
`,
    };
    const code = `import { KissAction } from 'kiss-for-react';
import { Child, State } from './child';

class Parent extends KissAction<State> {
  sequential = true;
  async reduce() {
    await this.dispatchAndWait(new Child());
    return null;
  }
}
`;
    const result = lint(rule, code, {types: true, files});
    expect(result.messages.map((m) => m.text)).toEqual(['new Child()']);
    expect(result.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false, files}).messages).toEqual([]);
  });
