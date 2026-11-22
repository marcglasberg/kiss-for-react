import { AST_NODE_TYPES } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { ClassNode, isStateClass } from '../stateClasses.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Warns about asynchronous instance methods, getters and function fields of state classes.
 * State classes are detected automatically or declared with optional `@stateClass`.
 * Keep asynchronous work in actions so state methods remain synchronous calculations.
 *
 * `async` members (including async generators) are recognized without type information.
 * With type information, call signatures returning a thenable, including union members,
 * are also checked. `any` and `unknown` do not establish an asynchronous return type.
 * Static methods, constructors and nested async functions are not reported merely for
 * being async. This rule does not prove purity or require new instances as return values.
 * Enabled as a warning by default. No fix: removing async can change application behavior.
 */
export default createRule({
  name: 'state-methods-must-be-sync',
  meta: {
    type: 'suggestion',
    docs: {description: 'Keep state instance methods synchronous; perform asynchronous work in actions.'},
    schema: [],
    messages: {
      async: 'This state member is asynchronous. Keep state methods synchronous and perform asynchronous work in a Kiss action.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    const check = (node: ClassNode) => {
      if (!isStateClass(node, context, typeInfo)) return;
      for (const member of node.body.body) {
        if (member.type !== AST_NODE_TYPES.MethodDefinition && member.type !== AST_NODE_TYPES.PropertyDefinition) continue;
        if (member.static || (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor')) continue;
        const value = member.value;
        const asyncSyntax = value && (value.type === AST_NODE_TYPES.FunctionExpression ||
          value.type === AST_NODE_TYPES.ArrowFunctionExpression) && value.async;
        let returnsPromise = false;
        if (typeInfo) {
          const {checker, services} = typeInfo;
          const tsNode = services.esTreeNodeToTSNodeMap.get(member);
          const signature = member.type === AST_NODE_TYPES.MethodDefinition
            ? checker.getSignatureFromDeclaration(tsNode as ts.SignatureDeclaration) : undefined;
          const signatures = signature ? [signature] : checker.getTypeAtLocation(tsNode).getCallSignatures();
          const hasPromise = (type: ts.Type): boolean => {
            if (type.isUnion()) return type.types.some(hasPromise);
            const then = type.getProperty('then');
            return !!then && checker.getTypeOfSymbolAtLocation(then, tsNode).getCallSignatures().length > 0;
          };
          returnsPromise = signatures.some((sig) => hasPromise(checker.getReturnTypeOfSignature(sig)));
        }
        if (asyncSyntax || returnsPromise) context.report({node: member.key, messageId: 'async'});
      }
    };
    return {ClassDeclaration: check, ClassExpression: check};
  },
});
