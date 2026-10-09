import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { Context, DISPATCH_METHODS, dispatchMethodOf, FunctionNode, storeKind } from '../components.js';
import {
  enclosingClass,
  createRule,
  getTypeInfo,
  isFunction,
  isKissActionClass,
  kissImportName,
  returnedExpressions,
  TypeInfo,
  unwrap,
  walk,
} from '../utils.js';

const SELECT_HOOKS = new Set(['useSelect', 'useSelector', 'useObject']);

/**
 * Reports a selector of `useSelect`, `useSelector` or `useObject`, or a condition of
 * `waitCondition`, `dispatchWhen` or `useDispatchWhen`, that doesn't only use its parameter:
 *
 * ```tsx
 * const state = useAllState<State>();
 * const items = useSelect((s: State) => state.items);                            // Error: use `s`.
 * const items = useSelect((s: State) => { dispatch(new X()); return s.items; }); // Error
 * ```
 *
 * Reports dispatches, `store.state` (and `this.state` in actions), and variables that hold the
 * whole state of the last render: from `useAllState`, or from a selector that returns the whole
 * state. Values selected by other selectors (like `const id = useSelect((s) => s.user.id)`) are
 * fine: using them is like using a prop.
 *
 * Fix: replace `store.state`, `this.state`, or a variable with the whole state, with the parameter.
 */
export default createRule({
  name: 'store-in-selector',
  meta: {
    type: 'problem',
    docs: {
      description: 'Selectors and conditions must only read the state from their parameter, and must not dispatch.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      dispatch:
        'A {{what}} must not dispatch actions. Kiss runs it to read the state, many times, on every state ' +
        'change. Dispatch from an event handler, an effect, or an action instead.',
      storeState:
        'This {{what}} reads `{{text}}` instead of its parameter. A {{what}} gets the current state as its ' +
        'parameter, and must only read the state from it.',
      stateVariable:
        'This {{what}} reads `{{text}}`, which has the state of the last render, and may be outdated when ' +
        'the {{what}} runs. A {{what}} gets the current state as its parameter, and must only read the state from it.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const found = selectorOf(node, context, typeInfo);
        if (!found) return;
        checkSelector(found.fn, found.what, context, typeInfo);
      },
    };
  },
});

/** The selector (or condition) passed to the call, if it's one of the Kiss functions that take one. */
function selectorOf(
  call: TSESTree.CallExpression,
  context: Context,
  typeInfo: TypeInfo | null,
): { fn: FunctionNode, what: 'selector' | 'condition' } | null {
  let argument: TSESTree.Node | undefined;
  let what: 'selector' | 'condition' = 'condition';

  const hook = kissImportName(call.callee, context);
  const callee = unwrap(call.callee);
  if (hook && SELECT_HOOKS.has(hook)) {
    argument = call.arguments[0];
    what = 'selector';
  } else if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier &&
    (callee.property.name === 'waitCondition' || callee.property.name === 'dispatchWhen') &&
    (storeKind(callee.object, context, typeInfo) || isThisOfAction(callee.object, typeInfo))) {
    argument = call.arguments[callee.property.name === 'waitCondition' ? 0 : 1];
  } else if (dispatchMethodOf(callee, context, typeInfo) === 'dispatchWhen') {
    argument = call.arguments[1];
  }

  return argument && isFunction(argument) ? {fn: argument, what} : null;
}

/** True for `this`, inside a Kiss action. */
function isThisOfAction(node: TSESTree.Node, typeInfo: TypeInfo | null): boolean {
  if (node.type !== AST_NODE_TYPES.ThisExpression) return false;
  const classNode = enclosingClass(node);
  return !!classNode && isKissActionClass(classNode, typeInfo);
}

/** True if `node` sees the same `this` as `fn`: no non-arrow function (or class) between them. */
function hasSameThis(node: TSESTree.Node, fn: FunctionNode): boolean {
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression) return false;
  for (let current = node.parent; current && current !== fn; current = current.parent) {
    if (current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.ClassBody) return false;
  }
  return true;
}

function checkSelector(fn: FunctionNode, what: string, context: Context, typeInfo: TypeInfo | null): void {
  const param = fn.params[0]?.type === AST_NODE_TYPES.Identifier ? fn.params[0] : null;

  // The parameter's name, if it can be used at `location` (it's not shadowed there).
  const paramAt = (location: TSESTree.Node): string | null => {
    if (!param) return null;
    const def = ASTUtils.findVariable(context.sourceCode.getScope(location), param.name)?.defs[0];
    return def?.node === fn ? param.name : null;
  };

  walk(fn.body, (node) => {
    // Dispatches. Inside a selector, any function or method named like a dispatch is reported.
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrap(node.callee);
      const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name
        : (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier)
          ? callee.property.name : null;
      if ((name && DISPATCH_METHODS.has(name)) || dispatchMethodOf(callee, context, typeInfo)) {
        context.report({node: node.callee, messageId: 'dispatch', data: {what}});
      }
      return;
    }

    // `store.state`, and `this.state` in an action.
    if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed &&
      node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'state') {
      const isStoreState = node.object.type === AST_NODE_TYPES.ThisExpression
        ? hasSameThis(node, fn) && isThisOfAction(node.object, typeInfo)
        : storeKind(node.object, context, typeInfo) === 'store';
      if (!isStoreState) return;
      const replacement = paramAt(node);
      context.report({
        node,
        messageId: 'storeState',
        data: {what, text: context.sourceCode.getText(node)},
        fix: replacement ? (fixer) => fixer.replaceText(node, replacement) : null,
      });
    }
  }, true);

  // Variables with the whole state of the last render.
  const scope = context.sourceCode.scopeManager?.acquire(fn);
  if (!scope) return;
  for (const reference of scope.through) {
    const variable = reference.resolved;
    if (!variable || !hasWholeState(variable, context)) continue;
    const identifier = reference.identifier;
    const replacement = paramAt(identifier);
    context.report({
      node: identifier,
      messageId: 'stateVariable',
      data: {what, text: identifier.name},
      fix: replacement ? (fixer) => fixer.replaceText(identifier, replacement) : null,
    });
  }
}

/**
 * True if the variable has the whole state of the last render: a `const` initialized with
 * `useAllState()`, or with `useSelect`/`useSelector`/`useObject` whose selector returns its
 * parameter, like `useSelect((state) => state)`.
 */
function hasWholeState(variable: TSESLint.Scope.Variable, context: Context): boolean {
  const def = variable.defs[0];
  if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || def.node.id !== def.name || !def.node.init) return false;
  if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const') return false;
  const init = unwrap(def.node.init);
  if (init.type !== AST_NODE_TYPES.CallExpression) return false;
  const hook = kissImportName(init.callee, context);
  if (hook === 'useAllState') return true;
  if (!hook || !SELECT_HOOKS.has(hook)) return false;

  const selector = init.arguments[0];
  if (!selector || !isFunction(selector) || selector.params[0]?.type !== AST_NODE_TYPES.Identifier) return false;
  const paramName = selector.params[0].name;
  const returned = returnedExpressions(selector);
  if (returned.length !== 1) return false;
  const expression = unwrap(returned[0]);
  return expression.type === AST_NODE_TYPES.Identifier && expression.name === paramName;
}
