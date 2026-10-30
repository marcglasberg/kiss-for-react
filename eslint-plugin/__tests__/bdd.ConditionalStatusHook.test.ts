import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';
import rule from '../src/rules/conditionalStatusHook';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: conditional-status-hook');

const imports = `import { KissAction, Store, useExceptionFor, useIsFailed, useIsWaiting } from 'kiss-for-react';`;

const declarations = `
class State {
  constructor(readonly count: number) {}
}

declare function load(): Promise<number>;

declare const store: Store<State>;

abstract class Load extends KissAction<State> {
  async reduce() {
    const n = await load();
    return (state: State) => new State(state.count + n);
  }
}

class LoadUser extends Load {}

class LoadPosts extends Load {}

class LoadComments extends Load {}
`;

/** A component with the given lines, that returns `value`. */
function component(lines: string, head = imports): string {
  return `${head}
${declarations}
export function Screen({ id, isReady }: { id: string, isReady: boolean }) {
  ${lines}
  return String(value);
}
`;
}

Bdd(feature)
  .scenario('Two status hooks joined by an operator that means "any of them" are an error, fixed with an array.')
  .given('A component with {Code}.')
  .when('The code is linted.')
  .then('There is an error in the expression, saying the second hook is not called in every render.')
  .and('The fix replaces it with {Fixed}, which gives the same result.')
  .and('The fixed code compiles.')
  .example(val('Code', 'useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)'), val('Fixed', 'useIsWaiting([LoadUser, LoadPosts])'), val('Type information', true))
  .example(val('Code', 'useIsWaiting(LoadUser) || useIsWaiting(LoadPosts)'), val('Fixed', 'useIsWaiting([LoadUser, LoadPosts])'), val('Type information', false))
  .example(val('Code', 'useIsFailed(LoadUser) || useIsFailed(LoadPosts)'), val('Fixed', 'useIsFailed([LoadUser, LoadPosts])'), val('Type information', true))
  .example(val('Code', 'useIsFailed(LoadUser) || useIsFailed(LoadPosts)'), val('Fixed', 'useIsFailed([LoadUser, LoadPosts])'), val('Type information', false))
  .example(val('Code', 'useExceptionFor(LoadUser) ?? useExceptionFor(LoadPosts)'), val('Fixed', 'useExceptionFor([LoadUser, LoadPosts])'), val('Type information', true))
  .example(val('Code', 'useExceptionFor(LoadUser) ?? useExceptionFor(LoadPosts)'), val('Fixed', 'useExceptionFor([LoadUser, LoadPosts])'), val('Type information', false))
  .example(val('Code', 'useExceptionFor(LoadUser) || useExceptionFor(LoadPosts)'), val('Fixed', 'useExceptionFor([LoadUser, LoadPosts])'), val('Type information', true))
  .run(async (ctx) => {
    const codeText = ctx.example.val('Code') as string;
    const fixedText = ctx.example.val('Fixed') as string;
    const code = component(`const value = ${codeText};`);
    const result = lint(rule, code, {types: ctx.example.val('Type information') as boolean});

    expect(result.messages.map((m) => m.text)).toEqual([codeText]);
    expect(result.messages[0].messageId).toBe('useArray');
    expect(result.messages[0].message).toContain('is not called in every render');
    expect(result.messages[0].message).toContain(`Pass all the action types in one array: \`${fixedText}\``);
    expect(result.fixed).toBe(component(`const value = ${fixedText};`));
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('The fix puts all the action types in one array, in the same order.')
  .given('A component with {Code}.')
  .when('The code is linted and fixed.')
  .then('There is one error, and the fix replaces the expression with {Fixed}.')
  .and('The fixed code compiles.')
  .example(
    val('Code', 'useIsWaiting(LoadUser) || useIsWaiting(LoadPosts) || useIsWaiting(LoadComments)'),
    val('Fixed', 'useIsWaiting([LoadUser, LoadPosts, LoadComments])'))
  .example(
    val('Code', 'useIsWaiting([LoadUser, LoadPosts]) || useIsWaiting(LoadComments)'),
    val('Fixed', 'useIsWaiting([LoadUser, LoadPosts, LoadComments])'))
  .example(
    val('Code', 'useIsWaiting(LoadUser) || (useIsWaiting(LoadPosts) || useIsWaiting(LoadComments))'),
    val('Fixed', 'useIsWaiting([LoadUser, LoadPosts, LoadComments])'))
  .example(
    val('Code', 'useIsWaiting(LoadUser, { statusKey: id }) || useIsWaiting(LoadPosts, { statusKey: id })'),
    val('Fixed', 'useIsWaiting([LoadUser, LoadPosts], { statusKey: id })'))
  .run(async (ctx) => {
    const code = component(`const value = ${ctx.example.val('Code')};`);
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].messageId).toBe('useArray');
    expect(result.fixed).toBe(component(`const value = ${ctx.example.val('Fixed')};`));
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('An array in a variable is spread into the new array, only when its type is known.')
  .given('A component with useIsWaiting(types) || useIsWaiting(LoadComments), where types is an array of action types.')
  .when('The code is linted.')
  .then('With type information, the fix spreads the variable: useIsWaiting([...types, LoadComments]).')
  .and('Without type information, there is an error, but no fix, since types may not be an array.')
  .example(val('Type information', true))
  .example(val('Type information', false))
  .run(async (ctx) => {
    const types = ctx.example.val('Type information') as boolean;
    const code = component(`const types = [LoadUser, LoadPosts];
  const value = useIsWaiting(types) || useIsWaiting(LoadComments);`);
    const result = lint(rule, code, {types});
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].messageId).toBe('useArray');
    if (types) {
      expect(result.fixed).toContain('const value = useIsWaiting([...types, LoadComments]);');
      expect(lint(rule, result.fixed).typeErrors).toEqual([]);
    } else {
      expect(result.messages[0].message).toContain('`useIsWaiting([...])`');
      expect(result.fixed).toBe(code);
    }
  });

Bdd(feature)
  .scenario('A status hook called conditionally is an error, with no fix, when an array does not give the same result.')
  .given('A component with {Code}.')
  .when('The code is linted.')
  .then('There is an error in {Reported}, saying to call each hook in its own line.')
  .and('There is no fix.')
  .example(val('Code', 'useIsWaiting(LoadUser) && useIsWaiting(LoadPosts)'), val('Reported', 'useIsWaiting'))
  .example(val('Code', 'useIsWaiting(LoadUser) ?? useIsWaiting(LoadPosts)'), val('Reported', 'useIsWaiting'))
  .example(val('Code', 'useIsWaiting(LoadUser) || useIsFailed(LoadUser)'), val('Reported', 'useIsFailed'))
  .example(val('Code', 'useIsWaiting(LoadUser, { statusKey: id }) || useIsWaiting(LoadPosts)'), val('Reported', 'useIsWaiting'))
  .example(val('Code', 'isReady && useIsWaiting(LoadUser)'), val('Reported', 'useIsWaiting'))
  .example(val('Code', 'isReady ? useIsWaiting(LoadUser) : false'), val('Reported', 'useIsWaiting'))
  .example(val('Code', 'isReady ? null : useExceptionFor(LoadUser)'), val('Reported', 'useExceptionFor'))
  .run(async (ctx) => {
    const code = component(`const value = ${ctx.example.val('Code')};`);
    const result = lint(rule, code);
    expect(result.messages.map((m) => m.text)).toEqual([ctx.example.val('Reported')]);
    expect(result.messages[0].messageId).toBe('conditional');
    expect(result.messages[0].message).toContain('Call each hook in its own line');
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('There is no fix when the expression has comments.')
  .given('A component with useIsWaiting(LoadUser) || /* posts */ useIsWaiting(LoadPosts).')
  .when('The code is linted.')
  .then('There is an error, but no fix, since the fix would delete the comment.')
  .run(async (_) => {
    const code = component('const value = useIsWaiting(LoadUser) || /* posts */ useIsWaiting(LoadPosts);');
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.messages[0].message).toContain('`useIsWaiting([LoadUser, LoadPosts])`');
    expect(result.fixed).toBe(code);
  });

Bdd(feature)
  .scenario('Status hooks imported as a namespace are reported and fixed too.')
  .given('A component with kiss.useIsWaiting(LoadUser) || kiss.useIsWaiting(LoadPosts), where kiss is the Kiss namespace.')
  .when('The code is linted and fixed.')
  .then('The fix replaces it with kiss.useIsWaiting([LoadUser, LoadPosts]).')
  .run(async (_) => {
    const head = `import * as kiss from 'kiss-for-react';\nimport { KissAction, Store } from 'kiss-for-react';`;
    const code = component('const value = kiss.useIsWaiting(LoadUser) || kiss.useIsWaiting(LoadPosts);', head);
    const result = lint(rule, code);
    expect(result.messages.length).toBe(1);
    expect(result.fixed).toBe(component('const value = kiss.useIsWaiting([LoadUser, LoadPosts]);', head));
    expect(lint(rule, result.fixed).typeErrors).toEqual([]);
  });

Bdd(feature)
  .scenario('Status hooks called in every render are not reported.')
  .given('A component where {Case}.')
  .when('The code is linted.')
  .then('There are no errors.')
  .example(val('Case', 'each hook is called in its own line, and the results are combined'),
    val('Code', 'const a = useIsWaiting(LoadUser); const b = useIsWaiting(LoadPosts); const value = a || b;'))
  .example(val('Case', 'the hook is only on the left of the operator'),
    val('Code', 'const value = useIsWaiting(LoadUser) || isReady;'))
  .example(val('Case', 'the hook gets an array'),
    val('Code', 'const value = useIsWaiting([LoadUser, LoadPosts]);'))
  .example(val('Case', 'the store methods are joined, which are not hooks'),
    val('Code', 'const value = store.isWaiting(LoadUser) || store.isWaiting(LoadPosts);'))
  .example(val('Case', 'the hook is the condition of a ternary'),
    val('Code', 'const value = useIsWaiting(LoadUser) ? 1 : 2;'))
  .run(async (ctx) => {
    const code = component(ctx.example.val('Code') as string);
    expect(lint(rule, code).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('A useIsWaiting that does not come from Kiss is not reported.')
  .given('A component that joins two calls of a useIsWaiting from another library.')
  .when('The code is linted.')
  .then('There are no errors.')
  .run(async (_) => {
    const head = `import { KissAction, Store } from 'kiss-for-react';\ndeclare function useIsWaiting(type: unknown): boolean;`;
    const code = component('const value = useIsWaiting(LoadUser) || useIsWaiting(LoadPosts);', head);
    expect(lint(rule, code).messages).toEqual([]);
  });
