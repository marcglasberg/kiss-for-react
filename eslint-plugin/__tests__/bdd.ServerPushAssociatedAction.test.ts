import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { lint } from '../testing/lint';

reporter(new FeatureFileReporter());

const feature = new Feature('Lint: server-push-associated-action');

const rule = 'server-push-associated-action';

const prelude = `import { OptimisticSyncWithPush, PushMetadata, ServerPush } from 'kiss-for-react';

class State {
  constructor(readonly liked: boolean, readonly revision: number) {}
}

declare function sendLike(itemId: string, liked: boolean): Promise<boolean>;
`;

/** An `OptimisticSyncWithPush` class with the given name, modifiers and members. */
function toggle(name: string, members = '', modifiers = '', superclass = 'OptimisticSyncWithPush<State, boolean>'): string {
  return `
${modifiers}class ${name} extends ${superclass} {
  constructor(readonly itemId: string, readonly liked: boolean) { super(); }
  ${members}
  valueToApply() { return this.liked; }
  applyOptimisticValueToState(state: State, liked: boolean) { return new State(liked, state.revision); }
  getValueFromState(state: State) { return state.liked; }
  async sendValueToServer(liked: boolean) { return sendLike(this.itemId, liked); }
  getServerRevisionFromState(state: State) { return state.revision; }
}
`;
}

/** A `ServerPush` class with the given name, members and associated action. */
function push(name: string, associated: string | null, members = '', modifiers = '', superclass = 'ServerPush<State>'): string {
  return `
${modifiers}class ${name} extends ${superclass} {
  constructor(readonly itemId: string, readonly liked: boolean, readonly metadata: PushMetadata) { super(); }
  ${associated === null ? '' : `associatedAction() { return ${associated}; }`}
  ${members}
  pushMetadata() { return this.metadata; }
  applyServerPushToState(state: State, _key: any, serverRevision: number) { return new State(this.liked, serverRevision); }
  getServerRevisionFromState(state: State) { return state.revision; }
}
`;
}

const KEY_PARAMS = 'optimisticSyncKeyParams() { return this.itemId; }';
const COMPUTE_KEY = 'computeOptimisticSyncKey() { return [\'likes\', this.itemId]; }';

/** Adds the examples, each one with and without type information (or just that, without examples). */
const withTypeInfo = (builder: any, examples: any[][] = [[]]) => examples.reduce((b, example) =>
  b.example(...example, val('Type information', true)).example(...example, val('Type information', false)), builder);

withTypeInfo(Bdd(feature)
  .scenario('A push whose key matches the key of its associated action is fine.')
  .given('An OptimisticSyncWithPush action ToggleLike, with {Members}.')
  .and('A ServerPush whose associatedAction() returns ToggleLike, with {Members}.')
  .when('The code is linted.')
  .then('There is no error.'), [
  [val('Members', 'no key methods'), val('Code', '')],
  [val('Members', 'optimisticSyncKeyParams'), val('Code', KEY_PARAMS)],
  [val('Members', 'computeOptimisticSyncKey'), val('Code', COMPUTE_KEY)],
])
  .run(async (ctx: any) => {
    const members = ctx.example.val('Code');
    const code = prelude + toggle('ToggleLike', members) + push('PushLike', 'ToggleLike', members);
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages).toEqual([]);
    expect(result.typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('Only one of them overriding optimisticSyncKeyParams() is an error.')
  .given('An OptimisticSyncWithPush action ToggleLike, {Toggle has} optimisticSyncKeyParams().')
  .and('A ServerPush whose associatedAction() returns ToggleLike, {Push has} optimisticSyncKeyParams().')
  .when('The code is linted.')
  .then('There is an error in the ToggleLike returned by associatedAction(), saying {Message}.'), [
  [val('Toggle has', 'with'), val('Push has', 'without'),
    val('Message', '`ToggleLike` overrides `optimisticSyncKeyParams()`, but this push doesn\'t, so the key of this push never matches it. Override `optimisticSyncKeyParams()` here too, returning the same params.')],
  [val('Toggle has', 'without'), val('Push has', 'with'),
    val('Message', 'This push overrides `optimisticSyncKeyParams()`, but `ToggleLike` doesn\'t, so the key of this push never matches it. Both must return the same params.')],
])
  .run(async (ctx: any) => {
    const toggleMembers = ctx.example.val('Toggle has') === 'with' ? KEY_PARAMS : '';
    const pushMembers = ctx.example.val('Push has') === 'with' ? KEY_PARAMS : '';
    const code = prelude + toggle('ToggleLike', toggleMembers) + push('PushLike', 'ToggleLike', pushMembers);
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['ToggleLike']);
    expect(result.messages[0].line).toBe(code.split('\n').findIndex((line) => line.includes('associatedAction()')) + 1);
    expect(result.messages[0].message).toBe(ctx.example.val('Message'));
    expect(result.typeErrors).toEqual([]);
  });

withTypeInfo(Bdd(feature)
  .scenario('An associated action that overrides computeOptimisticSyncKey(), when the push doesn\'t, is an error.')
  .given('An OptimisticSyncWithPush action ToggleLike, with computeOptimisticSyncKey().')
  .and('A ServerPush whose associatedAction() returns ToggleLike, without computeOptimisticSyncKey().')
  .when('The code is linted.')
  .then('There is an error in ToggleLike, saying to override computeOptimisticSyncKey() in the push too.'))
  .run(async (ctx: any) => {
    const code = prelude + toggle('ToggleLike', COMPUTE_KEY) + push('PushLike', 'ToggleLike', KEY_PARAMS);
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.messages.map((m) => m.text)).toEqual(['ToggleLike']);
    expect(result.messages[0].message).toBe(
      '`ToggleLike` overrides `computeOptimisticSyncKey()`, but this push doesn\'t, so the key of this push ' +
      'never matches it. Override `computeOptimisticSyncKey()` here too, to compute the same key.');
  });

withTypeInfo(Bdd(feature)
  .scenario('An associated action that is abstract is an error, unless the push overrides computeOptimisticSyncKey().')
  .given('An abstract OptimisticSyncWithPush action LikeBase, and its subclass ToggleLike.')
  .and('A ServerPush whose associatedAction() returns LikeBase, {Push has} computeOptimisticSyncKey().')
  .when('The code is linted.')
  .then('There {Result}.'), [
  [val('Push has', 'without'), val('Result', 'is an error in LikeBase, saying it is abstract')],
  [val('Push has', 'with'), val('Result', 'is no error')],
])
  .run(async (ctx: any) => {
    const withComputeKey = ctx.example.val('Push has') === 'with';
    const code = prelude +
      toggle('LikeBase', '', 'abstract ') +
      `\nclass ToggleLike extends LikeBase {}\n` +
      push('PushLike', 'LikeBase', withComputeKey ? COMPUTE_KEY : '');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.typeErrors).toEqual([]);
    if (withComputeKey) {
      expect(result.messages).toEqual([]);
    } else {
      expect(result.messages.map((m) => m.text)).toEqual(['LikeBase']);
      expect(result.messages[0].message).toBe(
        '`LikeBase` is abstract, so the actions dispatched are of its subclasses, and their keys use their ' +
        'own class. The key of this push never matches them. Return the class of the action that is dispatched.');
    }
  });

withTypeInfo(Bdd(feature)
  .scenario('Key methods inherited from superclasses count too.')
  .given('An abstract OptimisticSyncWithPush action with optimisticSyncKeyParams(), and its subclass ToggleLike.')
  .and('An abstract ServerPush that returns ToggleLike from associatedAction(), and its subclass PushLike {Push has} optimisticSyncKeyParams().')
  .when('The code is linted.')
  .then('There {Result}.'), [
  [val('Push has', 'with'), val('Result', 'is no error')],
  [val('Push has', 'without'), val('Result', 'is an error in the name of PushLike')],
])
  .run(async (ctx: any) => {
    const withKeyParams = ctx.example.val('Push has') === 'with';
    const code = prelude +
      toggle('ItemToggle', KEY_PARAMS, 'abstract ') +
      `\nclass ToggleLike extends ItemToggle {}\n` +
      `\nabstract class LikePush extends ServerPush<State> {\n  associatedAction() { return ToggleLike; }\n}\n` +
      push('PushLike', null, withKeyParams ? KEY_PARAMS : '', '', 'LikePush');
    const result = lint(rule, code, {types: ctx.example.val('Type information')});
    expect(result.typeErrors).toEqual([]);
    expect(result.messages.map((m) => m.text)).toEqual(withKeyParams ? [] : ['PushLike']);
  });

Bdd(feature)
  .scenario('With type information, an associated action declared in another file is checked too.')
  .given('An OptimisticSyncWithPush action ToggleLike with optimisticSyncKeyParams(), declared in another file.')
  .and('A ServerPush whose associatedAction() returns ToggleLike, without optimisticSyncKeyParams().')
  .when('The code is linted.')
  .then('There is an error with type information, and none without it.')
  .run(async (_) => {
    const files = {'toggle.ts': prelude + 'export ' + toggle('ToggleLike', KEY_PARAMS).trimStart() + '\nexport { State };\n'};
    const code = `import { PushMetadata, ServerPush } from 'kiss-for-react';
import { State, ToggleLike } from './toggle';
` + push('PushLike', 'ToggleLike');
    const result = lint(rule, code, {types: true, files});
    expect(result.messages.map((m) => m.text)).toEqual(['ToggleLike']);
    expect(result.typeErrors).toEqual([]);
    expect(lint(rule, code, {types: false, files}).messages).toEqual([]);
  });

Bdd(feature)
  .scenario('An associated action that is not an OptimisticSyncWithPush is left to TypeScript.')
  .given('A ServerPush whose associatedAction() returns the push class itself.')
  .when('The code is linted, with type information.')
  .then('TypeScript reports an error, and the rule reports nothing.')
  .run(async (_) => {
    const code = prelude + push('PushLike', 'PushLike');
    const result = lint(rule, code, {types: true});
    expect(result.typeErrors).not.toEqual([]);
    expect(result.messages).toEqual([]);
  });
