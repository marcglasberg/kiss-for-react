import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from './actions.js';
import { KISS_PACKAGE, kissImportName, memberName, TypeInfo, unwrap, walk } from './utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;
export type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

// The values of `ts.SymbolFlags` used here. They never changed, and `typescript` is only
// imported as a type, since it's an optional dependency.
const SYMBOL_PROPERTY = 4;
const SYMBOL_CLASS = 32;

/**
 * A field of a class: a property declared in the class body, like `readonly name: string`,
 * or a parameter property of its constructor, like `constructor(readonly name: string)`.
 */
export interface ClassField {
  name: string;
  /** The key of the property, or the parameter (whose range includes its type). */
  node: TSESTree.Node;
  /** Where to report: the name of the field. */
  loc: TSESTree.SourceLocation;
  /** The property, or the parameter property. */
  declaration: TSESTree.PropertyDefinition | TSESTree.TSAbstractPropertyDefinition | TSESTree.TSParameterProperty;
  /** Where `readonly` goes: just before this node. */
  readonlyPosition: TSESTree.Node;
  isReadonly: boolean;
  /** `private`, or a `#name`. */
  isPrivate: boolean;
  /** `name?: T`. */
  isOptional: boolean;
  typeAnnotation: TSESTree.TypeNode | null;
}

/** The instance fields declared in the class itself (not inherited), in source order. */
export function fieldsOf(classNode: ClassNode): ClassField[] {
  const fields: ClassField[] = [];
  for (const member of classNode.body.body) {
    if ((member.type === AST_NODE_TYPES.PropertyDefinition || member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition) &&
      !member.static && !member.declare && !member.computed) {
      const isHash = member.key.type === AST_NODE_TYPES.PrivateIdentifier;
      const name = isHash ? `#${(member.key as TSESTree.PrivateIdentifier).name}` : memberName(member);
      if (name === null) continue;
      fields.push({
        name,
        node: member.key,
        loc: member.key.loc,
        declaration: member,
        readonlyPosition: member.key,
        isReadonly: member.readonly,
        isPrivate: isHash || member.accessibility === 'private',
        isOptional: member.optional,
        typeAnnotation: member.typeAnnotation?.typeAnnotation ?? null,
      });
    }
    if (member.type === AST_NODE_TYPES.MethodDefinition && member.kind === 'constructor') {
      for (const param of member.value.params) {
        if (param.type !== AST_NODE_TYPES.TSParameterProperty) continue;
        const parameter = param.parameter;
        const identifier = parameter.type === AST_NODE_TYPES.AssignmentPattern ? parameter.left : parameter;
        if (identifier.type !== AST_NODE_TYPES.Identifier) continue;
        fields.push({
          name: identifier.name,
          node: identifier,
          loc: {
            start: identifier.loc.start,
            end: {line: identifier.loc.start.line, column: identifier.loc.start.column + identifier.name.length},
          },
          declaration: param,
          readonlyPosition: parameter,
          isReadonly: param.readonly,
          isPrivate: param.accessibility === 'private',
          isOptional: identifier.optional || parameter.type === AST_NODE_TYPES.AssignmentPattern,
          typeAnnotation: identifier.typeAnnotation?.typeAnnotation ?? null,
        });
      }
    }
  }
  return fields;
}

/** The name of the class, for messages. */
export function classNameOf(classNode: ClassNode): string {
  return classNode.id?.name ?? 'anonymous class';
}

/**
 * True if the class is a state class: the state `St` of a `KissAction<St>`, `Store<St>` or
 * `createStore<St>`, or a class it contains (the types of its fields, recursively, including
 * array elements, `Map` and `Set` type arguments, and unions), or a superclass of those.
 *
 * With type information, the whole program is searched (once per program). Without it, only
 * the linted file is searched, and only classes declared in it are found.
 */
export function isStateClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const symbol = classSymbolOf(classNode, typeInfo);
    return !!symbol && programStateClasses(typeInfo).classes.has(symbol);
  }
  return fileStateClasses(context).has(classNode);
}

/** The symbol of a class node, with type information. */
export function classSymbolOf(classNode: ClassNode, typeInfo: TypeInfo): ts.Symbol | undefined {
  const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode) as ts.ClassLikeDeclaration;
  if (!tsNode.name) return undefined;
  return typeInfo.checker.getSymbolAtLocation(tsNode.name);
}

// ----------------------------------------------------------------------------------------------
// With type information.

export interface ProgramInfo {
  /** The symbols of the state classes. */
  classes: Set<ts.Symbol>;
  /** True if the file is the user's source: not a `.d.ts`, not in `node_modules`, not Kiss itself. */
  isUserFile(sourceFile: ts.SourceFile): boolean;
  /** True if the symbol is declared in the user's source. */
  isUserSymbol(symbol: ts.Symbol): boolean;
}

const programCache = new WeakMap<ts.Program, ProgramInfo>();

// The nodes of a source file that may tell a state type. Source files that didn't change are
// reused by new programs, so this is only computed again for files that changed.
const candidatesCache = new WeakMap<ts.SourceFile, ts.Node[]>();

/** The state classes of the program. Computed once per program. */
export function programStateClasses(typeInfo: TypeInfo): ProgramInfo {
  const program = typeInfo.services.program;
  let info = programCache.get(program);
  if (!info) {
    info = computeProgramInfo(program, typeInfo.checker);
    programCache.set(program, info);
  }
  return info;
}

function computeProgramInfo(program: ts.Program, checker: ts.TypeChecker): ProgramInfo {
  const sourceFiles = program.getSourceFiles();

  // Kiss's own source files, when Kiss is not in `node_modules` (as in the Kiss repo itself).
  const kissDirs = sourceFiles
    .filter((sf) => !sf.isDeclarationFile && /\bclass KissAction\b/.test(sf.text))
    .map((sf) => sf.fileName.replace(/\\/g, '/').replace(/[^/]*$/, ''));

  const userFileCache = new Map<ts.SourceFile, boolean>();
  const isUserFile = (sf: ts.SourceFile): boolean => {
    let result = userFileCache.get(sf);
    if (result === undefined) {
      const fileName = sf.fileName.replace(/\\/g, '/');
      result = !sf.isDeclarationFile &&
        !program.isSourceFileFromExternalLibrary(sf) &&
        !fileName.includes('/node_modules/') &&
        !kissDirs.some((dir) => fileName.startsWith(dir));
      userFileCache.set(sf, result);
    }
    return result;
  };
  const isUserSymbol = (symbol: ts.Symbol) =>
    !!symbol.declarations?.some((declaration) => isUserFile(declaration.getSourceFile()));

  const classes = new Set<ts.Symbol>();
  const seen = new Set<ts.Type>();

  const collectProperties = (type: ts.Type) => {
    for (const property of checker.getPropertiesOfType(type)) {
      if (!(property.flags & SYMBOL_PROPERTY)) continue;
      const declaration = property.valueDeclaration ?? property.declarations?.[0];
      if (!declaration) continue;
      collect(checker.getTypeOfSymbolAtLocation(property, declaration));
    }
  };

  const collect = (type: ts.Type) => {
    if (seen.has(type)) return;
    seen.add(type);
    if (type.isUnion() || type.isIntersection()) {
      type.types.forEach(collect);
      return;
    }
    type.aliasTypeArguments?.forEach(collect);
    const target = (type as ts.TypeReference).target;
    if (target) checker.getTypeArguments(type as ts.TypeReference).forEach(collect);

    const declared: ts.Type = target ?? type;
    const symbol = declared.getSymbol();
    if (!symbol || !isUserSymbol(symbol)) return;
    if (declared.isClass()) {
      if (classes.has(symbol)) return;
      classes.add(symbol);
      checker.getBaseTypes(declared).forEach(collect);
      collectProperties(declared);
    } else if (declared.getCallSignatures().length === 0 && declared.getConstructSignatures().length === 0) {
      // Interfaces and object types declared by the user, like `interface State { user: User }`.
      collectProperties(type);
    }
  };

  for (const sf of sourceFiles) {
    if (!isUserFile(sf)) continue;
    for (const node of candidatesOf(sf)) {
      const stateType = stateTypeOfCandidate(node, checker);
      if (stateType) collect(stateType);
    }
  }

  return {classes, isUserFile, isUserSymbol};
}

// Classes with an `extends` clause, `new Store(...)`, `createStore(...)`, and `Store<X>` types.
function candidatesOf(sf: ts.SourceFile): ts.Node[] {
  let candidates = candidatesCache.get(sf);
  if (candidates) return candidates;
  candidates = [];
  const result = candidates;
  const mayHaveStore = sf.text.includes('Store');
  const visit = (node: ts.Node): void => {
    const any = node as any;
    if (Array.isArray(any.heritageClauses) && any.heritageClauses.length > 0 && Array.isArray(any.members) && any.name) {
      result.push(node);
    } else if (mayHaveStore && 'arguments' in any && any.expression) {
      const name = nameOfTsExpression(any.expression);
      if (name === 'Store' || name === 'createStore') result.push(node);
    } else if (mayHaveStore && any.typeName) {
      const name = any.typeName.escapedText ?? any.typeName.right?.escapedText;
      if (name === 'Store') result.push(node);
    }
    node.forEachChild(visit);
  };
  sf.forEachChild(visit);
  candidatesCache.set(sf, candidates);
  return candidates;
}

function nameOfTsExpression(expression: any): string | undefined {
  return expression.escapedText ?? expression.name?.escapedText;
}

// The state type that a candidate node tells, if any.
function stateTypeOfCandidate(node: ts.Node, checker: ts.TypeChecker): ts.Type | null {
  const any = node as any;
  if (any.heritageClauses) {
    const symbol = checker.getSymbolAtLocation(any.name);
    if (!symbol || !(symbol.flags & SYMBOL_CLASS)) return null;
    const type = checker.getDeclaredTypeOfSymbol(symbol);
    if (!extendsKissAction(type, checker, new Set())) return null;
    const state = type.getProperty('state');
    return state ? checker.getTypeOfSymbolAtLocation(state, node) : null;
  }
  return stateTypeOfStore(checker.getTypeAtLocation(node), node, checker);
}

/** If the type is a Kiss `Store<St>`, returns `St`. */
export function stateTypeOfStore(type: ts.Type, location: ts.Node, checker: ts.TypeChecker): ts.Type | null {
  if (!isKissStoreType(type)) return null;
  return checker.getTypeOfSymbolAtLocation(type.getProperty('state')!, location);
}

/** True if the type is a Kiss `Store`. */
export function isKissStoreType(type: ts.Type): boolean {
  return type.getSymbol()?.getName() === 'Store' && !!type.getProperty('dispatchAndWait') && !!type.getProperty('state');
}

function extendsKissAction(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const target = (type as ts.TypeReference).target ?? type;
  if (target.getSymbol()?.getName() === 'KissAction' && !!target.getProperty('reduce')) return true;
  const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
  return bases.some((base) => extendsKissAction(base, checker, seen));
}

/** If the type is a class declared in the user's source, returns its symbol. */
export function userClassSymbolOfType(type: ts.Type, typeInfo: TypeInfo): ts.Symbol | null {
  const declared = (type as ts.TypeReference).target ?? type;
  const symbol = declared.getSymbol();
  if (!symbol || !declared.isClass()) return null;
  return programStateClasses(typeInfo).isUserSymbol(symbol) ? symbol : null;
}

// ----------------------------------------------------------------------------------------------
// Without type information: only the linted file.

const fileCache = new WeakMap<TSESTree.Program, Set<ClassNode>>();

function fileStateClasses(context: Context): Set<ClassNode> {
  const ast = context.sourceCode.ast;
  let classes = fileCache.get(ast);
  if (!classes) {
    classes = computeFileStateClasses(context);
    fileCache.set(ast, classes);
  }
  return classes;
}

function computeFileStateClasses(context: Context): Set<ClassNode> {
  const classes = new Set<ClassNode>();

  const addClass = (classNode: ClassNode | null) => {
    if (!classNode || classes.has(classNode)) return;
    classes.add(classNode);
    if (classNode.superClass?.type === AST_NODE_TYPES.Identifier) addClass(classDeclarationOf(classNode.superClass, context));
    for (const field of fieldsOf(classNode)) {
      if (field.typeAnnotation) addTypeNode(field.typeAnnotation);
      const value = field.declaration.type !== AST_NODE_TYPES.TSParameterProperty ? field.declaration.value : null;
      if (value) addClassOfValue(value);
    }
  };

  // All the classes named in a type, like `User`, `User[]`, `Map<string, User>` or `User | null`.
  const addTypeNode = (typeNode: TSESTree.Node) => {
    walk(typeNode, (node) => {
      if (node.type === AST_NODE_TYPES.TSTypeReference && node.typeName.type === AST_NODE_TYPES.Identifier) {
        addClass(classDeclarationOf(node.typeName, context));
      }
    }, true);
  };

  // `new State(...)`, `State.initialState` or `State.initialState()`.
  const addClassOfValue = (value: TSESTree.Node) => {
    const identifier = classIdentifierOfValue(value);
    if (identifier) addClass(classDeclarationOf(identifier, context));
  };

  walk(context.sourceCode.ast, (node) => {
    // `class Action extends KissAction<State>`
    if ((node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression) &&
      node.superClass && node.superTypeArguments && kissImportName(node.superClass, context) === 'KissAction') {
      addTypeNode(node.superTypeArguments.params[0]);
    }
    // `Store<State>`, `KissAction<State>`
    if (node.type === AST_NODE_TYPES.TSTypeReference && node.typeArguments) {
      const name = kissTypeName(node.typeName, context);
      if (name === 'Store' || name === 'KissAction') addTypeNode(node.typeArguments.params[0]);
    }
    // `createStore<State>(...)`, `new Store<State>(...)`, or with an `initialState` of a class.
    if ((node.type === AST_NODE_TYPES.CallExpression && kissImportName(node.callee, context) === 'createStore') ||
      (node.type === AST_NODE_TYPES.NewExpression && kissImportName(node.callee, context) === 'Store')) {
      if (node.typeArguments) addTypeNode(node.typeArguments.params[0]);
      else {
        const initialState = initialStateOption(node);
        if (initialState) addClassOfValue(initialState);
      }
    }
  }, true);

  return classes;
}

/** The `initialState` option of `createStore({ initialState: ... })` or `new Store({ ... })`. */
export function initialStateOption(node: TSESTree.CallExpression | TSESTree.NewExpression): TSESTree.Expression | null {
  const options = node.arguments[0] ? unwrap(node.arguments[0]) : null;
  if (options?.type !== AST_NODE_TYPES.ObjectExpression) return null;
  for (const property of options.properties) {
    if (property.type === AST_NODE_TYPES.Property && !property.computed &&
      ((property.key.type === AST_NODE_TYPES.Identifier && property.key.name === 'initialState') ||
        (property.key.type === AST_NODE_TYPES.Literal && property.key.value === 'initialState'))) {
      return property.value as TSESTree.Expression;
    }
  }
  return null;
}

/** The class in `new State(...)`, `State.initialState` or `State.initialState()`. */
export function classIdentifierOfValue(value: TSESTree.Node): TSESTree.Identifier | null {
  let expression = unwrap(value);
  if (expression.type === AST_NODE_TYPES.NewExpression) {
    return expression.callee.type === AST_NODE_TYPES.Identifier ? expression.callee : null;
  }
  if (expression.type === AST_NODE_TYPES.CallExpression) expression = unwrap(expression.callee);
  if (expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
    expression.object.type === AST_NODE_TYPES.Identifier &&
    expression.property.type === AST_NODE_TYPES.Identifier && expression.property.name === 'initialState') {
    return expression.object;
  }
  return null;
}

/** Like `kissImportName`, for type names: `Store` or `kiss.Store`. */
function kissTypeName(typeName: TSESTree.EntityName, context: Context): string | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) return kissImportName(typeName, context);
  if (typeName.type !== AST_NODE_TYPES.TSQualifiedName || typeName.left.type !== AST_NODE_TYPES.Identifier) return null;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(typeName), typeName.left.name)?.defs[0];
  if (!def || def.type !== 'ImportBinding' || def.node.type !== AST_NODE_TYPES.ImportNamespaceSpecifier) return null;
  if ((def.parent as TSESTree.ImportDeclaration).source.value !== KISS_PACKAGE) return null;
  return typeName.right.name;
}
