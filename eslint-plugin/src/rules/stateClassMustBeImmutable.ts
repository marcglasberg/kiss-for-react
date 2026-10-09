import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';
import { createRule, getTypeInfo, walk } from '../utils.js';
import { ClassNode, classNameOf, fieldsOf, isStateClass } from '../stateClasses.js';

/**
 * Reports fields of state classes that are not `readonly`:
 *
 * ```ts
 * class State {
 *   count: number;            // Warning
 *   readonly name: string;    // OK
 * }
 * ```
 *
 * A state class is the `St` of a `Store<St>` or `KissAction<St>`, and the classes it contains.
 * Kiss compares states by identity, so changing a field in place doesn't re-render the
 * components, and isn't persisted.
 *
 * Fix (automatic): add `readonly`. Not offered when the linted file assigns the field outside
 * the constructor, since the code would no longer compile.
 */
export default createRule({
  name: 'state-class-must-be-immutable',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require the fields of state classes to be `readonly`.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      notReadonly:
        'The field `{{field}}` of the state class `{{className}}` should be `readonly`. Kiss compares states by ' +
        'identity, so changing a field in place doesn\'t re-render the components, and isn\'t persisted. ' +
        'Create a new state instead.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    // The names of the fields assigned in this file (`x.name = ...`, `x.name++`, `delete x.name`),
    // with the assignment targets.
    let assignedNames: Map<string, TSESTree.MemberExpression[]> | null = null;
    const assignmentsOf = (name: string) => {
      if (!assignedNames) {
        const map = new Map<string, TSESTree.MemberExpression[]>();
        assignedNames = map;
        walk(context.sourceCode.ast, (node) => {
          const target =
            node.type === AST_NODE_TYPES.AssignmentExpression ? node.left :
              node.type === AST_NODE_TYPES.UpdateExpression ? node.argument :
                node.type === AST_NODE_TYPES.UnaryExpression && node.operator === 'delete' ? node.argument : null;
          if (target?.type !== AST_NODE_TYPES.MemberExpression || target.computed) return;
          const property = target.property;
          const propertyName = property.type === AST_NODE_TYPES.PrivateIdentifier ? `#${property.name}` :
            property.type === AST_NODE_TYPES.Identifier ? property.name : null;
          if (propertyName === null) return;
          map.set(propertyName, [...(map.get(propertyName) ?? []), target]);
        }, true);
      }
      return assignedNames.get(name) ?? [];
    };

    // `this.name = ...` inside the constructor of the class is fine with `readonly`.
    const isInConstructorOf = (target: TSESTree.MemberExpression, classNode: ClassNode) => {
      if (target.object.type !== AST_NODE_TYPES.ThisExpression) return false;
      for (let current: TSESTree.Node | undefined = target.parent; current; current = current.parent) {
        if (current.type === AST_NODE_TYPES.ArrowFunctionExpression) continue;
        if (current.type === AST_NODE_TYPES.FunctionExpression) {
          const method = current.parent;
          return method?.type === AST_NODE_TYPES.MethodDefinition && method.kind === 'constructor' &&
            method.parent.parent === classNode;
        }
        if (current.type === AST_NODE_TYPES.FunctionDeclaration || current.type === AST_NODE_TYPES.ClassBody) return false;
      }
      return false;
    };

    const checkClass = (classNode: ClassNode) => {
      const fields = fieldsOf(classNode).filter((field) => !field.isReadonly);
      if (fields.length === 0 || !isStateClass(classNode, context, typeInfo)) return;

      for (const field of fields) {
        const canFix = assignmentsOf(field.name).every((target) => isInConstructorOf(target, classNode));
        context.report({
          loc: field.loc,
          messageId: 'notReadonly',
          data: {field: field.name, className: classNameOf(classNode)},
          fix: canFix ? (fixer) => fixer.insertTextBefore(field.readonlyPosition, 'readonly ') : null,
        });
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});
