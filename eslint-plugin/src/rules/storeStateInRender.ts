import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  canCallHooks,
  Context,
  importKissExport,
  isWritten,
  propertyPath,
  renderingComponentOf,
  runsOnEveryRender,
  storeKind,
  writableTypeName,
} from '../components.js';
import { createRule, getTypeInfo, TypeInfo, unwrap } from '../utils.js';

/**
 * Reports reading `store.state` while a component renders:
 *
 * ```tsx
 * import { store } from './store';
 *
 * function User() {
 *   const name = store.state.user.name;                         // Warning
 *   const name = useSelect((state: State) => state.user.name);  // OK
 * }
 * ```
 *
 * It reads the state once, and the component doesn't re-render when the state changes.
 * Reading `store.state` in event handlers and effects is fine.
 *
 * To know that `store` is a Kiss store, it needs type information, unless the store is created in
 * the same file, or its type is written (`store: Store<State>`).
 *
 * Suggestion: read it with `useSelect`, when the read runs on every render (so that a hook can
 * replace it).
 */
export default createRule({
  name: 'store-state-in-render',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow reading `store.state` while a component renders. Use `useSelect` instead.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      stateInRender:
        '`{{text}}` reads the state only once, while the component renders, so the component doesn\'t ' +
        're-render when the state changes. Use `useSelect` to read the state.',
      useSelect: 'Replace with `{{replacement}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      MemberExpression(node) {
        if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier || node.property.name !== 'state') return;
        if (storeKind(node.object, context, typeInfo) !== 'store') return;
        const component = renderingComponentOf(node);
        if (!component) return;

        const suggestion = selectSuggestion(node, component, context, typeInfo);
        context.report({
          node,
          messageId: 'stateInRender',
          data: {text: context.sourceCode.getText(node)},
          suggest: suggestion ? [suggestion] : [],
        });
      },
    };
  },
});

function selectSuggestion(
  node: TSESTree.MemberExpression,
  component: Parameters<typeof canCallHooks>[0],
  context: Context,
  typeInfo: TypeInfo | null,
): TSESLint.SuggestionReportDescriptor<'useSelect'> | null {
  const {node: pathNode, path} = propertyPath(node);
  if (path.length === 0 || isWritten(pathNode)) return null;
  if (!canCallHooks(component) || !runsOnEveryRender(pathNode, component)) return null;

  const typeText = stateTypeText(node, context, typeInfo);
  if (!typeText) return null;

  const selector = `((state: ${typeText}) => state.${path.join('.')})`;
  // The text of the suggestion uses the name `useSelect`, even if it's imported with another name.
  return {
    messageId: 'useSelect',
    data: {replacement: `useSelect${selector}`},
    fix: (fixer) => {
      const useSelect = importKissExport(context, fixer, 'useSelect', node);
      if (!useSelect) return null;
      return [...useSelect.fixes, fixer.replaceText(pathNode, `${useSelect.name}${selector}`)];
    },
  };
}

/**
 * The type of the state, as it can be written here: the type name (with type information), or
 * the type argument of the store's declaration in this file (`createStore<State>(...)`), or
 * `typeof store.state`.
 */
function stateTypeText(node: TSESTree.MemberExpression, context: Context, typeInfo: TypeInfo | null): string | null {
  if (typeInfo) {
    const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(node));
    const name = writableTypeName(type, node, context, typeInfo);
    if (name) return name;
  }
  const object = unwrap(node.object);
  if (object.type !== AST_NODE_TYPES.Identifier) return null;

  const def = ASTUtils.findVariable(context.sourceCode.getScope(object), object.name)?.defs[0];
  let typeArgument: TSESTree.TypeNode | undefined;
  if (def?.type === 'Variable' && def.node.type === AST_NODE_TYPES.VariableDeclarator && def.node.init) {
    const init = unwrap(def.node.init);
    if (init.type === AST_NODE_TYPES.CallExpression || init.type === AST_NODE_TYPES.NewExpression) typeArgument = init.typeArguments?.params[0];
  }
  const annotation = (def?.name as TSESTree.Identifier | undefined)?.typeAnnotation?.typeAnnotation;
  if (!typeArgument && annotation?.type === AST_NODE_TYPES.TSTypeReference) typeArgument = annotation.typeArguments?.params[0];
  if (typeArgument) return context.sourceCode.getText(typeArgument);

  return `typeof ${object.name}.state`;
}
