import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from '../actions.js';
import {
  ClassNode,
  classChain,
  extendsClassNamed,
  findMemberInChain,
  initializerTextOf,
  instanceTypeOfClass,
  userDeclarations,
} from '../actionFeatures.js';
import { createRule, enclosingClass, getTypeInfo, isFunction, TypeInfo, unwrap } from '../utils.js';
import { featureState, isAction } from './incompatibleActionFeatures.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

// TypeScript flags (their values are stable across TypeScript versions).
const SYMBOL_FLAGS_CLASS = 32; // ts.SymbolFlags.Class
const SYMBOL_FLAGS_ALIAS = 2097152; // ts.SymbolFlags.Alias

/** The methods that wait for the actions given to them. */
const ACTION_METHODS = ['dispatchAndWait', 'dispatchAndWaitAll', 'waitAllActions'];

/** The methods that wait for the action classes given to them. */
const TYPE_METHODS = ['waitActionType', 'waitAllActionTypes'];

/** The methods that take a list (an array), instead of a single action or class. */
const LIST_METHODS = ['dispatchAndWaitAll', 'waitAllActions', 'waitAllActionTypes'];

/** The methods that dispatch without waiting, to use instead. */
const WITHOUT_WAITING: Record<string, string> = {dispatchAndWait: 'dispatch', dispatchAndWaitAll: 'dispatchAll'};

/** An action class: if it's sequential, the key of its queue (if known), and its name. */
interface SequentialInfo {
  name: string;
  sequential: boolean;
  /** The key of the queue, as a string that is the same for the same key, or `null` if it's not known. */
  key: string | null;
}

/**
 * Reports a sequential action (`sequential = true`) that waits for another action of the same
 * queue, with `dispatchAndWait`, `dispatchAndWaitAll`, `waitAllActions`, `waitActionType` or
 * `waitAllActionTypes`:
 *
 * ```ts
 * class Parent extends Action {
 *   sequential = true;
 *   async reduce() {
 *     await this.dispatchAndWait(new Child()); // Error: Child also uses the queue.
 *     this.dispatch(new Child());              // OK: Child runs after Parent finishes.
 *     return null;
 *   }
 * }
 *
 * class Child extends Action {
 *   sequential = true;
 *   ...
 * }
 * ```
 *
 * A sequential action holds its queue until it finishes (from `before` to `after`), so the other
 * action only starts after it finishes, and both wait for each other forever.
 *
 * Two actions use the same queue when neither overrides `sequentialKeyParams()` (the key is then
 * `null`), when both return the same literal (like `'saves'` or `1`), or when both return the
 * same class (like `this.constructor`, in the same concrete class). Keys that depend on fields,
 * or that can't be known, are not checked. Features and keys inherited from superclasses count
 * too (in this file, or anywhere with type information).
 *
 * Only waits in the action's own methods are checked, not in closures, and only when the promise
 * is awaited or returned. Waiting for the action's own class with `waitActionType` or
 * `waitAllActionTypes` is not reported, since Kiss throws (or ignores it) instead of waiting. Also
 * reported in tests.
 *
 * Suggestion: `dispatch` instead of `dispatchAndWait` (or `dispatchAll` instead of
 * `dispatchAndWaitAll`), when the result is not used.
 */
export default createRule({
  name: 'sequential-deadlock',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow a sequential action waiting for another action of the same queue.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      deadlock:
        '`{{current}}` and `{{target}}` use the same sequential queue, so waiting for `{{target}}` with ' +
        '`{{method}}` deadlocks: `{{target}}` only runs after `{{current}}` finishes. {{correction}}',
      useWithoutWaiting: 'Use `{{replacement}}`, without waiting.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    const infos = new Map<ClassNode, SequentialInfo | null>();

    // The current action, if it's a sequential action with a known key.
    const currentOf = (classNode: ClassNode): SequentialInfo | null => {
      if (!infos.has(classNode)) {
        const info = isAction(classNode, context, typeInfo) ? infoOfClassNode(classNode, context, typeInfo) : null;
        infos.set(classNode, info?.sequential && info.key !== null ? info : null);
      }
      return infos.get(classNode)!;
    };

    return {
      CallExpression(node) {
        const callee = node.callee;
        const property = callee.type === AST_NODE_TYPES.Identifier ? callee
          : callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier ? callee.property : null;
        if (!property) return;
        const method = property.name;
        const waitsForTypes = TYPE_METHODS.includes(method);
        if (!waitsForTypes && !ACTION_METHODS.includes(method)) return;
        if (!isAwaitedOrReturned(node)) return;

        // Only the action's own methods, not closures.
        const ownMethod = ownMethodOf(node);
        if (!ownMethod) return;
        const classNode = enclosingClass(ownMethod);
        if (!classNode) return;
        const current = currentOf(classNode);
        if (!current) return;

        const argument = node.arguments[0];
        if (!argument || argument.type === AST_NODE_TYPES.SpreadElement) return;
        let targets: TSESTree.Expression[] = [argument];
        if (LIST_METHODS.includes(method)) {
          const array = unwrap(argument);
          if (array.type !== AST_NODE_TYPES.ArrayExpression) return;
          targets = array.elements.filter((e): e is TSESTree.Expression => !!e && e.type !== AST_NODE_TYPES.SpreadElement);
        }

        for (const target of targets) {
          const info = waitsForTypes ? infoOfClassReference(target, context, typeInfo)
            : infoOfActionExpression(target, context, typeInfo);
          if (!info?.sequential || info.key === null || info.key !== current.key) continue;

          // Waiting for its own type throws a StoreException (or is ignored) instead of hanging.
          if (waitsForTypes && isSameClass(target, classNode, context, typeInfo)) continue;

          const replacement = WITHOUT_WAITING[method];
          const correction = replacement
            ? `Use \`${replacement}\` instead, without waiting, or give the actions different keys in \`sequentialKeyParams()\`.`
            : `Don't wait for \`${info.name}\`, or give the actions different keys in \`sequentialKeyParams()\`.`;

          // The suggestion is only offered when the result is not used: `await this.dispatchAndWait(...);`
          const parent = node.parent;
          const canFix = !!replacement && parent.type === AST_NODE_TYPES.AwaitExpression &&
            parent.parent.type === AST_NODE_TYPES.ExpressionStatement;

          context.report({
            node: target,
            messageId: 'deadlock',
            data: {current: current.name, target: info.name, method, correction},
            suggest: canFix ? [{
              messageId: 'useWithoutWaiting',
              data: {replacement},
              fix: (fixer: TSESLint.RuleFixer) => [
                fixer.removeRange([parent.range[0], node.range[0]]),
                fixer.replaceText(property, replacement),
              ],
            }] : [],
          });
        }
      },
    };
  },
});

/** True if the promise returned by the call is awaited, or returned. */
function isAwaitedOrReturned(node: TSESTree.CallExpression): boolean {
  let child: TSESTree.Node = node;
  let parent = node.parent;
  while (parent && unwrap(parent) !== parent) {
    child = parent;
    parent = parent.parent!;
  }
  return parent?.type === AST_NODE_TYPES.AwaitExpression ||
    parent?.type === AST_NODE_TYPES.ReturnStatement ||
    (parent?.type === AST_NODE_TYPES.ArrowFunctionExpression && parent.body === child);
}

/** The method of a class whose body contains the node directly (not inside a closure). */
function ownMethodOf(node: TSESTree.Node): TSESTree.MethodDefinition | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current && !isFunction(current)) current = current.parent;
  if (current?.type !== AST_NODE_TYPES.FunctionExpression) return null;
  const method = current.parent;
  return method?.type === AST_NODE_TYPES.MethodDefinition && !method.static && method.kind !== 'constructor' ? method : null;
}

/** True if the class reference is the class itself. */
function isSameClass(classRef: TSESTree.Expression, classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  const expression = unwrap(classRef);
  if (typeInfo) {
    const symbol = symbolOf(typeInfo.services.esTreeNodeToTSNodeMap.get(expression), typeInfo.checker);
    return !!symbol && symbol === instanceTypeOfClass(classNode, typeInfo).getSymbol();
  }
  return expression.type === AST_NODE_TYPES.Identifier && classDeclarationOf(expression, context) === classNode;
}

// ---------------------------------------------------------------------------------------------
// Without type information: the class and its superclasses must be declared in this file.

function infoOfClassNode(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): SequentialInfo {
  const name = classNode.id?.name ?? 'this action';
  if (typeInfo) return infoOfType(instanceTypeOfClass(classNode, typeInfo), typeInfo) ?? {name, sequential: false, key: null};

  const sequential = featureState('sequential', classNode, context, null).on;
  const chain = classChain(classNode, context);
  const keyParams = findMemberInChain(chain, 'sequentialKeyParams');
  if (!keyParams) return {name, sequential, key: chain.end !== null ? 'null' : null};
  if (keyParams.type !== AST_NODE_TYPES.MethodDefinition || !keyParams.value.body) return {name, sequential, key: null};

  const statements = keyParams.value.body.body;
  const returned = statements.length === 1 && statements[0].type === AST_NODE_TYPES.ReturnStatement
    ? statements[0].argument : null;
  if (!returned) return {name, sequential, key: null};
  const expression = unwrap(returned);

  let key: string | null = null;
  if (expression.type === AST_NODE_TYPES.Literal) {
    key = literalKey(expression.raw);
  } else if (isThisConstructor(expression)) {
    // The class of the action, which is only known for a concrete class.
    key = classNode.abstract || !classNode.id ? null : `class:${classNode.id.name}`;
  } else if (expression.type === AST_NODE_TYPES.Identifier) {
    key = expression.name === 'undefined' ? 'undefined'
      : classDeclarationOf(expression, context) ? `class:${expression.name}` : null;
  }
  return {name, sequential, key};
}

/** The action class of an expression that is an action, like `new Child()` or `child`. */
function infoOfActionExpression(action: TSESTree.Expression, context: Context, typeInfo: TypeInfo | null): SequentialInfo | null {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(action));
    return type.isUnion() ? null : infoOfType(type, typeInfo);
  }

  // `const child = new Child(); await this.dispatchAndWait(child);`
  let expression = unwrap(action);
  if (expression.type === AST_NODE_TYPES.Identifier) {
    const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
    if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return null;
    if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return null;
    expression = unwrap(def.node.init);
  }
  if (expression.type !== AST_NODE_TYPES.NewExpression || expression.callee.type !== AST_NODE_TYPES.Identifier) return null;
  const classNode = classDeclarationOf(expression.callee, context);
  return classNode && isAction(classNode, context, null) ? infoOfClassNode(classNode, context, null) : null;
}

/** The action class of an expression that is a class, like `Child` in `waitActionType(Child)`. */
function infoOfClassReference(classRef: TSESTree.Expression, context: Context, typeInfo: TypeInfo | null): SequentialInfo | null {
  const expression = unwrap(classRef);
  if (typeInfo) {
    const classType = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(expression));
    const signatures = classType.getConstructSignatures();
    if (signatures.length === 0) return null;
    return infoOfType(typeInfo.checker.getReturnTypeOfSignature(signatures[0]), typeInfo);
  }
  if (expression.type !== AST_NODE_TYPES.Identifier) return null;
  const classNode = classDeclarationOf(expression, context);
  return classNode && isAction(classNode, context, null) ? infoOfClassNode(classNode, context, null) : null;
}

// ---------------------------------------------------------------------------------------------
// With type information.

function infoOfType(type: ts.Type, {checker}: TypeInfo): SequentialInfo | null {
  if (!extendsClassNamed(type, 'KissAction', checker)) return null;
  const symbol = type.getSymbol();
  const name = symbol?.getName() ?? checker.typeToString(type);
  const sequential = initializerTextOf(type, 'sequential')?.trim() === 'true';

  const declaration = userDeclarations(type, 'sequentialKeyParams')[0] as ts.MethodDeclaration | undefined;
  if (!declaration) return {name, sequential, key: 'null'};

  const statements = declaration.body?.statements;
  const statement = statements?.length === 1 ? statements[0] as ts.ReturnStatement : null;
  const sourceFile = declaration.getSourceFile();
  if (!statement || !statement.getText(sourceFile).startsWith('return') || !statement.expression) return {name, sequential, key: null};
  const expression = statement.expression;
  const text = expression.getText(sourceFile);

  let key: string | null = literalKey(text);
  if (key === null && text.replace(/\s/g, '') === 'this.constructor') {
    // The class of the action, which is only known for a concrete class.
    const classDeclaration = symbol?.valueDeclaration as ts.ClassLikeDeclaration | undefined;
    const isAbstract = !!classDeclaration?.modifiers?.some((modifier) => modifier.getText() === 'abstract');
    key = symbol && classDeclaration && !isAbstract ? `class:${name}` : null;
  } else if (key === null && /^[A-Za-z_$][\w$]*$/.test(text)) {
    const classSymbol = symbolOf(expression, checker);
    key = text === 'undefined' ? 'undefined'
      : classSymbol && (classSymbol.flags & SYMBOL_FLAGS_CLASS) !== 0 ? `class:${classSymbol.getName()}` : null;
  }
  return {name, sequential, key};
}

/** The symbol of an identifier, following imports. */
function symbolOf(node: ts.Node, checker: ts.TypeChecker): ts.Symbol | undefined {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol && (symbol.flags & SYMBOL_FLAGS_ALIAS) !== 0) symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

// ---------------------------------------------------------------------------------------------

/** The key of a literal, like `null`, `'saves'` or `1`, so that `'saves'` and `"saves"` are the same. */
function literalKey(text: string): string | null {
  const value = text.trim();
  if (/^(null|true|false)$/.test(value)) return value;
  if (/^-?\d+(\.\d+)?$/.test(value)) return `number:${Number(value)}`;
  const string = /^(['"`])([^'"`\\$]*)\1$/.exec(value);
  return string ? `string:${string[2]}` : null;
}

/** True if the node is `this.constructor`. */
function isThisConstructor(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.MemberExpression && !node.computed &&
    node.object.type === AST_NODE_TYPES.ThisExpression &&
    node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'constructor';
}
