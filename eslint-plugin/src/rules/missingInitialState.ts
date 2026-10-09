import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from '../actions.js';
import { createRule, getTypeInfo, isTestFile, kissImportName, memberName, unwrap } from '../utils.js';
import { initialStateOption, stateTypeOfStore, userClassSymbolOfType } from '../stateClasses.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** How the state class declares its static `initialState`, or `unknown` if that's not known. */
type StaticInitialState = 'property' | 'method' | 'none' | 'unknown';

/**
 * Reports a store whose initial state is not the static `initialState` of the state class,
 * which is how the Kiss docs create it:
 *
 * ```ts
 * class State {
 *   static initialState: State = new State({ todoList: TodoList.empty });
 * }
 *
 * const store = createStore<State>({ initialState: new State(...) });     // Warning
 * const store = createStore<State>({ initialState: State.initialState }); // OK
 * ```
 *
 * Reported when the state class has no static `initialState` (property, getter or method), or
 * when the store calls the constructor directly. Not reported for states that are not classes,
 * like `createStore<number>`, or in tests.
 *
 * Fix (suggestion): use `State.initialState`, when the state class has it.
 */
export default createRule({
  name: 'missing-initial-state',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Create the store with the static `initialState` of the state class.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      noStaticInitialState:
        'The state class `{{className}}` has no static `initialState`. Add one, like ' +
        '`static initialState = new {{className}}(...)`, and create the store with `{{className}}.initialState`. ' +
        'This keeps the initial state in one place, to reuse it in tests and to reset the state.',
      useStaticInitialState:
        'Use `{{replacement}}` instead of creating the state here. This keeps the initial state in one place, ' +
        'to reuse it in tests and to reset the state.',
      replace: 'Replace with `{{replacement}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const check = (node: TSESTree.CallExpression | TSESTree.NewExpression) => {
      const kissName = kissImportName(node.callee, context);
      if (!(node.type === AST_NODE_TYPES.CallExpression && kissName === 'createStore') &&
        !(node.type === AST_NODE_TYPES.NewExpression && kissName === 'Store')) return;

      const initialState = initialStateOption(node);
      const stateClass = typeInfo ? stateClassWithTypes(node, initialState) : stateClassWithoutTypes(node, initialState, context);
      if (!stateClass) return;
      const {className, staticInitialState, isNew} = stateClass;
      const reportNode = initialState ?? node.callee;

      if (staticInitialState === 'none') {
        context.report({node: reportNode, messageId: 'noStaticInitialState', data: {className}});
      } else if (isNew) {
        const replacement = `${className}.initialState${staticInitialState === 'method' ? '()' : ''}`;
        context.report({
          node: reportNode,
          messageId: 'useStaticInitialState',
          data: {replacement: staticInitialState === 'unknown' ? `${className}.initialState` : replacement},
          suggest: staticInitialState === 'unknown' ? [] : [{
            messageId: 'replace',
            data: {replacement},
            fix: (fixer) => fixer.replaceText(reportNode, replacement),
          }],
        });
      }
    };

    // With type information: the state type of the created store.
    const stateClassWithTypes = (node: TSESTree.Node, initialState: TSESTree.Expression | null) => {
      const {checker, services} = typeInfo!;
      const tsNode = services.esTreeNodeToTSNodeMap.get(node) as ts.Node;
      const stateType = stateTypeOfStore(checker.getTypeAtLocation(tsNode), tsNode, checker);
      const classSymbol = stateType && userClassSymbolOfType(stateType, typeInfo!);
      if (!classSymbol) return null;

      const staticMember = checker.getTypeOfSymbolAtLocation(classSymbol, tsNode).getProperty('initialState');
      let staticInitialState: StaticInitialState = 'none';
      if (staticMember) {
        const memberType = checker.getTypeOfSymbolAtLocation(staticMember, tsNode);
        staticInitialState = memberType.getCallSignatures().length > 0 ? 'method' : 'property';
      }

      // `new State(...)` of the state class itself.
      const value = initialState && unwrap(initialState);
      let isNew = false;
      if (value?.type === AST_NODE_TYPES.NewExpression && value.callee.type === AST_NODE_TYPES.Identifier) {
        const valueType = checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(value));
        isNew = userClassSymbolOfType(valueType, typeInfo!) === classSymbol;
      }
      const className = isNew ? ((value as TSESTree.NewExpression).callee as TSESTree.Identifier).name : classSymbol.getName();
      return {className, staticInitialState, isNew};
    };

    return {
      CallExpression: check,
      NewExpression: check,
    };
  },
});

// Without type information: the type argument, or the class in `new State(...)` or
// `State.initialState`. Its static `initialState` is only known when it's declared in this file.
function stateClassWithoutTypes(
  node: TSESTree.CallExpression | TSESTree.NewExpression,
  initialState: TSESTree.Expression | null,
  context: Context,
) {
  const typeArgument = node.typeArguments?.params[0];
  let identifier: TSESTree.Identifier | null = null;
  if (typeArgument) {
    if (typeArgument.type !== AST_NODE_TYPES.TSTypeReference || typeArgument.typeName.type !== AST_NODE_TYPES.Identifier ||
      typeArgument.typeArguments) return null;
    identifier = typeArgument.typeName;
  } else {
    const value = initialState && unwrap(initialState);
    if (value?.type === AST_NODE_TYPES.NewExpression && value.callee.type === AST_NODE_TYPES.Identifier) identifier = value.callee;
  }
  if (!identifier) return null;

  const value = initialState && unwrap(initialState);
  const isNew = value?.type === AST_NODE_TYPES.NewExpression && value.callee.type === AST_NODE_TYPES.Identifier &&
    value.callee.name === identifier.name;

  const classNode = classDeclarationOf(identifier, context);
  if (classNode) return {className: identifier.name, staticInitialState: staticInitialStateOf(classNode, context), isNew};

  // A class imported from another file: it may have a static `initialState`.
  const def = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name)?.defs[0];
  if (def?.type !== 'ImportBinding' || def.parent.type !== AST_NODE_TYPES.ImportDeclaration || def.parent.importKind === 'type') return null;
  return {className: identifier.name, staticInitialState: 'unknown' as StaticInitialState, isNew};
}

function staticInitialStateOf(start: TSESTree.ClassDeclaration, context: Context): StaticInitialState {
  const seen = new Set<TSESTree.Node>();
  for (let classNode: TSESTree.ClassDeclaration | null = start; classNode && !seen.has(classNode);) {
    seen.add(classNode);
    for (const member of classNode.body.body) {
      if ((member.type === AST_NODE_TYPES.PropertyDefinition || member.type === AST_NODE_TYPES.MethodDefinition) &&
        member.static && memberName(member) === 'initialState') {
        return member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'method' ? 'method' : 'property';
      }
    }
    if (!classNode.superClass) return 'none';
    if (classNode.superClass.type !== AST_NODE_TYPES.Identifier) return 'unknown';
    classNode = classDeclarationOf(classNode.superClass, context);
    if (!classNode) return 'unknown';
  }
  return 'unknown';
}
