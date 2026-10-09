import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  importKissExport,
  indentOf,
  isValidVariableName,
  isWritten,
  nameOfPath,
  propertyPath,
  writableTypeName,
} from '../components.js';
import { createRule, getTypeInfo, isFunction, isTestFile, kissImportName, returnedExpressions, TypeInfo, unwrap } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const SELECT_HOOKS = new Set(['useSelect', 'useSelector', 'useObject']);

/**
 * Reports `useAllState()`, and `useSelect((state) => state)`, which re-render the component on
 * every state change:
 *
 * ```tsx
 * const state = useAllState<State>();                         // Warning
 * return <p>{state.user.name}</p>;
 *
 * const name = useSelect((state: State) => state.user.name);  // OK
 * ```
 *
 * Not reported in tests, or (with type information) when the state is a number, string or
 * boolean.
 *
 * Fix: replace it with one `useSelect` for each property path the component reads, like
 * `const userName = useSelect((state: State) => state.user.name)`. Only when the variable is
 * used only through property paths, the state type is known, and the new names are free.
 */
export default createRule({
  name: 'avoid-use-all-state',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Avoid `useAllState`, which re-renders the component on every state change. Use `useSelect` instead.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      useAllState:
        '`{{hook}}` re-renders the component on every state change, even when the parts it uses ' +
        'didn\'t change. Use `useSelect` to select only the parts the component uses, like ' +
        '`useSelect((state: State) => state.user.name)`.',
      wholeState:
        'This `{{hook}}` selects the whole state, so it re-renders the component on every state change, ' +
        'even when the parts it uses didn\'t change. Select only the parts the component uses, like ' +
        '`useSelect((state: State) => state.user.name)`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        const hook = kissImportName(node.callee, context);
        if (!hook) return;
        const isUseAllState = hook === 'useAllState';
        if (!isUseAllState && !(SELECT_HOOKS.has(hook) && isIdentitySelector(node.arguments[0]))) return;
        if (typeInfo && isPrimitive(node, typeInfo)) return;

        context.report({
          node: node.callee,
          messageId: isUseAllState ? 'useAllState' : 'wholeState',
          data: {hook},
          fix: (fixer) => fixWithUseSelect(node, isUseAllState, fixer, context, typeInfo),
        });
      },
    };
  },
});

/** True for `(state) => state`, or `function (state) { return state; }`. */
function isIdentitySelector(selector: TSESTree.Node | undefined): boolean {
  if (!selector || !isFunction(selector)) return false;
  const param = selector.params[0];
  if (param?.type !== AST_NODE_TYPES.Identifier) return false;
  const returned = returnedExpressions(selector);
  return returned.length === 1 && unwrap(returned[0]).type === AST_NODE_TYPES.Identifier &&
    (unwrap(returned[0]) as TSESTree.Identifier).name === param.name;
}

/** True if the state is a number, string, boolean or bigint. Then, the component needs all of it. */
function isPrimitive(node: TSESTree.CallExpression, {services, checker}: TypeInfo): boolean {
  const type = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  const types = type.isUnion() ? type.types : [type];
  return types.every((t) => ['number', 'string', 'boolean', 'bigint', 'true', 'false', 'null', 'undefined']
    .includes(checker.typeToString(checker.getBaseTypeOfLiteralType(t))));
}

/** The state type, as written in the code: `useAllState<State>()`, `(state: State) => state`, or `const s: State = ...`. */
function stateTypeText(
  node: TSESTree.CallExpression,
  declarator: TSESTree.VariableDeclarator,
  context: Context,
  typeInfo: TypeInfo | null,
): string | null {
  const typeArgument = node.typeArguments?.params[0];
  if (typeArgument) return context.sourceCode.getText(typeArgument);
  const selector = node.arguments[0];
  if (selector && isFunction(selector)) {
    const annotation = (selector.params[0] as TSESTree.Identifier).typeAnnotation?.typeAnnotation;
    if (annotation) return context.sourceCode.getText(annotation);
  }
  if (declarator.id.typeAnnotation) return context.sourceCode.getText(declarator.id.typeAnnotation.typeAnnotation);
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(node));
    return writableTypeName(type, node, context, typeInfo);
  }
  return null;
}

/**
 * Replaces `const state = useAllState<State>()` with one `useSelect` for each path the code
 * reads from `state`, and the paths with the new variables. Also works for
 * `const { user, items } = useAllState<State>()`.
 */
function fixWithUseSelect(
  node: TSESTree.CallExpression,
  isUseAllState: boolean,
  fixer: TSESLint.RuleFixer,
  context: Context,
  typeInfo: TypeInfo | null,
): TSESLint.RuleFix[] | null {
  const declarator = node.parent;
  if (declarator?.type !== AST_NODE_TYPES.VariableDeclarator || declarator.init !== node) return null;
  const declaration = declarator.parent as TSESTree.VariableDeclaration;
  if (declaration.kind !== 'const' || declaration.declarations.length !== 1) return null;
  if (declaration.parent?.type !== AST_NODE_TYPES.BlockStatement) return null;

  const typeText = stateTypeText(node, declarator, context, typeInfo);
  if (!typeText) return null;

  // The selected paths, and the variables that get them.
  const selections: { name: string, path: string[] }[] = [];
  const replacements: { node: TSESTree.Node, name: string }[] = [];

  if (declarator.id.type === AST_NODE_TYPES.Identifier) {
    const variable = context.sourceCode.getDeclaredVariables(declarator)[0];
    const references = variable.references.filter((reference) => reference.identifier !== declarator.id);
    if (references.length === 0) return null;

    const nameOfKey = new Map<string, string>();
    const keyOfName = new Map<string, string>();
    for (const reference of references) {
      const {node: pathNode, path} = propertyPath(reference.identifier);
      if (path.length === 0 || isWritten(pathNode)) return null;
      const key = path.join('.');
      const name = nameOfPath(path);
      if (!isValidVariableName(name)) return null;
      if (keyOfName.has(name) && keyOfName.get(name) !== key) return null;
      // The name must be free where the variable is declared, and where it's used.
      if (ASTUtils.findVariable(context.sourceCode.getScope(reference.identifier), name)) return null;
      if (!nameOfKey.has(key)) {
        if (ASTUtils.findVariable(context.sourceCode.getScope(declarator), name)) return null;
        nameOfKey.set(key, name);
        keyOfName.set(name, key);
        selections.push({name, path});
      }
      replacements.push({node: pathNode, name});
    }
  } else if (declarator.id.type === AST_NODE_TYPES.ObjectPattern) {
    for (const property of declarator.id.properties) {
      if (property.type !== AST_NODE_TYPES.Property || property.computed ||
        property.key.type !== AST_NODE_TYPES.Identifier || property.value.type !== AST_NODE_TYPES.Identifier) return null;
      selections.push({name: property.value.name, path: [property.key.name]});
    }
    if (selections.length === 0) return null;
  } else {
    return null;
  }

  // If it was the only use of `useAllState`, the import of `useAllState` is replaced too.
  let replacing: TSESTree.ImportSpecifier | null = null;
  if (isUseAllState && node.callee.type === AST_NODE_TYPES.Identifier) {
    const variable = ASTUtils.findVariable(context.sourceCode.getScope(node.callee), node.callee.name);
    const specifier = variable?.defs[0]?.node;
    if (variable?.references.length === 1 && specifier?.type === AST_NODE_TYPES.ImportSpecifier) replacing = specifier;
  }

  // `kiss.useAllState()` uses `kiss.useSelect()`.
  let useSelect: { name: string, fixes: TSESLint.RuleFix[] } | null;
  if (node.callee.type === AST_NODE_TYPES.MemberExpression) {
    useSelect = {name: `${context.sourceCode.getText(node.callee.object)}.useSelect`, fixes: []};
  } else {
    useSelect = importKissExport(context, fixer, 'useSelect', node, replacing);
  }
  if (!useSelect) return null;

  const indent = indentOf(declaration, context);
  const statements = selections.map(({name, path}) =>
    `const ${name} = ${useSelect!.name}((state: ${typeText}) => state.${path.join('.')});`);

  return [
    ...useSelect.fixes,
    fixer.replaceText(declaration, statements.join(`\n${indent}`)),
    ...replacements.map(({node: pathNode, name}) => fixer.replaceText(pathNode, name)),
  ];
}
