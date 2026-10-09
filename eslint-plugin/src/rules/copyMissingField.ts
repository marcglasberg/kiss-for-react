import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from '../actions.js';
import { createRule, getTypeInfo, memberName, TypeInfo, walk, intrinsicName } from '../utils.js';
import { ClassField, ClassNode, classNameOf, classSymbolOf, fieldsOf, isStateClass, programStateClasses } from '../stateClasses.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const COPY_METHODS = new Set(['copy', 'copyWith']);

// `ts.SymbolFlags.Property`. It never changed, and `typescript` is only imported as a type.
const SYMBOL_PROPERTY = 4;

/**
 * Reports a `copy` (or `copyWith`) method of a state class that can't change some fields,
 * when it lists the fields as parameters, and creates a new instance of the class:
 *
 * ```ts
 * class State {
 *   constructor(readonly name: string, readonly age: number) {}
 *   copy({ name }: { name?: string }) {        // Warning: 'age' is missing.
 *     return new State(name ?? this.name, this.age);
 *   }
 * }
 * ```
 *
 * The fields can be listed as a destructured object, an object type, or separate parameters.
 * A `copy(changes: Partial<State>)` has all fields. Methods that use `...this` or
 * `Object.assign` are not checked. Private fields are not required. Methods like
 * `withName(name)` are not checked, since they change one field on purpose.
 *
 * Fix (suggestion): add the missing fields to the parameters, and use them in place of
 * `this.field` in the `new`. Only offered in the simple cases.
 */
export default createRule({
  name: 'copy-missing-field',
  meta: {
    type: 'problem',
    docs: {
      description: 'Require the `copy` methods of state classes to accept all the fields of the class.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      missingField:
        'The `{{method}}` method of the state class `{{className}}` can\'t change {{fieldList}}. Add {{pronoun}} ' +
        'to its parameters, or the copies always keep the old {{value}}.',
      addFields: 'Add {{fieldList}} to the parameters.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const methods = classNode.body.body.filter((member): member is TSESTree.MethodDefinition =>
        member.type === AST_NODE_TYPES.MethodDefinition && !member.static && member.kind === 'method' &&
        COPY_METHODS.has(memberName(member) ?? '') && !!member.value.body && member.value.params.length > 0);
      if (methods.length === 0 || !classNode.id || !isStateClass(classNode, context, typeInfo)) return;

      const fieldNames = typeInfo ? fieldNamesWithTypes(classNode, typeInfo) : fieldNamesWithoutTypes(classNode, context);
      for (const method of methods) checkMethod(method, classNode, fieldNames);
    };

    const checkMethod = (method: TSESTree.MethodDefinition, classNode: ClassNode, fieldNames: string[]) => {
      const className = classNode.id!.name;

      // It must create a new instance, and not copy all fields with `...this` or `Object.assign`.
      const newExpressions: TSESTree.NewExpression[] = [];
      let copiesAll = false;
      walk(method.value.body!, (node) => {
        if (node.type === AST_NODE_TYPES.NewExpression && node.callee.type === AST_NODE_TYPES.Identifier &&
          node.callee.name === className) newExpressions.push(node);
        if ((node.type === AST_NODE_TYPES.SpreadElement && node.argument.type === AST_NODE_TYPES.ThisExpression) ||
          (node.type === AST_NODE_TYPES.MemberExpression && node.object.type === AST_NODE_TYPES.Identifier &&
            node.object.name === 'Object' && node.property.type === AST_NODE_TYPES.Identifier && node.property.name === 'assign')) {
          copiesAll = true;
        }
      }, true);
      if (newExpressions.length === 0 || copiesAll) return;

      const listed = listedFields(method, fieldNames, typeInfo);
      if (!listed) return;
      const missing = fieldNames.filter((name) => !listed.names.includes(name));
      if (missing.length === 0) return;

      const methodName = memberName(method)!;
      const fix = addFieldsFix(method, classNode, missing, listed, newExpressions, context);
      const fieldList = describe(missing);
      context.report({
        node: method.key,
        messageId: 'missingField',
        data: {
          method: methodName,
          className: classNameOf(classNode),
          fieldList,
          pronoun: missing.length === 1 ? 'it' : 'them',
          value: missing.length === 1 ? 'value' : 'values',
        },
        suggest: fix ? [{messageId: 'addFields', data: {fieldList}, fix}] : [],
      });
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});

// "the field `a`", "the fields `a` and `b`", "the fields `a`, `b` and `c`".
function describe(names: string[]): string {
  const quoted = names.map((name) => `\`${name}\``);
  if (quoted.length === 1) return `the field ${quoted[0]}`;
  return `the fields ${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

interface Listed {
  names: string[];
  /** `copy({ a, b }: { a?: A, b?: B })` or `copy(a?: A, b?: B)`. */
  kind: 'pattern' | 'params' | 'object';
}

// The fields that the method can change, or null if that's not clear.
function listedFields(method: TSESTree.MethodDefinition, fieldNames: string[], typeInfo: TypeInfo | null): Listed | null {
  const params = method.value.params;

  // Separate parameters, named like the fields: `copy(name?: string, age?: number)`.
  const paramNames = params.map((param) => {
    const identifier = param.type === AST_NODE_TYPES.AssignmentPattern ? param.left : param;
    return identifier.type === AST_NODE_TYPES.Identifier ? identifier.name : null;
  });
  if (paramNames.every((name) => name !== null && fieldNames.includes(name))) {
    return {names: paramNames as string[], kind: 'params'};
  }
  if (params.length !== 1) return null;
  const param = params[0].type === AST_NODE_TYPES.AssignmentPattern ? params[0].left : params[0];

  // A destructured object: `copy({ name, age }: ...)`.
  if (param.type === AST_NODE_TYPES.ObjectPattern) {
    const names: string[] = [];
    for (const property of param.properties) {
      if (property.type !== AST_NODE_TYPES.Property || property.computed) return null;
      if (property.key.type === AST_NODE_TYPES.Identifier) names.push(property.key.name);
      else if (property.key.type === AST_NODE_TYPES.Literal) names.push(String(property.key.value));
      else return null;
    }
    return {names, kind: 'pattern'};
  }

  // An object: `copy(changes: { name?: string })` or `copy(changes: Partial<State>)`.
  if (param.type !== AST_NODE_TYPES.Identifier) return null;
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(param) as ts.Node;
    const type = typeInfo.checker.getTypeAtLocation(tsNode);
    if (intrinsicName(type) === 'any' || type.isUnion() && type.types.some((t) => intrinsicName(t) !== 'undefined' && !t.getProperties().length)) return null;
    return {names: typeInfo.checker.getPropertiesOfType(type).map((property) => property.getName()), kind: 'object'};
  }
  const annotation = param.typeAnnotation?.typeAnnotation;
  if (annotation?.type !== AST_NODE_TYPES.TSTypeLiteral) return null;
  const names: string[] = [];
  for (const member of annotation.members) {
    if (member.type === AST_NODE_TYPES.TSPropertySignature && !member.computed && member.key.type === AST_NODE_TYPES.Identifier) {
      names.push(member.key.name);
    } else return null;
  }
  return {names, kind: 'object'};
}

// With type information: the properties of the instance type that are fields, not private.
function fieldNamesWithTypes(classNode: ClassNode, typeInfo: TypeInfo): string[] {
  const symbol = classSymbolOf(classNode, typeInfo);
  if (!symbol) return [];
  const {checker} = typeInfo;
  const {isUserSymbol} = programStateClasses(typeInfo);
  const type = checker.getDeclaredTypeOfSymbol(symbol);
  return checker.getPropertiesOfType(type)
    .filter((property) => {
      if (!(property.flags & SYMBOL_PROPERTY) || !isUserSymbol(property)) return false;
      const declaration = property.valueDeclaration as (ts.Declaration & { name?: ts.Node, modifiers?: ts.NodeArray<ts.Node> }) | undefined;
      if (!declaration) return false;
      if (declaration.name?.getText().startsWith('#')) return false;
      return !declaration.modifiers?.some((modifier) => modifier.getText() === 'private');
    })
    .map((property) => property.getName());
}

// Without type information: the fields of the class, and of its superclasses in this file.
function fieldNamesWithoutTypes(start: ClassNode, context: Context): string[] {
  const names: string[] = [];
  const seen = new Set<TSESTree.Node>();
  for (let classNode: ClassNode | null = start; classNode && !seen.has(classNode);) {
    seen.add(classNode);
    for (const field of fieldsOf(classNode)) if (!field.isPrivate && !names.includes(field.name)) names.push(field.name);
    classNode = classNode.superClass?.type === AST_NODE_TYPES.Identifier ? classDeclarationOf(classNode.superClass, context) : null;
  }
  return names;
}

/**
 * Adds the missing fields to the parameters, and uses them in the `new`: `this.age` becomes
 * `age ?? this.age`. Only in the simple cases: one `new`, which uses each missing field once,
 * as `this.field`, and the fields are declared in the class with a type that can't be null.
 */
function addFieldsFix(
  method: TSESTree.MethodDefinition,
  classNode: ClassNode,
  missing: string[],
  listed: Listed,
  newExpressions: TSESTree.NewExpression[],
  context: Context,
): ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix[]) | null {
  if (newExpressions.length !== 1 || listed.kind === 'object') return null;
  const sourceCode = context.sourceCode;
  const fields = new Map<string, ClassField>(fieldsOf(classNode).map((field) => [field.name, field]));

  const additions: { name: string, type: string, thisField: TSESTree.MemberExpression }[] = [];
  for (const name of missing) {
    const field = fields.get(name);
    if (!field || field.isOptional || !field.typeAnnotation) return null;
    const type = sourceCode.getText(field.typeAnnotation);
    if (/\b(null|undefined|any|unknown)\b/.test(type)) return null;

    const uses: TSESTree.MemberExpression[] = [];
    for (const argument of newExpressions[0].arguments) {
      walk(argument, (node) => {
        if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed && node.object.type === AST_NODE_TYPES.ThisExpression &&
          node.property.type === AST_NODE_TYPES.Identifier && node.property.name === name) uses.push(node);
      });
    }
    if (uses.length !== 1) return null;
    // The name must be free in the method.
    if (ASTUtils.findVariable(sourceCode.getScope(uses[0]), name)) return null;
    additions.push({name, type, thisField: uses[0]});
  }

  const params = method.value.params;
  const lastParam = params[params.length - 1];
  const fixes: ((fixer: TSESLint.RuleFixer) => TSESLint.RuleFix)[] = [];

  if (listed.kind === 'params') {
    if (lastParam.type === AST_NODE_TYPES.RestElement) return null;
    const text = additions.map(({name, type}) => `, ${name}?: ${type}`).join('');
    fixes.push((fixer) => fixer.insertTextAfter(lastParam, text));
  } else {
    const pattern = (params[0].type === AST_NODE_TYPES.AssignmentPattern ? params[0].left : params[0]) as TSESTree.ObjectPattern;
    const literal = pattern.typeAnnotation?.typeAnnotation;
    const lastProperty = pattern.properties[pattern.properties.length - 1];
    if (!lastProperty || literal?.type !== AST_NODE_TYPES.TSTypeLiteral || literal.members.length === 0) return null;
    fixes.push((fixer) => fixer.insertTextAfter(lastProperty, additions.map(({name}) => `, ${name}`).join('')));

    const lastMember = literal.members[literal.members.length - 1];
    const memberText = sourceCode.getText(lastMember);
    const endsWithSeparator = /[;,]$/.test(memberText);
    const separator = memberText.endsWith(',') ? ',' : ';';
    let text: string;
    if (literal.loc.start.line !== literal.loc.end.line) {
      const indent = ' '.repeat(lastMember.loc.start.column);
      text = (endsWithSeparator ? '' : separator) +
        additions.map(({name, type}) => `\n${indent}${name}?: ${type}${endsWithSeparator ? separator : ''}`).join(endsWithSeparator ? '' : separator);
    } else {
      text = endsWithSeparator
        ? additions.map(({name, type}) => ` ${name}?: ${type}${separator}`).join('')
        : additions.map(({name, type}) => `, ${name}?: ${type}`).join('');
    }
    fixes.push((fixer) => fixer.insertTextAfter(lastMember, text));
  }

  for (const {name, thisField} of additions) {
    const parent = thisField.parent;
    const isValue = parent.type === AST_NODE_TYPES.NewExpression || parent.type === AST_NODE_TYPES.CallExpression ||
      parent.type === AST_NODE_TYPES.ArrayExpression ||
      (parent.type === AST_NODE_TYPES.Property && parent.value === thisField);
    const text = isValue ? `${name} ?? this.${name}` : `(${name} ?? this.${name})`;
    fixes.push((fixer) => fixer.replaceText(thisField, text));
  }

  return (fixer) => fixes.map((fix) => fix(fixer));
}
