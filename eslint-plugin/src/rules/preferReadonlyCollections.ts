import { AST_NODE_TYPES, ASTUtils, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { createRule, getTypeInfo, isTestFile } from '../utils.js';
import { ClassNode, classNameOf, fieldsOf, isStateClass } from '../stateClasses.js';

const READONLY_NAMES: Record<string, string> = {Array: 'ReadonlyArray', Map: 'ReadonlyMap', Set: 'ReadonlySet'};

/**
 * Reports fields of state classes whose type is a mutable array, `Map` or `Set`:
 *
 * ```ts
 * class State {
 *   readonly users: User[];            // Warning
 *   readonly users: readonly User[];   // OK
 * }
 * ```
 *
 * Only the declared type of the field is checked (and the members of a union), not its type
 * arguments. Not reported in tests.
 *
 * Fix (suggestion): use `readonly T[]`, `ReadonlyArray<T>`, `ReadonlyMap` or `ReadonlySet`.
 */
export default createRule({
  name: 'prefer-readonly-collections',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer `readonly` arrays, `ReadonlyMap` and `ReadonlySet` in the fields of state classes.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      mutable:
        'The field `{{field}}` of the state class `{{className}}` is a mutable {{kind}}. Use `{{readonly}}`, ' +
        'so that TypeScript doesn\'t let the code change it in place. Kiss compares states by identity, so ' +
        'changing the state in place doesn\'t re-render the components.',
      useReadonly: 'Change the type to `{{readonly}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);
    const sourceCode = context.sourceCode;

    // True if the name in `Map<K, V>` is the global `Map` (not a class of the user, for example).
    const isGlobal = (identifier: TSESTree.Identifier) => {
      if (typeInfo) {
        const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(identifier) as ts.Node;
        const symbol = typeInfo.checker.getSymbolAtLocation(tsNode);
        return !!symbol?.declarations?.length &&
          symbol.declarations.every((declaration) => declaration.getSourceFile().isDeclarationFile);
      }
      const variable = ASTUtils.findVariable(sourceCode.getScope(identifier), identifier.name);
      return !variable || variable.defs.length === 0;
    };

    const checkType = (typeNode: TSESTree.TypeNode, field: string, className: string) => {
      let kind: string;
      let readonly: string;
      if (typeNode.type === AST_NODE_TYPES.TSArrayType) {
        kind = 'array';
        readonly = `readonly ${sourceCode.getText(typeNode)}`;
      } else if (typeNode.type === AST_NODE_TYPES.TSTypeReference && typeNode.typeName.type === AST_NODE_TYPES.Identifier &&
        Object.hasOwn(READONLY_NAMES, typeNode.typeName.name) && isGlobal(typeNode.typeName)) {
        const name = typeNode.typeName.name;
        kind = name === 'Array' ? 'array' : `\`${name}\``;
        readonly = READONLY_NAMES[name] + (typeNode.typeArguments ? sourceCode.getText(typeNode.typeArguments) : '');
      } else {
        return;
      }
      context.report({
        node: typeNode,
        messageId: 'mutable',
        data: {field, className, kind, readonly},
        suggest: [{
          messageId: 'useReadonly',
          data: {readonly},
          fix: (fixer) => fixer.replaceText(typeNode, readonly),
        }],
      });
    };

    const checkClass = (classNode: ClassNode) => {
      const fields = fieldsOf(classNode).filter((field) => field.typeAnnotation);
      if (fields.length === 0 || !isStateClass(classNode, context, typeInfo)) return;
      const className = classNameOf(classNode);
      for (const field of fields) {
        const type = field.typeAnnotation!;
        const types = type.type === AST_NODE_TYPES.TSUnionType ? type.types : [type];
        for (const member of types) checkType(member, field.name, className);
      }
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});
