import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule, getTypeInfo, kissImportName, returnedExpressions, unwrap, walk } from '../utils.js';
import { enclosingFunction, FunctionNode, isCaughtInSameFunction, isMethodOf, kissExportReference, userExceptionOf } from '../errors.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/**
 * Reports a `UserException` thrown where Kiss can't catch it: in a React component or hook,
 * in a function declared inside them (like an event handler, or an effect), or in the `after`
 * method of an action:
 *
 * ```tsx
 * <button onClick={() => { throw new UserException('Invalid'); }} />       // Dispatch it instead.
 * <button onClick={() => dispatch(new UserExceptionAction('Invalid'))} />  // OK
 * ```
 *
 * A `UserException` is only shown to the user when it's thrown from the `before` or `reduce`
 * of an action. Throws caught by a `try` in the same function are not reported, and neither
 * are throws in other functions (which may be called from an action).
 *
 * Suggestion: dispatch a `UserExceptionAction` instead.
 */
export default createRule({
  name: 'user-exception-outside-action',
  meta: {
    type: 'problem',
    docs: {
      description: 'Throw `UserException`s only in actions, where Kiss shows them to the user.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      outsideAction: 'This `UserException` is thrown outside of an action, so it\'s not shown to the user. Kiss only shows the `UserException`s thrown in the `before` or `reduce` of an action. Dispatch a `UserExceptionAction` instead.',
      inAfter: 'This `UserException` is thrown in `after`, so it\'s not shown to the user (Kiss ignores errors thrown in `after`). Kiss only shows the `UserException`s thrown in `before` or `reduce`. Dispatch a `UserExceptionAction` instead.',
      dispatchAction: 'Dispatch a `UserExceptionAction` instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      ThrowStatement(node) {
        const userException = userExceptionOf(node.argument, context);
        if (!userException || isCaughtInSameFunction(node)) return;
        const fn = enclosingFunction(node);
        if (!fn) return;

        // In the `after` method of an action (but not in functions inside it).
        if (isMethodOf(fn, 'after', context, typeInfo, {actions: true})) {
          const fix = dispatchFix(node, userException, fn, 'this.dispatch', context);
          context.report({
            node,
            messageId: 'inAfter',
            suggest: fix ? [{messageId: 'dispatchAction', fix}] : [],
          });
          return;
        }

        // In a component or hook, or in a function declared inside one.
        const place = reactPlaceOf(fn);
        if (!place) return;
        // Dispatching while rendering is wrong too, so there's only a suggestion inside functions.
        const dispatch = place === 'nested' ? findDispatchInScope(node, context) : null;
        const fix = dispatch ? dispatchFix(node, userException, fn, dispatch, context) : null;
        context.report({
          node,
          messageId: 'outsideAction',
          suggest: fix ? [{messageId: 'dispatchAction', fix}] : [],
        });
      },
    };
  },
});

/**
 * Where the function is: `'render'` if it's a component or hook, `'nested'` if it's declared
 * inside one (like an event handler or an effect), or null otherwise.
 */
function reactPlaceOf(fn: FunctionNode): 'render' | 'nested' | null {
  let nested = false;
  for (let current: FunctionNode | null = fn; current; current = enclosingFunction(current)) {
    if (isComponentOrHook(current)) return nested ? 'nested' : 'render';
    // Named functions, and methods, may be helpers called from actions.
    if (current.type === AST_NODE_TYPES.FunctionDeclaration) return null;
    const parent = current.parent;
    if (parent?.type === AST_NODE_TYPES.MethodDefinition || parent?.type === AST_NODE_TYPES.PropertyDefinition) return null;
    nested = true;
  }
  return null;
}

/**
 * True if the function is a React hook (named `useX`), or a component: named with an uppercase
 * first letter, and it has JSX or calls a hook.
 */
function isComponentOrHook(fn: FunctionNode): boolean {
  const name = functionName(fn);
  if (!name) return false;
  if (/^use[A-Z0-9]/.test(name)) return true;
  if (!/^[A-Z]/.test(name)) return false;
  let found = false;
  walk(fn.body, (node) => {
    if (node.type === AST_NODE_TYPES.JSXElement || node.type === AST_NODE_TYPES.JSXFragment) found = true;
    if (node.type === AST_NODE_TYPES.CallExpression && isHookCallee(node.callee)) found = true;
  }, true);
  return found;
}

function isHookCallee(callee: TSESTree.Node): boolean {
  if (callee.type === AST_NODE_TYPES.Identifier) return /^use[A-Z0-9]/.test(callee.name);
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier && /^use[A-Z0-9]/.test(callee.property.name);
}

/**
 * The name of the function: `function Name()`, `const Name = () => ...`, or
 * `const Name = memo(() => ...)` (also `forwardRef`).
 */
function functionName(fn: FunctionNode): string | null {
  if (fn.id) return fn.id.name;
  let node: TSESTree.Node = fn;
  let parent = node.parent;
  if (parent?.type === AST_NODE_TYPES.CallExpression && parent.arguments[0] === node && isWrapperCallee(parent.callee)) {
    node = parent;
    parent = node.parent;
  }
  if (parent?.type === AST_NODE_TYPES.VariableDeclarator && parent.init === node && parent.id.type === AST_NODE_TYPES.Identifier) {
    return parent.id.name;
  }
  return null;
}

function isWrapperCallee(callee: TSESTree.Node): boolean {
  const name = callee.type === AST_NODE_TYPES.Identifier ? callee.name
    : callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier ? callee.property.name
      : null;
  return name === 'memo' || name === 'forwardRef';
}

/** The name of a variable in scope with the function returned by Kiss's `useDispatch()`. */
function findDispatchInScope(node: TSESTree.Node, context: Context): string | null {
  const scope = context.sourceCode.getScope(node);
  for (let current: TSESLint.Scope.Scope | null = scope; current; current = current.upper) {
    for (const variable of current.variables) {
      const def = variable.defs[0];
      if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator ||
        def.node.id.type !== AST_NODE_TYPES.Identifier || !def.node.init) continue;
      const init = unwrap(def.node.init);
      if (init.type !== AST_NODE_TYPES.CallExpression || kissImportName(init.callee, context) !== 'useDispatch') continue;
      // Not shadowed where it's used.
      if (ASTUtils.findVariable(scope, variable.name) === variable) return variable.name;
    }
  }
  return null;
}

/**
 * Replaces `throw new UserException(message);` with `dispatch(new UserExceptionAction(message));`,
 * followed by `return;`, unless it's the last statement of the function. Only when the
 * `UserException` has just a message (`UserExceptionAction` has no other options), and the
 * function returns no value.
 */
function dispatchFix(
  node: TSESTree.ThrowStatement,
  userException: TSESTree.NewExpression,
  fn: FunctionNode,
  dispatch: string,
  context: Context,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (unwrap(node.argument) !== userException) return null;
  const args = userException.arguments;
  if (args.length !== 1 || args[0].type === AST_NODE_TYPES.SpreadElement) return null;
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement || returnedExpressions(fn).length > 0) return null;

  const action = kissExportReference('UserExceptionAction', userException.callee, context);
  if (!action) return null;

  const isLast = node.parent === fn.body && fn.body.body[fn.body.body.length - 1] === node;
  let text = `${dispatch}(new ${action.text}(${context.sourceCode.getText(args[0])}));`;
  if (!isLast) text += ' return;';
  const parent = node.parent;
  const inBlock = parent.type === AST_NODE_TYPES.BlockStatement || parent.type === AST_NODE_TYPES.SwitchCase ||
    parent.type === AST_NODE_TYPES.StaticBlock || parent.type === AST_NODE_TYPES.Program;
  if (!inBlock) text = `{ ${text} }`;

  return (fixer) => {
    const fixes = [fixer.replaceText(node, text)];
    if (action.fix) fixes.push(action.fix(fixer));
    return fixes;
  };
}

