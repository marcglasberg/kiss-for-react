import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { asyncReducerOf } from './asyncReducers.js';
import { createRule, getTypeInfo, isFunction, isKissActionClass, kissImportName, returnedExpressions, TypeInfo, intrinsicName } from '../utils.js';
import { ClassNode, isKissStoreType } from '../stateClasses.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
type Variable = TSESLint.Scope.Variable;
type FunctionNode = TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | TSESTree.FunctionDeclaration;

const ARRAY_MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill', 'copyWithin']);
const MAP_MUTATORS = new Set(['set', 'delete', 'clear']);
const SET_MUTATORS = new Set(['add', 'delete', 'clear']);

/** The methods that return a new array, instead of changing it. */
const NON_MUTATING: Record<string, string> = {sort: 'toSorted', reverse: 'toReversed', splice: 'toSpliced'};

/** Array methods whose callback gets the elements, like `items.forEach((item) => ...)`. */
const ITERATION_METHODS = new Set(['forEach', 'map', 'filter', 'find', 'findLast', 'some', 'every', 'flatMap']);

/** Methods that return an element of the collection, like `items.at(0)` or `map.get(key)`. */
const ELEMENT_METHODS = new Set(['at', 'get', 'find', 'findLast']);

/**
 * Reports code that changes the state in place, instead of creating a new state:
 *
 * ```ts
 * reduce() {
 *   this.state.items.push(item);                            // Error
 *   this.state.count = 5;                                   // Error
 *   return new State([...this.state.items, item], 5);       // OK
 * }
 * ```
 *
 * Checks `this.state` (and `this.initialState`) in actions, the state parameter of the
 * functions returned by async reducers, of the selectors of `useSelect` and `useObject`, of the
 * conditions of `waitCondition`, `dispatchWhen` and `useDispatchWhen`, and of the function of
 * `UpdateStateAction`, and the state from `useAllState`. Reports assignments (`=`, `+=`,
 * `++`, `delete`), `Object.assign`, and the mutating methods of arrays, maps and sets.
 *
 * Without type information, only the paths that start at the state are checked, like
 * `this.state.items.push(x)`, and the methods of maps and sets are not checked (since state
 * classes often have methods called `add` or `set` that return a new state). With type
 * information, it also follows variables, like `const items = this.state.items`, and only
 * reports the methods of real arrays, maps and sets.
 */
export default createRule({
  name: 'no-state-mutation',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow changing the state in place. Create a new state instead.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      assignment:
        'This changes the state in place. Kiss compares states by identity, so the components don\'t re-render, ' +
        'and the change isn\'t persisted. Create a new state instead.',
      method:
        '`{{method}}` changes the state in place. Kiss compares states by identity, so the components don\'t ' +
        're-render, and the change isn\'t persisted. Create a new state instead{{hint}}.',
      useNonMutating: 'Use `{{method}}`, which returns a new array.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    const analysis = new StateAnalysis(context, typeInfo);

    const checkTarget = (target: TSESTree.Node, node: TSESTree.Node) => {
      const member = unwrapExpression(target);
      if (member.type !== AST_NODE_TYPES.MemberExpression) return;
      if (!analysis.isState(member.object)) return;
      context.report({node, messageId: 'assignment'});
    };

    return {
      AssignmentExpression(node) {
        checkTarget(node.left, node.left);
      },
      UpdateExpression(node) {
        checkTarget(node.argument, node);
      },
      UnaryExpression(node) {
        if (node.operator === 'delete') checkTarget(node.argument, node);
      },
      CallExpression(node) {
        const callee = unwrapExpression(node.callee);
        if (callee.type !== AST_NODE_TYPES.MemberExpression) return;
        const method = propertyName(callee);
        if (!method) return;

        // `Object.assign(this.state, ...)`
        if (method === 'assign' && callee.object.type === AST_NODE_TYPES.Identifier && callee.object.name === 'Object' &&
          isGlobal(callee.object, context)) {
          if (node.arguments[0] && analysis.isState(node.arguments[0])) {
            context.report({node, messageId: 'assignment'});
          }
          return;
        }

        if (!ARRAY_MUTATORS.has(method) && !MAP_MUTATORS.has(method) && !SET_MUTATORS.has(method)) return;
        if (!analysis.isState(callee.object)) return;

        const kind = analysis.collectionKind(callee.object);
        const isMutator = kind === 'array' ? ARRAY_MUTATORS.has(method)
          : kind === 'map' ? MAP_MUTATORS.has(method)
            : kind === 'set' ? SET_MUTATORS.has(method)
              // Unknown type: only the array methods, since state classes often have `add` or `set` methods.
              : kind === 'unknown' ? ARRAY_MUTATORS.has(method) : false;
        if (!isMutator) return;

        // `sort` and `reverse` have versions that return a new array, when the result is used.
        const alternative = NON_MUTATING[method];
        const canSuggest = !!alternative && kind === 'array' && typeInfo !== null &&
          node.parent.type !== AST_NODE_TYPES.ExpressionStatement &&
          analysis.hasProperty(callee.object, alternative) && !callee.computed;
        context.report({
          node: callee,
          messageId: 'method',
          data: {method, hint: alternative ? `, for example with \`${alternative}\`` : ''},
          suggest: canSuggest ? [{
            messageId: 'useNonMutating',
            data: {method: alternative},
            fix: (fixer) => fixer.replaceText(callee.property, alternative),
          }] : [],
        });
      },
    };
  },
});

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  while (
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion ||
    node.type === AST_NODE_TYPES.ChainExpression
    ) {
    node = node.expression;
  }
  return node;
}

function propertyName(member: TSESTree.MemberExpression): string | null {
  if (!member.computed && member.property.type === AST_NODE_TYPES.Identifier) return member.property.name;
  if (member.computed && member.property.type === AST_NODE_TYPES.Literal && typeof member.property.value === 'string') {
    return member.property.value;
  }
  return null;
}

/** The name of the function or method called: `f` in `f(...)`, `obj.f(...)` or `this.f(...)`. */
function calleeName(callee: TSESTree.Node): string | null {
  const node = unwrapExpression(callee);
  if (node.type === AST_NODE_TYPES.Identifier) return node.name;
  if (node.type === AST_NODE_TYPES.MemberExpression) return propertyName(node);
  return null;
}

function isGlobal(identifier: TSESTree.Identifier, context: Context): boolean {
  const variable = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name);
  return !variable || variable.defs.length === 0;
}

/** Finds out which expressions are (or are part of) the state. */
class StateAnalysis {
  private readonly rootVariables = new Map<Variable, boolean>();
  private readonly stateFunctions = new Map<FunctionNode, boolean>();
  private readonly actionClasses = new Map<ClassNode, boolean>();

  constructor(private readonly context: Context, private readonly typeInfo: TypeInfo | null) {}

  /**
   * True if the expression is the state, or a value read from it: `this.state`, `this.state.items`,
   * `state.items[0]` (where `state` is the parameter of a selector), and so on.
   */
  isState(expression: TSESTree.Node): boolean {
    const node = unwrapExpression(expression);
    if (node.type === AST_NODE_TYPES.Identifier) {
      const variable = ASTUtils.findVariable(this.context.sourceCode.getScope(node), node.name);
      return !!variable && this.isStateVariable(variable);
    }
    if (node.type === AST_NODE_TYPES.MemberExpression) {
      const name = propertyName(node);
      // `this.state` and `this.initialState` in an action.
      if (node.object.type === AST_NODE_TYPES.ThisExpression) {
        return (name === 'state' || name === 'initialState') && !node.computed && this.isActionThis(node.object);
      }
      // `store.state`, with type information.
      if (name === 'state' && !node.computed && this.typeInfo && isKissStoreType(this.typeOf(node.object))) return true;
      return this.isState(node.object);
    }
    // `this.state.items.at(0)`, or `this.state.users.get(id)`, with type information.
    if (node.type === AST_NODE_TYPES.CallExpression && this.typeInfo) {
      const callee = unwrapExpression(node.callee);
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return false;
      const method = propertyName(callee);
      if (!method || !ELEMENT_METHODS.has(method) || !this.isState(callee.object)) return false;
      const kind = this.collectionKind(callee.object);
      return kind === 'array' || (kind === 'map' && method === 'get');
    }
    return false;
  }

  /**
   * The kind of collection of the expression: with type information, `array`, `map`, `set`, or
   * `other` (not a collection); without it, `unknown`.
   */
  collectionKind(expression: TSESTree.Node): 'array' | 'map' | 'set' | 'other' | 'unknown' {
    if (!this.typeInfo) return 'unknown';
    const {checker} = this.typeInfo;
    const type = checker.getNonNullableType(this.typeOf(expression));
    if (intrinsicName(type) === 'any') return 'unknown';
    const kinds = new Set((type.isUnion() ? type.types : [type]).map((member) => {
      if (checker.isArrayType(member) || checker.isTupleType(member)) return 'array';
      const name = member.getSymbol()?.getName();
      const isLibrary = !!member.getSymbol()?.getDeclarations()?.every((d) => d.getSourceFile().isDeclarationFile);
      if (isLibrary && (name === 'Map' || name === 'WeakMap')) return 'map';
      if (isLibrary && (name === 'Set' || name === 'WeakSet')) return 'set';
      return 'other';
    }));
    return kinds.size === 1 ? [...kinds][0] as 'array' | 'map' | 'set' | 'other' : 'other';
  }

  hasProperty(expression: TSESTree.Node, name: string): boolean {
    return !!this.typeInfo?.checker.getNonNullableType(this.typeOf(expression)).getProperty(name);
  }

  private typeOf(node: TSESTree.Node): ts.Type {
    const {checker, services} = this.typeInfo!;
    return checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(node));
  }

  /** True if `this` is the instance of a Kiss action (in a method or property of the action class). */
  private isActionThis(thisNode: TSESTree.ThisExpression): boolean {
    for (let current: TSESTree.Node | undefined = thisNode.parent; current; current = current.parent) {
      if (current.type === AST_NODE_TYPES.ArrowFunctionExpression) continue;
      if (current.type === AST_NODE_TYPES.FunctionExpression) {
        const method = current.parent;
        if (method?.type !== AST_NODE_TYPES.MethodDefinition || method.static || method.value !== current) return false;
        return this.isActionClass(method.parent.parent);
      }
      if (current.type === AST_NODE_TYPES.PropertyDefinition) {
        return !current.static && this.isActionClass(current.parent.parent);
      }
      if (current.type === AST_NODE_TYPES.FunctionDeclaration || current.type === AST_NODE_TYPES.ClassBody ||
        current.type === AST_NODE_TYPES.StaticBlock || current.type === AST_NODE_TYPES.Program) return false;
    }
    return false;
  }

  private isActionClass(classNode: ClassNode): boolean {
    let result = this.actionClasses.get(classNode);
    if (result === undefined) {
      result = isKissActionClass(classNode, this.typeInfo);
      this.actionClasses.set(classNode, result);
    }
    return result;
  }

  /** True if the variable holds the state, or a value read from it. */
  private isStateVariable(variable: Variable): boolean {
    const cached = this.rootVariables.get(variable);
    if (cached !== undefined) return cached;
    this.rootVariables.set(variable, false); // Avoids loops.
    const result = this.computeIsStateVariable(variable);
    this.rootVariables.set(variable, result);
    return result;
  }

  private computeIsStateVariable(variable: Variable): boolean {
    const def = variable.defs[0];
    if (!def || variable.defs.length > 1) return false;

    // The first parameter of a function that gets the state, like `(state: State) => state.items`.
    if (def.type === 'Parameter') {
      const fn = def.node as FunctionNode;
      if (!isFunction(fn) || fn.params.length === 0) return false;
      const first = fn.params[0];
      if (def.name.range[0] < first.range[0] || def.name.range[1] > first.range[1]) return false;
      return this.isStateFunction(fn);
    }

    if (def.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator) return false;
    // Only variables that are never assigned again.
    if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return false;
    const declarator = def.node;
    const declaration = declarator.parent as TSESTree.VariableDeclaration;

    // `for (const item of this.state.items)`, with type information.
    if (declaration.parent?.type === AST_NODE_TYPES.ForOfStatement && declaration.parent.left === declaration) {
      return !!this.typeInfo && this.isState(declaration.parent.right);
    }
    if (!declarator.init) return false;
    const init = unwrapExpression(declarator.init);
    const isWholeValue = declarator.id.type === AST_NODE_TYPES.Identifier;

    // `const state = useAllState()`, and `const items = useSelect((state: State) => state.items)`.
    if (init.type === AST_NODE_TYPES.CallExpression && isWholeValue) {
      const hook = kissImportName(init.callee, this.context);
      if (hook === 'useAllState') return true;
      if (hook === 'useSelect' || hook === 'useSelector') {
        const selector = init.arguments[0];
        if (!selector || !isFunction(selector)) return false;
        const returned = returnedExpressions(selector);
        return returned.length > 0 && returned.every((expression) => this.isState(expression));
      }
    }

    // `const items = this.state.items`, or `const { items } = this.state`, with type information.
    return !!this.typeInfo && this.isState(init);
  }

  /** True if the function gets the state as its first parameter. */
  private isStateFunction(fn: FunctionNode): boolean {
    let result = this.stateFunctions.get(fn);
    if (result === undefined) {
      result = this.computeIsStateFunction(fn);
      this.stateFunctions.set(fn, result);
    }
    return result;
  }

  private computeIsStateFunction(fn: FunctionNode): boolean {
    const parent = fn.parent;
    if (!parent) return false;

    if (parent.type === AST_NODE_TYPES.CallExpression) {
      const index = parent.arguments.indexOf(fn as TSESTree.CallExpressionArgument);
      if (index < 0) return false;
      const kissName = kissImportName(parent.callee, this.context);
      if ((kissName === 'useSelect' || kissName === 'useSelector' || kissName === 'useObject') && index === 0) return true;
      const name = calleeName(parent.callee);
      if (name === 'waitCondition' && index === 0) return true;
      if (index === 1 && (name === 'dispatchWhen' || this.isUseDispatchWhenResult(parent.callee))) return true;

      // `this.state.items.forEach((item) => ...)`, with type information.
      if (this.typeInfo && index === 0) {
        const callee = unwrapExpression(parent.callee);
        if (callee.type === AST_NODE_TYPES.MemberExpression && ITERATION_METHODS.has(propertyName(callee) ?? '') &&
          this.isState(callee.object) && this.collectionKind(callee.object) === 'array') return true;
      }
      return false;
    }

    // `new UpdateStateAction((state: State) => ...)`
    if (parent.type === AST_NODE_TYPES.NewExpression) {
      return parent.arguments[0] === fn && kissImportName(parent.callee, this.context) === 'UpdateStateAction';
    }

    // The function returned by an async `reduce`.
    if (fn.type === AST_NODE_TYPES.ArrowFunctionExpression) {
      for (let current: TSESTree.Node | undefined = parent; current; current = current.parent) {
        if (current.type === AST_NODE_TYPES.MethodDefinition) {
          const classNode = current.parent.parent;
          return !!asyncReducerOf(classNode, this.context, this.typeInfo)?.returnedFunctions.includes(fn);
        }
        if (current.type === AST_NODE_TYPES.ClassBody || current.type === AST_NODE_TYPES.Program) return false;
      }
    }
    return false;
  }

  // `dispatchWhen(...)`, where `const dispatchWhen = useDispatchWhen()`.
  private isUseDispatchWhenResult(callee: TSESTree.Node): boolean {
    const node = unwrapExpression(callee);
    if (node.type !== AST_NODE_TYPES.Identifier) return false;
    const def = ASTUtils.findVariable(this.context.sourceCode.getScope(node), node.name)?.defs[0];
    if (def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator || !def.node.init) return false;
    const init = unwrapExpression(def.node.init);
    return init.type === AST_NODE_TYPES.CallExpression && kissImportName(init.callee, this.context) === 'useDispatchWhen';
  }
}
