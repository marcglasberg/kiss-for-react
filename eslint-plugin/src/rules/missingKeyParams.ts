import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ClassNode,
  classChain,
  extendsClassNamed,
  findMemberInChain,
  findPropertyInChain,
  indentationOf,
  initializerTextOf,
  instanceTypeOfClass,
  isDeclaredByUser,
  isTrue,
  needsOverrideKeyword,
  unlimitedRetryCheckInternetOfClass,
} from '../actionFeatures.js';
import { createRule, getTypeInfo, memberName, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** Properties of Kiss actions that configure the action. They are not the action's own data. */
const KISS_PROPERTIES = ['retry', 'checkInternet', 'nonReentrant', 'debounce', 'throttle',
  'removeThrottleLockOnError', 'fresh', 'sequential', 'poll', 'pollInterval', 'pollWaitsForRun',
  'unlimitedRetryCheckInternet', 'maxFollowUpRequests'];

/**
 * The kind of key the action uses: the non-reentrant key, or the `OptimisticSync` key (also used
 * by `OptimisticSyncWithPush`).
 */
type KeyKind = 'nonReentrant' | 'optimisticSync';

/** The methods that compute each kind of key. The first one is the one the suggestion overrides. */
const KEY_METHODS: Record<KeyKind, [string, string]> = {
  nonReentrant: ['nonReentrantKeyParams', 'computeNonReentrantKey'],
  optimisticSync: ['optimisticSyncKeyParams', 'computeOptimisticSyncKey'],
};

/**
 * Reports an action with fields, whose key doesn't depend on them:
 *
 * - A non-reentrant action that doesn't override `nonReentrantKeyParams` or
 *   `computeNonReentrantKey`. Non-reentrant actions are the ones with `nonReentrant = true` or
 *   `unlimitedRetryCheckInternet`, and the subclasses of `OptimisticCommand`.
 *
 * - A subclass of `OptimisticSync` or `OptimisticSyncWithPush` that doesn't override
 *   `optimisticSyncKeyParams` or `computeOptimisticSyncKey`.
 *
 * ```ts
 * class SaveTodo extends OptimisticCommand<State> {  // Warning
 *   constructor(readonly todoId: string) { super(); }
 * }
 *
 * class LoadTodo extends Action {  // Warning
 *   nonReentrant = true;
 *   constructor(readonly todoId: string) { super(); }
 * }
 *
 * class ToggleLike extends OptimisticSync<State, boolean> {  // Warning
 *   constructor(readonly itemId: string) { super(); }
 * }
 * ```
 *
 * By default, the key doesn't depend on the fields, so all instances share it. For example,
 * `SaveTodo('A')` then blocks `SaveTodo('B')`. And while `ToggleLike('A')` has a request in
 * flight, `ToggleLike('B')` changes the state but doesn't send its own request. The follow-up
 * request of `ToggleLike('A')` only checks item A, so item B is never sent to the server. This
 * rule is opt-in, since sharing the key is often intended.
 *
 * Suggestion: override `nonReentrantKeyParams()` (or `optimisticSyncKeyParams()`), returning
 * the fields.
 */
export default createRule({
  name: 'missing-key-params',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Recommend `nonReentrantKeyParams` in non-reentrant actions with fields, and ' +
        '`optimisticSyncKeyParams` in `OptimisticSync` and `OptimisticSyncWithPush` actions with fields.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingKeyParams:
        '`{{action}}` has fields, but its non-reentrant key doesn\'t depend on them. So, while one ' +
        '`{{action}}` runs, any other `{{action}}` is aborted, even with different fields. To let them run ' +
        'at the same time, override `nonReentrantKeyParams()`.',
      missingOptimisticSyncKeyParams:
        '`{{action}}` has fields, but its optimistic sync key doesn\'t depend on them. So, while one ' +
        '`{{action}}` has a request in flight, any other `{{action}}` changes the state without sending ' +
        'its own request, even with different fields, and its value may never be sent to the server. ' +
        'To give each one its own key, override `optimisticSyncKeyParams()`.',
      addKeyParams: 'Override `{{method}}()`, returning {{fields}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      if (classNode.abstract || !classNode.superClass) return;
      const kind = keyKindWithoutKey(classNode, context, typeInfo);
      if (kind === null) return;

      const fields = fieldsOf(classNode);
      if (fields.length === 0) return;

      const name = classNode.id?.name ?? 'This action';
      const method = KEY_METHODS[kind][0];
      const values = fields.map((field) => `this.${field.name}`);
      const returned = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
      const override = needsOverrideKeyword(classNode, typeInfo) ? 'override ' : '';
      const after = fields.reduce<TSESTree.Node>((last, field) => field.member.range[1] > last.range[1] ? field.member : last, fields[0].member);

      context.report({
        node: classNode.id ?? classNode.superClass,
        messageId: kind === 'nonReentrant' ? 'missingKeyParams' : 'missingOptimisticSyncKeyParams',
        data: {action: name},
        suggest: [{
          messageId: 'addKeyParams',
          data: {method, fields: values.map((value) => `\`${value}\``).join(', ')},
          fix: (fixer) => fixer.insertTextAfter(after,
            `\n\n${indentationOf(after, context)}${override}${method}() { return ${returned}; }`),
        }],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * The kind of key the action uses, if it doesn't override how that key is computed. Otherwise,
 * or if the action doesn't use a key, `null`.
 *
 * The action uses the `OptimisticSync` key if it extends `OptimisticSync` or
 * `OptimisticSyncWithPush`. It uses the
 * non-reentrant key if it extends `OptimisticCommand`, or it or a superclass sets
 * `nonReentrant = true` or turns on `unlimitedRetryCheckInternet`.
 */
function keyKindWithoutKey(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): KeyKind | null {
  let kind: KeyKind | null;
  let declares: (name: string) => boolean;

  if (typeInfo) {
    const type = instanceTypeOfClass(classNode, typeInfo);
    kind = (extendsClassNamed(type, 'OptimisticSync', typeInfo.checker) ||
      extendsClassNamed(type, 'OptimisticSyncWithPush', typeInfo.checker)) ? 'optimisticSync'
      : (extendsClassNamed(type, 'OptimisticCommand', typeInfo.checker) ||
        (extendsClassNamed(type, 'KissAction', typeInfo.checker) &&
          (initializerTextOf(type, 'nonReentrant')?.trim() === 'true' ||
            unlimitedRetryCheckInternetOfClass(classNode, context, typeInfo)))) ? 'nonReentrant' : null;
    declares = (name) => isDeclaredByUser(type, name);
  } else {
    const chain = classChain(classNode, context);
    const property = findPropertyInChain(chain, 'nonReentrant');
    kind = (chain.end === 'OptimisticSync' || chain.end === 'OptimisticSyncWithPush') ? 'optimisticSync'
      : (chain.end === 'OptimisticCommand' || (chain.end === 'KissAction' &&
        ((!!property && isTrue(property)) || unlimitedRetryCheckInternetOfClass(classNode, context, null)))) ? 'nonReentrant' : null;
    declares = (name) => !!findMemberInChain(chain, name);
  }

  if (kind === null || KEY_METHODS[kind].some(declares)) return null;
  return kind;
}

/**
 * The class's own fields: its constructor's parameter properties (like `readonly todoId: string`),
 * and its properties that are not functions or Kiss's configuration (like `retry`).
 * `member` is the node to insert the new method after (the constructor, or the property).
 */
function fieldsOf(classNode: ClassNode): { name: string, member: TSESTree.Node }[] {
  const fields: { name: string, member: TSESTree.Node }[] = [];
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor') {
      for (const param of member.value.params) {
        if (param.type !== AST_NODE_TYPES.TSParameterProperty) continue;
        const target = param.parameter.type === AST_NODE_TYPES.AssignmentPattern ? param.parameter.left : param.parameter;
        if (target.type === AST_NODE_TYPES.Identifier) fields.push({name: target.name, member});
      }
    }
    if (member.type === AST_NODE_TYPES.PropertyDefinition && !member.static) {
      const value = member.value;
      if (value && (value.type === AST_NODE_TYPES.ArrowFunctionExpression || value.type === AST_NODE_TYPES.FunctionExpression)) continue;
      const name = member.key.type === AST_NODE_TYPES.PrivateIdentifier ? `#${member.key.name}` : memberName(member);
      if (name && !KISS_PROPERTIES.includes(name) && !name.startsWith('_')) fields.push({name, member});
    }
  }
  return fields;
}
