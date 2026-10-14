import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule, isTestFile, kissImportName, unwrap } from '../utils.js';
import { ClassField, ClassNode, classNameOf, fieldsOf, kissTypeName } from '../stateClasses.js';

const EVENT_CLASSES = ['Evt', 'EvtState'];

/**
 * Reports event fields (of type `Evt` or `EvtState`) whose name doesn't end with `Evt`:
 *
 * ```ts
 * class State {
 *   readonly scrollToTop: Evt;             // Warning: name it `scrollToTopEvt`.
 *   readonly changeTextEvent: Evt<string>; // Warning: name it `changeTextEvt`.
 *   readonly scrollToTopEvt: Evt;          // OK
 * }
 * ```
 *
 * The suffix tells, where the field is used, that it's an event that fires once, and not a
 * value to read. A field is an event if its declared type is `Evt` or `EvtState` (or a union
 * with one of them), or, without a declared type, if its initializer is `new Evt(...)`,
 * `Evt.spent()`, or the same with `EvtState`. Reported in any class, not only state classes,
 * since an event field is always meant for the state. Not reported in tests.
 *
 * No quick fix: renaming the field needs all its usages.
 */
export default createRule({
  name: 'event-name-suffix',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Name event fields (`Evt` and `EvtState`) with the `Evt` suffix.',
    },
    schema: [],
    messages: {
      suffix:
        'The field `{{field}}` of `{{className}}` is an event. Name it with the `Evt` suffix, like `{{suggestion}}`, ' +
        'so that it\'s clear it\'s an event that fires once, and not a value to read.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};

    // True if the type is `Evt`, `EvtState` (from Kiss), or a union with one of them.
    const isEventType = (typeNode: TSESTree.TypeNode): boolean => {
      if (typeNode.type === AST_NODE_TYPES.TSUnionType) return typeNode.types.some(isEventType);
      if (typeNode.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const name = kissTypeName(typeNode.typeName, context);
      return name !== null && EVENT_CLASSES.includes(name);
    };

    // True if the value is `new Evt(...)`, `Evt.spent()`, or the same with `EvtState`.
    const isEventValue = (value: TSESTree.Node | null | undefined): boolean => {
      if (!value) return false;
      const expression = unwrap(value);
      let classNode: TSESTree.Node | null = null;
      if (expression.type === AST_NODE_TYPES.NewExpression) {
        classNode = expression.callee;
      } else if (expression.type === AST_NODE_TYPES.CallExpression) {
        const callee = expression.callee;
        if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
          callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'spent') {
          classNode = callee.object;
        }
      }
      if (!classNode) return false;
      const name = kissImportName(classNode, context);
      return name !== null && EVENT_CLASSES.includes(name);
    };

    const checkClass = (classNode: ClassNode) => {
      for (const field of fieldsOf(classNode)) {
        if (field.name.endsWith('Evt')) continue;
        const isEvent = field.typeAnnotation ? isEventType(field.typeAnnotation) : isEventValue(initializerOf(field));
        if (!isEvent) continue;
        context.report({
          loc: field.loc,
          messageId: 'suffix',
          data: {field: field.name, className: classNameOf(classNode), suggestion: suggestedName(field.name)},
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/** The initializer of the field: `= value` in a property, or the default of a parameter property. */
function initializerOf(field: ClassField): TSESTree.Node | null {
  const declaration = field.declaration;
  if (declaration.type === AST_NODE_TYPES.PropertyDefinition) return declaration.value;
  if (declaration.type === AST_NODE_TYPES.TSParameterProperty &&
    declaration.parameter.type === AST_NODE_TYPES.AssignmentPattern) return declaration.parameter.right;
  return null;
}

/** `scrollToTop` → `scrollToTopEvt`, and `scrollToTopEvent` → `scrollToTopEvt`. */
function suggestedName(name: string): string {
  const base = name.replace(/Event$/, '');
  return (base === '' || base === '#' ? name : base) + 'Evt';
}
