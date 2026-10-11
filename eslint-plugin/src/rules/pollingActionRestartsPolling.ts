import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from '../actions.js';
import { classChain, findPropertyInChain, initializerTextOf } from '../actionFeatures.js';
import { createRule, findMethod, getTypeInfo, kissImportName, returnedExpressions, TypeInfo, unwrap } from '../utils.js';
import { isAction } from './incompatibleActionFeatures.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** The values of `Poll` that start, stop or restart the polling. */
const CONTROL_VALUES = ['start', 'stop', 'runNowAndRestart'];

/** The `Poll` value of a default value, like `start` for `Poll.start`, from its text. */
const POLL_VALUE_TEXT = /^\s*(?:[A-Za-z_$][\w$]*\.)?Poll\s*\.\s*(start|stop|runNowAndRestart|once)\s*$/;

/**
 * Reports a `createPollingAction()` that creates the action with `Poll.start`, `Poll.stop` or
 * `Poll.runNowAndRestart`. The action dispatched on each tick must use `Poll.once` (or no `poll`
 * at all), so that the ticks don't start, stop or restart the polling:
 *
 * ```ts
 * createPollingAction() { return new LoadPrices(Poll.start); } // Warning
 * createPollingAction() { return new LoadPrices(this.poll); }  // Warning
 * createPollingAction() { return new LoadPrices(Poll.once); }  // OK
 * createPollingAction() { return new LoadPrices(); }           // OK, if the default is `Poll.once`.
 * ```
 *
 * It checks the arguments of the `new` expressions that `createPollingAction()` returns:
 *
 * - `Poll.start`, `Poll.stop` or `Poll.runNowAndRestart`.
 * - `this.poll`, which is `Poll.start` or `Poll.runNowAndRestart` while the polling runs.
 * - A missing `poll` argument, when the default value of the `poll` parameter is not `Poll.once`.
 *   Also a class whose `poll` property is not `Poll.once`. The class (and its superclasses) must
 *   be declared in this file, or there must be type information.
 *
 * Suggestion: use `Poll.once`.
 */
export default createRule({
  name: 'polling-action-restarts-polling',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the action returned by `createPollingAction()` to use `Poll.once`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      explicit:
        'The action returned by `createPollingAction()` must use `Poll.once`, not `Poll.{{value}}`, so that ' +
        'the ticks don\'t start, stop or restart the polling.',
      thisPoll:
        'The action returned by `createPollingAction()` must use `Poll.once`, not `this.poll`, which is ' +
        '`Poll.start` or `Poll.runNowAndRestart` while the polling runs. Otherwise, the ticks start or ' +
        'restart the polling.',
      byDefault:
        '`{{action}}` is created without a `poll`, so it uses `Poll.{{value}}`. The action returned by ' +
        '`createPollingAction()` must use `Poll.once`, so that the ticks don\'t start, stop or restart the polling.',
      useOnce: 'Use `Poll.once`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression) => {
      const method = findMethod(classNode, 'createPollingAction');
      if (!method) return;
      if (!isAction(classNode, context, typeInfo)) return;

      for (const returned of returnedExpressions(method.value)) {
        const creation = unwrap(returned);
        if (creation.type !== AST_NODE_TYPES.NewExpression) continue;

        let reportedArgument = false;
        for (const argument of creation.arguments) {
          if (argument.type === AST_NODE_TYPES.SpreadElement) continue;
          const value = pollValueOf(argument, context);
          if (value !== null && CONTROL_VALUES.includes(value)) {
            reportedArgument = true;
            context.report({
              node: argument,
              messageId: 'explicit',
              data: {value},
              suggest: [{messageId: 'useOnce', fix: (fixer) => fixer.replaceText(unwrap(argument), pollOnceText(argument, context))}],
            });
          } else if (isThisPoll(argument)) {
            reportedArgument = true;
            const once = pollOnceTextInScope(argument, context);
            context.report({
              node: argument,
              messageId: 'thisPoll',
              suggest: once ? [{messageId: 'useOnce', fix: (fixer) => fixer.replaceText(unwrap(argument), once)}] : [],
            });
          }
        }
        if (reportedArgument) continue;

        // No `poll` argument: the default `poll` of the created action.
        const byDefault = defaultPollOf(creation, context, typeInfo);
        if (!byDefault || !CONTROL_VALUES.includes(byDefault.value)) continue;
        const once = pollOnceTextInScope(creation, context);
        const canAppend = once !== null && byDefault.parameterIndex === creation.arguments.length;
        context.report({
          node: creation,
          messageId: 'byDefault',
          data: {action: context.sourceCode.getText(creation.callee), value: byDefault.value},
          suggest: canAppend ? [{
            messageId: 'useOnce',
            fix: (fixer: TSESLint.RuleFixer) => {
              const closing = context.sourceCode.getLastToken(creation)!;
              if (closing.value !== ')') {
                // `new LoadPrices` without parentheses.
                return fixer.insertTextAfter(creation, `(${once})`);
              }
              return fixer.insertTextBefore(closing, creation.arguments.length === 0 ? once! : `, ${once}`);
            },
          }] : [],
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** The name of the `Poll` value of an expression, like `start` for `Poll.start`, or null if it's not one. */
function pollValueOf(node: TSESTree.Node, context: Context): string | null {
  const expression = unwrap(node);
  if (expression.type !== AST_NODE_TYPES.MemberExpression || expression.computed ||
    expression.property.type !== AST_NODE_TYPES.Identifier) return null;
  if (!isKissPoll(expression.object, context)) return null;
  return expression.property.name;
}

/** True if the node is Kiss's `Poll`: imported from Kiss, or (when not declared in this file) by name. */
function isKissPoll(node: TSESTree.Node, context: Context): boolean {
  if (kissImportName(node, context) === 'Poll') return true;
  if (node.type !== AST_NODE_TYPES.Identifier || node.name !== 'Poll') return false;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(node), node.name)?.defs[0];
  return !def || def.type === 'ImportBinding';
}

/** The text of `Poll.once`, written as the given `Poll` value is (like `kiss.Poll.once`). */
function pollOnceText(node: TSESTree.Node, context: Context): string {
  const expression = unwrap(node) as TSESTree.MemberExpression;
  return `${context.sourceCode.getText(expression.object)}.once`;
}

/** `Poll.once`, if `Poll` is imported in this file (so the fix doesn't need to add an import). */
function pollOnceTextInScope(node: TSESTree.Node, context: Context): string | null {
  const def = ASTUtils.findVariable(context.sourceCode.getScope(node), 'Poll')?.defs[0];
  return def?.type === 'ImportBinding' ? 'Poll.once' : null;
}

/** True if the node is `this.poll`. */
function isThisPoll(node: TSESTree.Node): boolean {
  const expression = unwrap(node);
  return expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
    expression.object.type === AST_NODE_TYPES.ThisExpression &&
    expression.property.type === AST_NODE_TYPES.Identifier && expression.property.name === 'poll';
}

/**
 * The `poll` the created action gets by default, when the `new` expression doesn't pass it: the
 * default value of the constructor's `poll` parameter (and its position), or else the value of
 * the class's `poll` property. Null if it's not known, or if the `new` expression passes it.
 */
function defaultPollOf(
  creation: TSESTree.NewExpression,
  context: Context,
  typeInfo: TypeInfo | null,
): { value: string, parameterIndex: number | null } | null {
  if (typeInfo) {
    const {services, checker} = typeInfo;
    const tsNode = services.esTreeNodeToTSNodeMap.get(creation) as ts.NewExpression;
    const signature = checker.getResolvedSignature(tsNode);
    if (!signature) return null;
    const parameterIndex = signature.parameters.findIndex((parameter) => parameter.getName() === 'poll');
    if (parameterIndex >= 0) {
      if (parameterIndex < creation.arguments.length) return null;
      const declaration = signature.parameters[parameterIndex].valueDeclaration as ts.ParameterDeclaration | undefined;
      const text = declaration?.initializer?.getText(declaration.getSourceFile());
      const value = text ? POLL_VALUE_TEXT.exec(text)?.[1] : undefined;
      return value ? {value, parameterIndex} : null;
    }
    const text = initializerTextOf(checker.getTypeAtLocation(tsNode), 'poll');
    const value = text ? POLL_VALUE_TEXT.exec(text)?.[1] : undefined;
    return value ? {value, parameterIndex: null} : null;
  }

  if (creation.callee.type !== AST_NODE_TYPES.Identifier) return null;
  const classNode = classDeclarationOf(creation.callee, context);
  if (!classNode) return null;
  const chain = classChain(classNode, context);

  // The first class of the chain with a constructor decides the parameters.
  for (const current of chain.classes) {
    const constructor = current.body.body.find((member): member is TSESTree.MethodDefinition =>
      member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor');
    if (!constructor) continue;
    const parameterIndex = constructor.value.params.findIndex((param) => parameterName(param) === 'poll');
    if (parameterIndex < 0) break;
    if (parameterIndex < creation.arguments.length) return null;
    const param = constructor.value.params[parameterIndex];
    const pattern = param.type === AST_NODE_TYPES.TSParameterProperty ? param.parameter : param;
    if (pattern.type !== AST_NODE_TYPES.AssignmentPattern) return null;
    const value = pollValueOf(pattern.right, context);
    return value ? {value, parameterIndex} : null;
  }

  const property = findPropertyInChain(chain, 'poll');
  const value = property?.value ? pollValueOf(property.value, context) : null;
  return value ? {value, parameterIndex: null} : null;
}

/** The name of a constructor parameter, like `poll` in `readonly poll = Poll.once`. */
function parameterName(param: TSESTree.Parameter): string | null {
  const pattern = param.type === AST_NODE_TYPES.TSParameterProperty ? param.parameter : param;
  const target = pattern.type === AST_NODE_TYPES.AssignmentPattern ? pattern.left : pattern;
  return target.type === AST_NODE_TYPES.Identifier ? target.name : null;
}
