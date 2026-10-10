import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import {
  ClassNode,
  classChain,
  extendsClassNamed,
  findMemberInChain,
  instanceTypeOfClass,
  isUnlimitedRetryCheckInternetOn,
  removeMember,
  retryOf,
  userDeclarations,
} from '../actionFeatures.js';
import { createRule, getTypeInfo, isKissActionClass, memberName, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** The action features that are set with a property. */
export type PropertyFeature = 'nonReentrant' | 'retry' | 'checkInternet' | 'debounce' | 'throttle' | 'fresh' |
  'sequential' | 'poll' | 'unlimitedRetryCheckInternet';

const PROPERTY_FEATURES: PropertyFeature[] = ['nonReentrant', 'retry', 'checkInternet', 'debounce', 'throttle',
  'fresh', 'sequential', 'poll', 'unlimitedRetryCheckInternet'];

/**
 * The pairs of features that can't be combined in the same action (dispatching it throws a
 * `StoreException`), and why, when it helps. They are the same checks the store does when the
 * action is dispatched.
 */
const INCOMPATIBLE: [PropertyFeature, PropertyFeature, string?][] = [
  ['debounce', 'retry'],
  ['throttle', 'nonReentrant'],
  ['fresh', 'nonReentrant'],
  ['fresh', 'throttle'],
  ['sequential', 'debounce', 'The debounce period would only start when the action gets its turn in the queue.'],
  ['poll', 'retry', 'Add `retry` to the action returned by `createPollingAction()` instead.'],
  ['poll', 'debounce'],
  ['unlimitedRetryCheckInternet', 'retry', '`unlimitedRetryCheckInternet` already retries.'],
  ['unlimitedRetryCheckInternet', 'checkInternet', '`unlimitedRetryCheckInternet` already checks the internet.'],
  ['unlimitedRetryCheckInternet', 'nonReentrant', '`unlimitedRetryCheckInternet` is already non-reentrant.'],
  ['unlimitedRetryCheckInternet', 'debounce'],
  ['unlimitedRetryCheckInternet', 'throttle'],
  ['unlimitedRetryCheckInternet', 'fresh'],
  ['unlimitedRetryCheckInternet', 'sequential',
    'Two actions with the same key would never queue behind each other, and it would retry forever ' +
    'while holding the queue.'],
  ['unlimitedRetryCheckInternet', 'poll',
    'Add `unlimitedRetryCheckInternet` to the action returned by `createPollingAction()` instead.'],
];

/** The features an `OptimisticCommand` can't use, and why, when it helps. */
const INCOMPATIBLE_WITH_COMMAND: [PropertyFeature, string?][] = [
  ['nonReentrant', 'It\'s already non-reentrant.'],
  ['debounce'],
  ['throttle'],
  ['fresh'],
  ['poll'],
  ['unlimitedRetryCheckInternet'],
];

/** The features an `OptimisticSync` can't use, and why, when it helps. It can only use `checkInternet`. */
const INCOMPATIBLE_WITH_SYNC: [PropertyFeature, string?][] = [
  ['nonReentrant', 'Dispatches made while a request is in flight must apply their value, not be aborted.'],
  ['retry'],
  ['debounce'],
  ['throttle'],
  ['fresh'],
  ['sequential',
    'Dispatches must overlap, so that it applies the value right away, and coalesces the dispatches made ' +
    'while a request is in flight. It already sends a single request per key at a time.'],
  ['poll'],
  ['unlimitedRetryCheckInternet'],
];

/** The features a `ServerPush` can't use: all of them, since it should be used alone. */
const INCOMPATIBLE_WITH_SERVER_PUSH: [PropertyFeature, string?][] = [
  ['checkInternet', 'Pushed values must be applied as soon as they arrive.'],
  ['nonReentrant'],
  ['retry'],
  ['debounce'],
  ['throttle'],
  ['fresh'],
  ['sequential',
    'Pushed values must be applied as soon as they arrive, and they tell the in-flight ' +
    '`OptimisticSyncWithPush` requests that no follow-up is needed.'],
  ['poll'],
  ['unlimitedRetryCheckInternet'],
];

/** How a feature is set in the action: if it's on, and its declaration in the class itself, if any. */
export interface FeatureState {
  on: boolean;
  /** The property (or constructor parameter property) in the class itself. */
  own: TSESTree.PropertyDefinition | TSESTree.TSParameterProperty | null;
  /** The text of its value, if any. */
  text: string | null;
}

/**
 * Reports action features that can't be combined in the same action, since dispatching the
 * action then throws a `StoreException`:
 *
 * ```ts
 * class LoadText extends Action {
 *   throttle = 1000;
 *   nonReentrant = true;  // Error
 *   async reduce() { ... }
 * }
 *
 * class SaveText extends OptimisticCommand<State, string> {
 *   nonReentrant = true;  // Error (an `OptimisticCommand` is already non-reentrant)
 *   ...
 * }
 *
 * class ToggleLike extends OptimisticSync<State, boolean> {
 *   retry = { on: true };  // Error (an `OptimisticSync` can only use `checkInternet`)
 *   ...
 * }
 *
 * class PushLike extends ServerPush<State> {
 *   checkInternet = { dialog: false };  // Error (a `ServerPush` can't use any feature)
 *   ...
 * }
 * ```
 *
 * The features are `nonReentrant`, `retry`, `checkInternet`, `debounce`, `throttle`, `fresh`,
 * `sequential`, polling (`poll`), `unlimitedRetryCheckInternet`, `OptimisticCommand`,
 * `OptimisticSync`, `OptimisticSyncWithPush` (which can use the same features as an
 * `OptimisticSync`) and `ServerPush`. It also reports an `OptimisticCommand` that retries forever
 * (`retry = { maxRetries: -1 }` or `retry = { unlimitedRetries: true }`).
 *
 * Features inherited from superclasses count too (in this file, or anywhere with type
 * information), but the problem is only reported in the class that declares at least one of the
 * two features, in the declaration (the last one, if both are declared in the class).
 *
 * Suggestions: remove one of the features (the ones declared in the class).
 */
export default createRule({
  name: 'incompatible-action-features',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow action features that can\'t be combined in the same action.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      incompatible:
        '`{{first}}` and `{{second}}` can\'t be combined in the same action. Dispatching it throws a ' +
        '`StoreException`.{{reason}}',
      incompatibleWithCommand:
        'An `OptimisticCommand` can\'t use `{{feature}}`. Dispatching it throws a `StoreException`.{{reason}}',
      incompatibleWithSync:
        'An `{{className}}` can\'t use `{{feature}}`. Dispatching it throws a `StoreException`.{{reason}}',
      incompatibleWithServerPush:
        'A `ServerPush` can\'t use `{{feature}}`, since it should be used alone. Dispatching it throws a ' +
        '`StoreException`.{{reason}}',
      commandRetriesForever:
        'An `OptimisticCommand` can\'t retry forever (`{{option}}`), since a command that never finishes ' +
        'would never release its non-reentrant key. Dispatching it throws a `StoreException`. Use a ' +
        '`retry.maxRetries` of 0 or more.',
      remove: 'Remove `{{property}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      // Quick check: the class itself must declare some feature, or there's nothing to report.
      if (!PROPERTY_FEATURES.some((name) => ownDeclaration(classNode, name))) return;
      if (!isAction(classNode, context, typeInfo)) return;

      const features = new Map(PROPERTY_FEATURES.map((name) => [name, featureState(name, classNode, context, typeInfo)]));
      const isCommand = isOptimisticCommand(classNode, context, typeInfo);

      const suggestionsFor = (declarations: (TSESTree.PropertyDefinition | TSESTree.TSParameterProperty)[], names: string[]) =>
        declarations.flatMap((declaration, index) => declaration.type === AST_NODE_TYPES.PropertyDefinition ? [{
          messageId: 'remove' as const,
          data: {property: names[index]},
          fix: (fixer: TSESLint.RuleFixer) => removeMember(fixer, declaration, context),
        }] : []);

      const reasonText = (reason?: string) => reason ? ` ${reason}` : '';

      for (const [first, second, reason] of INCOMPATIBLE) {
        const a = features.get(first)!;
        const b = features.get(second)!;
        if (!a.on || !b.on || (!a.own && !b.own)) continue;
        const own = [a.own, b.own].filter((d): d is NonNullable<typeof d> => d !== null);
        const names = [a.own ? first : null, b.own ? second : null].filter((n): n is PropertyFeature => n !== null);
        const node = own.reduce((last, d) => d.range[0] > last.range[0] ? d : last);
        context.report({
          node: keyOf(node),
          messageId: 'incompatible',
          data: {first, second, reason: reasonText(reason)},
          suggest: suggestionsFor(own, names),
        });
      }

      const syncClass = optimisticSyncClass(classNode, context, typeInfo);
      if (syncClass !== null) {
        for (const [feature, reason] of INCOMPATIBLE_WITH_SYNC) {
          const state = features.get(feature)!;
          if (!state.on || !state.own) continue;
          context.report({
            node: keyOf(state.own),
            messageId: 'incompatibleWithSync',
            data: {className: syncClass, feature, reason: reasonText(reason)},
            suggest: suggestionsFor([state.own], [feature]),
          });
        }
      }

      if (isServerPush(classNode, context, typeInfo)) {
        for (const [feature, reason] of INCOMPATIBLE_WITH_SERVER_PUSH) {
          const state = features.get(feature)!;
          if (!state.on || !state.own) continue;
          context.report({
            node: keyOf(state.own),
            messageId: 'incompatibleWithServerPush',
            data: {feature, reason: reasonText(reason)},
            suggest: suggestionsFor([state.own], [feature]),
          });
        }
      }

      if (!isCommand) return;

      for (const [feature, reason] of INCOMPATIBLE_WITH_COMMAND) {
        const state = features.get(feature)!;
        if (!state.on || !state.own) continue;
        context.report({
          node: keyOf(state.own),
          messageId: 'incompatibleWithCommand',
          data: {feature, reason: reasonText(reason)},
          suggest: suggestionsFor([state.own], [feature]),
        });
      }

      const retry = features.get('retry')!;
      const option = retry.on && retry.own && retry.text !== null ? retryOf(retry.text).unlimited : null;
      if (option && retry.own) {
        context.report({
          node: keyOf(retry.own),
          messageId: 'commandRetriesForever',
          data: {option},
          suggest: suggestionsFor([retry.own], ['retry']),
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** The node to report: the property's key, or the parameter's name. */
export function keyOf(declaration: TSESTree.PropertyDefinition | TSESTree.TSParameterProperty): TSESTree.Node {
  if (declaration.type === AST_NODE_TYPES.PropertyDefinition) return declaration.key;
  const parameter = declaration.parameter;
  return parameter.type === AST_NODE_TYPES.AssignmentPattern ? parameter.left : parameter;
}

/**
 * The declaration of the feature in the class itself: a property (not `declare`), or a parameter
 * property of the constructor, like `constructor(readonly poll = Poll.once)`.
 */
function ownDeclaration(classNode: ClassNode, name: string): TSESTree.PropertyDefinition | TSESTree.TSParameterProperty | null {
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.PropertyDefinition && !member.static && !member.declare &&
      memberName(member) === name) return member;
    if (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor') {
      for (const param of member.value.params) {
        if (param.type !== AST_NODE_TYPES.TSParameterProperty) continue;
        const target = param.parameter.type === AST_NODE_TYPES.AssignmentPattern ? param.parameter.left : param.parameter;
        if (target.type === AST_NODE_TYPES.Identifier && target.name === name) return param;
      }
    }
  }
  return null;
}

/** The value of a declaration: the property's initializer, or the parameter's default value. */
function valueOf(declaration: TSESTree.PropertyDefinition | TSESTree.TSParameterProperty): TSESTree.Expression | null {
  if (declaration.type === AST_NODE_TYPES.PropertyDefinition) return declaration.value;
  return declaration.parameter.type === AST_NODE_TYPES.AssignmentPattern ? declaration.parameter.right : null;
}

/**
 * If the feature is on, from the text of its value. A `poll` parameter property without a default
 * value is on, since the action then always has a `poll`. Other features without a value are off.
 */
function isOn(name: PropertyFeature, text: string | null, isParameter: boolean): boolean {
  if (text === null) return name === 'poll' && isParameter;
  const value = text.trim();
  switch (name) {
    case 'nonReentrant':
    case 'sequential':
      return value === 'true';
    case 'retry':
      return retryOf(value).on;
    case 'unlimitedRetryCheckInternet':
      return isUnlimitedRetryCheckInternetOn(value);
    case 'poll':
      return value !== 'undefined';
    default:
      return !['false', 'null', 'undefined'].includes(value);
  }
}

/**
 * How the feature is set in the action: by the class itself, or inherited from its superclasses
 * (in this file, or anywhere with type information).
 */
export function featureState(name: PropertyFeature, classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): FeatureState {
  const own = ownDeclaration(classNode, name);
  if (own) {
    const value = valueOf(own);
    const text = value ? context.sourceCode.getText(value) : null;
    return {on: isOn(name, text, own.type === AST_NODE_TYPES.TSParameterProperty), own, text};
  }

  if (typeInfo) {
    const declaration = userDeclarations(instanceTypeOfClass(classNode, typeInfo), name)[0];
    if (!declaration) return {on: false, own: null, text: null};
    const initializer = (declaration as ts.PropertyDeclaration | ts.ParameterDeclaration).initializer;
    const text = initializer ? initializer.getText(declaration.getSourceFile()) : null;
    const isParameter = !!(declaration.parent as { parameters?: readonly ts.Node[] }).parameters?.includes(declaration);
    return {on: isOn(name, text, isParameter), own: null, text};
  }

  for (const superclass of classChain(classNode, context).classes.slice(1)) {
    const declaration = ownDeclaration(superclass, name);
    if (!declaration) continue;
    const value = valueOf(declaration);
    const text = value ? context.sourceCode.getText(value) : null;
    return {on: isOn(name, text, declaration.type === AST_NODE_TYPES.TSParameterProperty), own: null, text};
  }
  return {on: false, own: null, text: null};
}

/**
 * True if the class is an action: it extends `KissAction` (with type information), or, without
 * it, its superclasses in this file reach one of Kiss's action classes, or it (or one of them)
 * declares `reduce` or the methods of an `OptimisticCommand`, an `OptimisticSync`, an
 * `OptimisticSyncWithPush` or a `ServerPush`.
 */
export function isAction(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (!classNode.superClass) return false;
  if (typeInfo) return isKissActionClass(classNode, typeInfo);
  const chain = classChain(classNode, context);
  return chain.end !== null || !!findMemberInChain(chain, 'reduce') ||
    !!findMemberInChain(chain, 'sendCommandToServer') || !!findMemberInChain(chain, 'optimisticValue') ||
    !!findMemberInChain(chain, 'sendValueToServer') || !!findMemberInChain(chain, 'valueToApply') ||
    !!findMemberInChain(chain, 'applyServerPushToState') || !!findMemberInChain(chain, 'pushMetadata');
}

/**
 * If the class is an `OptimisticSync` or an `OptimisticSyncWithPush`, returns which one.
 * Otherwise, returns null. Without type information, its superclasses in this file must reach
 * one of them, or declare their methods (an `OptimisticSyncWithPush` also declares
 * `getServerRevisionFromState`).
 */
function optimisticSyncClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null):
  'OptimisticSync' | 'OptimisticSyncWithPush' | null {
  if (typeInfo) {
    const type = instanceTypeOfClass(classNode, typeInfo);
    if (extendsClassNamed(type, 'OptimisticSyncWithPush', typeInfo.checker)) return 'OptimisticSyncWithPush';
    if (extendsClassNamed(type, 'OptimisticSync', typeInfo.checker)) return 'OptimisticSync';
    return null;
  }
  const chain = classChain(classNode, context);
  if (chain.end === 'OptimisticSyncWithPush') return 'OptimisticSyncWithPush';
  if (chain.end === 'OptimisticSync') return 'OptimisticSync';
  if (chain.end !== null) return null;
  if (!findMemberInChain(chain, 'sendValueToServer') && !findMemberInChain(chain, 'valueToApply')) return null;
  return findMemberInChain(chain, 'getServerRevisionFromState') ? 'OptimisticSyncWithPush' : 'OptimisticSync';
}

/**
 * True if the class is a `ServerPush`. Without type information, its superclasses in this file
 * must reach `ServerPush`, or declare its methods.
 */
function isServerPush(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) return extendsClassNamed(instanceTypeOfClass(classNode, typeInfo), 'ServerPush', typeInfo.checker);
  const chain = classChain(classNode, context);
  return chain.end === 'ServerPush' || (chain.end === null &&
    (!!findMemberInChain(chain, 'applyServerPushToState') || !!findMemberInChain(chain, 'pushMetadata')));
}

/**
 * True if the class is an `OptimisticCommand`. Without type information, its superclasses in
 * this file must reach `OptimisticCommand`, or declare its methods.
 */
function isOptimisticCommand(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) return extendsClassNamed(instanceTypeOfClass(classNode, typeInfo), 'OptimisticCommand', typeInfo.checker);
  const chain = classChain(classNode, context);
  return chain.end === 'OptimisticCommand' ||
    !!findMemberInChain(chain, 'sendCommandToServer') || !!findMemberInChain(chain, 'optimisticValue');
}
