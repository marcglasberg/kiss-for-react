import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule, isTestFile, unwrap } from '../utils.js';
import { findObjectProperty, FunctionNode, isConditional, kissNew, resolveFunction, storeOptions } from '../errors.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const CONSOLE_METHODS = ['log', 'info', 'debug'];

/**
 * Reports debug tools given to the store without a check for the environment:
 *
 * - `PersistorPrinterDecorator`, which prints all persistence calls.
 * - An `actionObserver` or `stateObserver` that only prints to the console.
 *
 * ```ts
 * createStore<State>({ persistor: new PersistorPrinterDecorator(persistor) });      // Only in development.
 * createStore<State>({ persistor: isDev ? new PersistorPrinterDecorator(p) : p }); // OK
 * ```
 *
 * Not reported inside an `if`, a conditional expression, or the right side of `&&`, `||` and
 * `??`. Not reported in tests.
 *
 * Suggestions: remove the `PersistorPrinterDecorator` (keeping the persistor it decorates), or
 * remove the observer.
 */
export default createRule({
  name: 'debug-observer-in-release',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use debug tools, like `PersistorPrinterDecorator` or observers that print to the console, only in development.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      printerDecorator: '`PersistorPrinterDecorator` prints all persistence calls, which is only useful while debugging. Use it only in development, for example: `isDev ? new PersistorPrinterDecorator(persistor) : persistor`.',
      consoleObserver: 'This `{{name}}` only prints to the console, which is only useful while debugging. Use it only in development, for example: `{{name}}: isDev ? ... : undefined`.',
      removePrinterDecorator: 'Remove the `PersistorPrinterDecorator`, and use the persistor it decorates.',
      removeObserver: 'Remove the `{{name}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};

    const checkStore = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
      const options = storeOptions(node, context);
      if (!options) return;
      for (const name of ['actionObserver', 'stateObserver']) {
        const property = findObjectProperty(options, name);
        if (!property || isConditional(property)) continue;
        const value = unwrap(property.value);
        if (value.type === AST_NODE_TYPES.ConditionalExpression || value.type === AST_NODE_TYPES.LogicalExpression) continue;
        const fn = resolveFunction(value, context);
        if (!fn || !onlyPrints(fn, context)) continue;
        context.report({
          node: property,
          messageId: 'consoleObserver',
          data: {name},
          suggest: [{
            messageId: 'removeObserver',
            data: {name},
            fix: (fixer) => removeProperty(property, context, fixer),
          }],
        });
      }
    };

    return {
      NewExpression(node) {
        const printer = kissNew(node, 'PersistorPrinterDecorator', context);
        if (printer) {
          if (isConditional(printer)) return;
          const persistor = printer.arguments[0];
          context.report({
            node: printer,
            messageId: 'printerDecorator',
            suggest: printer.arguments.length === 1 && persistor.type !== AST_NODE_TYPES.SpreadElement ? [{
              messageId: 'removePrinterDecorator',
              fix: (fixer) => fixer.replaceText(printer, context.sourceCode.getText(persistor)),
            }] : [],
          });
          return;
        }
        checkStore(node);
      },
      CallExpression: checkStore,
    };
  },
});

/** True if the function only calls `console.log` (or `info` or `debug`). */
function onlyPrints(fn: FunctionNode, context: Context): boolean {
  if (fn.body.type !== AST_NODE_TYPES.BlockStatement) return isConsoleCall(fn.body, context);
  return fn.body.body.length > 0 && fn.body.body.every((statement) =>
    statement.type === AST_NODE_TYPES.ExpressionStatement && isConsoleCall(statement.expression, context));
}

function isConsoleCall(node: TSESTree.Node, context: Context): boolean {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;
  if (callee.type !== AST_NODE_TYPES.MemberExpression || callee.computed ||
    callee.object.type !== AST_NODE_TYPES.Identifier || callee.object.name !== 'console' ||
    callee.property.type !== AST_NODE_TYPES.Identifier || !CONSOLE_METHODS.includes(callee.property.name)) return false;
  // The global `console`, not a variable with that name.
  const variable = ASTUtils.findVariable(context.sourceCode.getScope(callee.object), 'console');
  return !variable || variable.defs.length === 0;
}

/** Removes the property from its object, with its comma. */
function removeProperty(property: TSESTree.Property, context: Context, fixer: TSESLint.RuleFixer): TSESLint.RuleFix {
  const source = context.sourceCode;
  const after = source.getTokenAfter(property);
  if (after?.value === ',') {
    const next = source.getTokenAfter(after, {includeComments: true});
    // The last property, with a trailing comma: remove from the end of the previous token.
    if (!next || next.value === '}') {
      const previous = source.getTokenBefore(property)!;
      return fixer.removeRange([previous.range[1], after.range[1]]);
    }
    return fixer.removeRange([property.range[0], next.range[0]]);
  }
  const before = source.getTokenBefore(property);
  if (before?.value === ',') return fixer.removeRange([before.range[0], property.range[1]]);
  return fixer.remove(property);
}
