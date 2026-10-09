import type * as ts from 'typescript';
import { createRule, getTypeInfo, TypeInfo } from '../utils.js';
import { ClassNode, classNameOf, fieldsOf, isStateClass } from '../stateClasses.js';

/** Objects that do work or hold resources. They belong outside the state. */
const RESOURCE_NAMES = new Set([
  'Promise', 'PromiseLike', 'AbortController', 'AbortSignal', 'WebSocket', 'EventSource', 'Worker', 'SharedWorker',
]);

/** Objects of the UI. They belong in the component. */
const UI_NAMES = new Set([
  'Node', 'Element', 'HTMLElement',
  'React.RefObject', 'React.MutableRefObject', 'React.ReactElement', 'React.ReactNode', 'React.ReactPortal',
  'JSX.Element', 'React.JSX.Element',
]);

/** Node's timers, like `NodeJS.Timeout`. In the browser, timers are numbers, and are fine. */
const TIMER_NAMES = new Set(['Timeout', 'Timer', 'Immediate']);

interface Found {
  name: string;
  kind: 'resource' | 'ui';
}

/**
 * Reports fields of state classes that hold objects that are not state:
 *
 * - A `Promise`, a Node timer (`NodeJS.Timeout`), an `AbortController`, an `AbortSignal`, a
 *   `WebSocket`, an `EventSource` or a `Worker`.
 * - A DOM node (`Node`, `Element`, `HTMLElement`), a React ref (`RefObject`), or a React
 *   element (`ReactElement`, `ReactNode`, `JSX.Element`).
 *
 * Subclasses, union members, type arguments and array elements are checked too, like
 * `Promise<User>[]`. Functions are fine. Needs type information.
 */
export default createRule({
  name: 'non-state-object-in-state',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow objects that are not state, like promises, timers, DOM nodes and React elements, in the state.',
    },
    schema: [],
    messages: {
      resource:
        'The field `{{field}}` of the state class `{{className}}` holds a `{{type}}`, which is not state: it ' +
        'can\'t be compared, saved or restored. Keep it outside the state, for example in a module, or in the ' +
        'action that uses it.',
      ui:
        'The field `{{field}}` of the state class `{{className}}` holds a `{{type}}`, which is not state: it ' +
        'belongs to the UI, and can\'t be saved or restored. Keep it in the component.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    if (!typeInfo) return {};

    const checkClass = (classNode: ClassNode) => {
      const fields = fieldsOf(classNode);
      if (fields.length === 0 || !isStateClass(classNode, context, typeInfo)) return;
      for (const field of fields) {
        const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(field.node) as ts.Node;
        const found = findNonState(typeInfo.checker.getTypeAtLocation(tsNode), typeInfo, new Set(), 0);
        if (!found) continue;
        context.report({
          loc: field.loc,
          messageId: found.kind,
          data: {field: field.name, className: classNameOf(classNode), type: found.name},
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

// The first object that is not state in the type: the type itself, its superclasses, its union
// members, or its type arguments.
function findNonState(type: ts.Type, typeInfo: TypeInfo, seen: Set<ts.Type>, depth: number): Found | null {
  if (depth > 6 || seen.has(type)) return null;
  seen.add(type);
  const {checker} = typeInfo;

  const byAlias = type.aliasSymbol && foundOf(type.aliasSymbol, checker);
  if (byAlias) return byAlias;

  if (type.isUnion() || type.isIntersection()) {
    for (const member of type.types) {
      const found = findNonState(member, typeInfo, seen, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const symbol = type.getSymbol();
  const bySymbol = symbol && foundOf(symbol, checker);
  if (bySymbol) return bySymbol;

  const target = (type as ts.TypeReference).target;
  const typeArguments = [
    ...(target ? checker.getTypeArguments(type as ts.TypeReference) : []),
    ...(type.aliasTypeArguments ?? []),
  ];
  for (const typeArgument of typeArguments) {
    const found = findNonState(typeArgument, typeInfo, seen, depth + 1);
    if (found) return found;
  }

  // Subclasses, like `class Task extends Promise<void>` or `interface HTMLDivElement extends HTMLElement`.
  const declared = target ?? type;
  if (declared.isClassOrInterface()) {
    for (const base of checker.getBaseTypes(declared)) {
      const found = findNonState(base, typeInfo, seen, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

// If the symbol is one of the types that are not state, declared in a library (not by the user).
function foundOf(symbol: ts.Symbol, checker: ts.TypeChecker): Found | null {
  const declarations = symbol.getDeclarations();
  if (!declarations?.length || !declarations.every((d) => d.getSourceFile().isDeclarationFile)) return null;
  const fullName = checker.getFullyQualifiedName(symbol).replace(/^global\./, '');
  if (RESOURCE_NAMES.has(fullName)) return {name: fullName, kind: 'resource'};
  if (UI_NAMES.has(fullName)) return {name: fullName, kind: 'ui'};
  if (TIMER_NAMES.has(symbol.getName()) && fullName.startsWith('NodeJS.')) return {name: fullName, kind: 'resource'};
  return null;
}
