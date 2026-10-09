import { AST_NODE_TYPES, ASTUtils, TSESTree } from '@typescript-eslint/utils';
import { Context, FunctionNode } from '../components.js';
import { contains, createRule, getTypeInfo, isFunction, kissImportName, returnedExpressions, TypeInfo, unwrap } from '../utils.js';

/** Methods that return a new array or object (when called on an array, or on `Object`/`Array`). */
const NEW_VALUE_METHODS = new Set([
  'map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'toSorted', 'toReversed', 'toSpliced', 'with', 'split',
  'keys', 'values', 'entries', 'assign', 'fromEntries', 'from', 'of', 'structuredClone',
]);

/** Methods that strings have too, returning a string. */
const AMBIGUOUS_METHODS = new Set(['slice', 'concat']);

/** Functions that return a new object. */
const NEW_VALUE_FUNCTIONS = new Set(['structuredClone']);

/**
 * Reports a `useObject` whose selector creates new values inside the object or array it returns,
 * like `state.items.filter(...)`, `{ ...state.user }`, or `() => ...`:
 *
 * ```tsx
 * const data = useObject((state: State) => ({ done: state.items.filter((i) => i.done) })); // Warning
 * const data = useObject((state: State) => ({ items: state.items, filter: state.filter })); // OK
 * ```
 *
 * `useObject` compares the values inside the object by identity, so a new value makes the
 * component re-render on every state change. Values that are numbers, strings or booleans are
 * fine, since they are compared by value.
 *
 * No fix.
 */
export default createRule({
  name: 'new-values-in-use-object',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow creating new objects, arrays or functions inside the result of a `useObject` selector.',
    },
    schema: [],
    messages: {
      newValue:
        '`{{text}}` creates a new {{kind}} each time the selector runs. `useObject` compares the values inside ' +
        'the {{container}} by identity, so the component re-renders on every state change. Select the parts it ' +
        'needs, and compute it in the component, or keep it in the state.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    return {
      CallExpression(node) {
        if (kissImportName(node.callee, context) !== 'useObject') return;
        const selector = node.arguments[0];
        if (!selector || !isFunction(selector)) return;

        for (const returned of returnedExpressions(selector)) {
          const container = resolve(unwrap(returned), selector, context);
          const values: TSESTree.Node[] = [];
          if (container.type === AST_NODE_TYPES.ObjectExpression) {
            for (const property of container.properties) {
              if (property.type === AST_NODE_TYPES.Property) values.push(property.value);
            }
          } else if (container.type === AST_NODE_TYPES.ArrayExpression) {
            for (const element of container.elements) {
              if (element && element.type !== AST_NODE_TYPES.SpreadElement) values.push(element);
            }
          } else {
            continue;
          }

          for (const value of values) {
            for (const created of newValuesIn(value, selector, context, typeInfo)) {
              context.report({
                node: created.node,
                messageId: 'newValue',
                data: {
                  text: shortText(context.sourceCode.getText(created.node)),
                  kind: created.kind,
                  container: container.type === AST_NODE_TYPES.ObjectExpression ? 'object' : 'array',
                },
              });
            }
          }
        }
      },
    };
  },
});

function shortText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ');
  return oneLine.length > 50 ? `${oneLine.slice(0, 47)}...` : oneLine;
}

/** If the expression is a `const` declared in the selector, its value. */
function resolve(expression: TSESTree.Node, selector: FunctionNode, context: Context): TSESTree.Node {
  if (expression.type !== AST_NODE_TYPES.Identifier) return expression;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(expression), expression.name)?.defs[0];
  if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || def.node.id !== def.name || !def.node.init) return expression;
  if ((def.parent as TSESTree.VariableDeclaration).kind !== 'const' || !contains(selector.body, def.node)) return expression;
  return unwrap(def.node.init);
}

/**
 * The parts of a value that create a new object, array or function. Looks into the branches of
 * `?:`, `&&`, `||` and `??`, and into `const` variables declared in the selector.
 */
function newValuesIn(
  value: TSESTree.Node,
  selector: FunctionNode,
  context: Context,
  typeInfo: TypeInfo | null,
): { node: TSESTree.Node, kind: string }[] {
  const expression = unwrap(value);
  switch (expression.type) {
    case AST_NODE_TYPES.ObjectExpression:
      return [{node: expression, kind: 'object'}];
    case AST_NODE_TYPES.ArrayExpression:
      return [{node: expression, kind: 'array'}];
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return [{node: expression, kind: 'function'}];
    case AST_NODE_TYPES.NewExpression:
      return [{node: expression, kind: 'object'}];
    case AST_NODE_TYPES.ConditionalExpression:
      return [
        ...newValuesIn(expression.consequent, selector, context, typeInfo),
        ...newValuesIn(expression.alternate, selector, context, typeInfo),
      ];
    case AST_NODE_TYPES.LogicalExpression:
      return [
        ...newValuesIn(expression.left, selector, context, typeInfo),
        ...newValuesIn(expression.right, selector, context, typeInfo),
      ];
    case AST_NODE_TYPES.Identifier: {
      const resolved = resolve(expression, selector, context);
      return resolved === expression ? [] : newValuesIn(resolved, selector, context, typeInfo).slice(0, 1).map(() => ({
        node: expression,
        kind: kindOf(resolved),
      }));
    }
    case AST_NODE_TYPES.CallExpression:
      return createsNewValue(expression, typeInfo) ? [{node: expression, kind: 'array or object'}] : [];
    default:
      return [];
  }
}

function kindOf(node: TSESTree.Node): string {
  switch (node.type) {
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.NewExpression:
      return 'object';
    case AST_NODE_TYPES.ArrayExpression:
      return 'array';
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return 'function';
    default:
      return 'array or object';
  }
}

/**
 * True for calls known to return a new array or object, like `state.items.filter(...)` or
 * `Object.keys(...)`. With type information, only when the result is not a primitive (like a string).
 */
function createsNewValue(call: TSESTree.CallExpression, typeInfo: TypeInfo | null): boolean {
  const callee = unwrap(call.callee);
  let isKnown = false;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    isKnown = NEW_VALUE_FUNCTIONS.has(callee.name);
  } else if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed && callee.property.type === AST_NODE_TYPES.Identifier) {
    const name = callee.property.name;
    const object = unwrap(callee.object);
    const isStatic = object.type === AST_NODE_TYPES.Identifier && (object.name === 'Object' || object.name === 'Array');
    if (isStatic) isKnown = ['keys', 'values', 'entries', 'assign', 'fromEntries', 'from', 'of'].includes(name);
    else isKnown = NEW_VALUE_METHODS.has(name) && !['keys', 'values', 'entries', 'assign', 'fromEntries', 'from', 'of'].includes(name);
  }
  if (!isKnown) return false;
  // Strings have `slice` and `concat` too, so these need type information.
  if (!typeInfo) return !(callee.type === AST_NODE_TYPES.MemberExpression && callee.property.type === AST_NODE_TYPES.Identifier &&
    AMBIGUOUS_METHODS.has(callee.property.name));

  const type = typeInfo.checker.getTypeAtLocation(typeInfo.services.esTreeNodeToTSNodeMap.get(call));
  const types = type.isUnion() ? type.types : [type];
  // Not a primitive, like a string. (Type flags are not used, since their values change between TypeScript versions.)
  const notObjects = ['string', 'number', 'boolean', 'bigint', 'true', 'false', 'null', 'undefined', 'void', 'any', 'unknown', 'never', 'symbol'];
  const {checker} = typeInfo;
  return types.some((t) => !notObjects.includes(checker.typeToString(checker.getBaseTypeOfLiteralType(t))));
}
