import { AST_NODE_TYPES, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  ClassNode,
  classChain,
  extendsClassNamed,
  findMemberInChain,
  findPropertyInChain,
  indentationOf,
  initializerTextOf,
  instanceTypeOfClass,
  isDeclaredByUser,
  isTrue,
  needsOverrideKeyword,
} from '../actionFeatures.js';
import { createRule, getTypeInfo, memberName, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

/** Properties of Kiss actions that configure the action. They are not the action's own data. */
const KISS_PROPERTIES = ['retry', 'checkInternet', 'nonReentrant'];

/**
 * Reports a non-reentrant action with fields, that doesn't override `nonReentrantKeyParams`
 * or `computeNonReentrantKey`. Non-reentrant actions are the ones with `nonReentrant = true`,
 * and the subclasses of `OptimisticCommand`:
 *
 * ```ts
 * class SaveTodo extends OptimisticCommand<State> {  // Warning
 *   constructor(readonly todoId: string) { super(); }
 * }
 *
 * class LoadTodo extends Action {  // Warning
 *   nonReentrant = true;
 *   constructor(readonly todoId: string) { super(); }
 * }
 * ```
 *
 * By default, the non-reentrant key doesn't depend on the fields, so all instances share it.
 * For example, `SaveTodo('A')` then blocks `SaveTodo('B')`. This rule is opt-in, since sharing
 * the key is often intended.
 *
 * Suggestion: override `nonReentrantKeyParams()`, returning the fields.
 */
export default createRule({
  name: 'missing-key-params',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Recommend `nonReentrantKeyParams` in non-reentrant actions with fields.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingKeyParams:
        '`{{action}}` has fields, but its non-reentrant key doesn\'t depend on them. So, while one ' +
        '`{{action}}` runs, any other `{{action}}` is aborted, even with different fields. To let them run ' +
        'at the same time, override `nonReentrantKeyParams()`.',
      addKeyParams: 'Override `nonReentrantKeyParams()`, returning {{fields}}.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      if (classNode.abstract || !classNode.superClass) return;
      if (!isNonReentrantWithoutKey(classNode, context, typeInfo)) return;

      const fields = fieldsOf(classNode);
      if (fields.length === 0) return;

      const name = classNode.id?.name ?? 'This action';
      const values = fields.map((field) => `this.${field.name}`);
      const returned = values.length === 1 ? values[0] : `[${values.join(', ')}]`;
      const override = needsOverrideKeyword(classNode, typeInfo) ? 'override ' : '';
      const after = fields.reduce<TSESTree.Node>((last, field) => field.member.range[1] > last.range[1] ? field.member : last, fields[0].member);

      context.report({
        node: classNode.id ?? classNode.superClass,
        messageId: 'missingKeyParams',
        data: {action: name},
        suggest: [{
          messageId: 'addKeyParams',
          data: {fields: values.map((value) => `\`${value}\``).join(', ')},
          fix: (fixer) => fixer.insertTextAfter(after,
            `\n\n${indentationOf(after, context)}${override}nonReentrantKeyParams() { return ${returned}; }`),
        }],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

/**
 * True if the action is non-reentrant (it extends `OptimisticCommand`, or it or a superclass
 * sets `nonReentrant = true`), and doesn't override how its key is computed.
 */
function isNonReentrantWithoutKey(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const type = instanceTypeOfClass(classNode, typeInfo);
    const nonReentrant = extendsClassNamed(type, 'OptimisticCommand', typeInfo.checker) ||
      (extendsClassNamed(type, 'KissAction', typeInfo.checker) && initializerTextOf(type, 'nonReentrant')?.trim() === 'true');
    return nonReentrant &&
      !isDeclaredByUser(type, 'nonReentrantKeyParams') && !isDeclaredByUser(type, 'computeNonReentrantKey');
  }
  const chain = classChain(classNode, context);
  const property = findPropertyInChain(chain, 'nonReentrant');
  const nonReentrant = chain.end === 'OptimisticCommand' || (chain.end === 'KissAction' && !!property && isTrue(property));
  return nonReentrant &&
    !findMemberInChain(chain, 'nonReentrantKeyParams') && !findMemberInChain(chain, 'computeNonReentrantKey');
}

/**
 * The class's own fields: its constructor's parameter properties (like `readonly todoId: string`),
 * and its properties that are not functions or Kiss's configuration (like `retry`).
 * `member` is the node to insert the new method after (the constructor, or the property).
 */
function fieldsOf(classNode: ClassNode): { name: string, member: TSESTree.Node }[] {
  const fields: { name: string, member: TSESTree.Node }[] = [];
  for (const member of classNode.body.body) {
    if (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor') {
      for (const param of member.value.params) {
        if (param.type !== AST_NODE_TYPES.TSParameterProperty) continue;
        const target = param.parameter.type === AST_NODE_TYPES.AssignmentPattern ? param.parameter.left : param.parameter;
        if (target.type === AST_NODE_TYPES.Identifier) fields.push({name: target.name, member});
      }
    }
    if (member.type === AST_NODE_TYPES.PropertyDefinition && !member.static) {
      const value = member.value;
      if (value && (value.type === AST_NODE_TYPES.ArrowFunctionExpression || value.type === AST_NODE_TYPES.FunctionExpression)) continue;
      const name = member.key.type === AST_NODE_TYPES.PrivateIdentifier ? `#${member.key.name}` : memberName(member);
      if (name && !KISS_PROPERTIES.includes(name) && !name.startsWith('_')) fields.push({name, member});
    }
  }
  return fields;
}
