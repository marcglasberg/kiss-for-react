import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import { createRule, isFunction, KISS_PACKAGE, kissImportName, returnedExpressions, unwrap } from '../utils.js';

/**
 * Reports `useSelect` (or `useSelector`) with a selector that returns a new object or array,
 * like `useSelect((state: State) => ({ name: state.name, age: state.age }))`.
 *
 * `useSelect` re-renders the component when the selected value changes, comparing it with `===`.
 * A new object is never `===` the previous one, so the component re-renders on every state
 * change. `useObject` compares the values inside the object (or array) instead.
 *
 * Fix: replace with `useObject`, adding it to the import.
 */
export default createRule({
  name: 'no-new-object-in-use-select',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow selectors that return a new object or array in `useSelect`. Use `useObject` instead.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      newObject:
        'This selector returns a new {{kind}} each time, so `{{hook}}` re-renders the component on every ' +
        'state change. Use `useObject` instead, which compares the values inside the {{kind}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const hook = kissImportName(node.callee, context);
        if (hook !== 'useSelect' && hook !== 'useSelector') return;

        const selector = node.arguments[0];
        if (!selector || !isFunction(selector)) return;

        const literal = returnedExpressions(selector)
          .map((expression) => unwrap(expression))
          .find((expression) =>
            expression.type === AST_NODE_TYPES.ObjectExpression || expression.type === AST_NODE_TYPES.ArrayExpression);
        if (!literal) return;

        context.report({
          node: node.callee,
          messageId: 'newObject',
          data: {hook, kind: literal.type === AST_NODE_TYPES.ObjectExpression ? 'object' : 'array'},
          fix: (fixer) => fixToUseObject(fixer, node.callee, context),
        });
      },
    };
  },
});

function fixToUseObject(
  fixer: TSESLint.RuleFixer,
  callee: TSESTree.Expression,
  context: Readonly<TSESLint.RuleContext<string, readonly unknown[]>>,
): TSESLint.RuleFix | TSESLint.RuleFix[] | null {

  // `kiss.useSelect(...)` becomes `kiss.useObject(...)`.
  if (callee.type === AST_NODE_TYPES.MemberExpression) return fixer.replaceText(callee.property, 'useObject');
  if (callee.type !== AST_NODE_TYPES.Identifier) return null;

  const program = context.sourceCode.ast;
  const kissImports = program.body.filter((statement): statement is TSESTree.ImportDeclaration =>
    statement.type === AST_NODE_TYPES.ImportDeclaration &&
    statement.source.value === KISS_PACKAGE &&
    statement.importKind !== 'type');

  // If `useObject` is already imported, use it (with its local name).
  for (const declaration of kissImports) {
    for (const specifier of declaration.specifiers) {
      if (specifier.type === AST_NODE_TYPES.ImportSpecifier && specifier.importKind !== 'type' &&
        specifier.imported.type === AST_NODE_TYPES.Identifier && specifier.imported.name === 'useObject') {
        return fixer.replaceText(callee, specifier.local.name);
      }
    }
  }

  // Don't fix if the name `useObject` is already used for something else.
  const scope = context.sourceCode.getScope(callee);
  if (ASTUtils.findVariable(scope, 'useObject')) return null;

  const variable = ASTUtils.findVariable(scope, callee.name);
  const specifier = variable?.defs[0]?.node;
  if (!variable || !specifier || specifier.type !== AST_NODE_TYPES.ImportSpecifier) return null;

  // If this is the only use of `useSelect`, replace it with `useObject` in the import.
  if (variable.references.length === 1) {
    return [
      fixer.replaceText(callee, 'useObject'),
      fixer.replaceText(specifier, 'useObject'),
    ];
  }

  // Otherwise, add `useObject` to the import of `useSelect`.
  const declaration = specifier.parent as TSESTree.ImportDeclaration;
  const lastSpecifier = declaration.specifiers[declaration.specifiers.length - 1];
  if (lastSpecifier.type !== AST_NODE_TYPES.ImportSpecifier) return null;

  return [
    fixer.replaceText(callee, 'useObject'),
    fixer.insertTextAfter(lastSpecifier, ', useObject'),
  ];
}
