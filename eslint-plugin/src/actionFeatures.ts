import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import { classDeclarationOf } from './actions.js';
import { findMethod, isAsyncMethod, isThenable, kissImportName, memberName, TypeInfo, unwrap, isAnyOrUnknown } from './utils.js';

// Helpers for the rules about action features: `nonReentrant`, `retry`, `checkInternet`,
// `unlimitedRetryCheckInternet`, `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`,
// `ServerPush`, and the base action.

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

export type ClassNode = TSESTree.ClassDeclaration | TSESTree.ClassExpression;

// TypeScript flags (their values are stable across TypeScript versions).
const SYMBOL_FLAGS_ALIAS = 2097152; // ts.SymbolFlags.Alias

/** Kiss's own classes. Their members are the defaults, not overrides. */
const KISS_CLASSES = ['KissAction', 'OptimisticCommand', 'OptimisticSync', 'OptimisticSyncWithPush', 'ServerPush'];

/** Kiss's own action classes that already declare `reduce`. */
export const KISS_CLASSES_WITH_REDUCE = ['OptimisticCommand', 'OptimisticSync', 'OptimisticSyncWithPush', 'ServerPush'];

/** Kiss's own action classes, that the actions of the app extend. */
export type KissClassName = 'KissAction' | 'OptimisticCommand' | 'OptimisticSync' | 'OptimisticSyncWithPush' | 'ServerPush';

// ---------------------------------------------------------------------------------------------
// The class and its superclasses, without type information.

/**
 * The class, and its superclasses declared in this file, in order. `end` is the Kiss class the
 * chain reaches (`KissAction`, `OptimisticCommand`, `OptimisticSync`, `OptimisticSyncWithPush`
 * or `ServerPush`), or `null` if it leaves the file (or the last class doesn't extend anything).
 */
export interface ClassChain {
  classes: ClassNode[];
  end: KissClassName | null;
}

export function classChain(classNode: ClassNode, context: Context): ClassChain {
  const classes: ClassNode[] = [];
  const seen = new Set<TSESTree.Node>();
  let current: ClassNode | null = classNode;
  while (current && !seen.has(current)) {
    seen.add(current);
    classes.push(current);
    const superClass: TSESTree.Expression | null = current.superClass;
    if (!superClass) break;
    const kissName = kissClassName(superClass, context);
    if (kissName) return {classes, end: kissName};
    current = superClass.type === AST_NODE_TYPES.Identifier ? classDeclarationOf(superClass, context) : null;
  }
  return {classes, end: null};
}

// One of Kiss's action classes, imported from Kiss (or, when not declared in this file, by name).
function kissClassName(node: TSESTree.Node, context: Context): KissClassName | null {
  const imported = kissImportName(node, context);
  if (imported !== null && KISS_CLASSES.includes(imported)) return imported as KissClassName;
  if (node.type === AST_NODE_TYPES.Identifier && KISS_CLASSES.includes(node.name) &&
    !classDeclarationOf(node, context)) return node.name as KissClassName;
  return null;
}

/** The first non-static member (method, getter or property) with this name, in the classes of the chain. */
export function findMemberInChain(chain: ClassChain, name: string): TSESTree.ClassElement | null {
  for (const classNode of chain.classes) {
    for (const member of classNode.body.body) {
      if ((member.type === AST_NODE_TYPES.MethodDefinition || member.type === AST_NODE_TYPES.PropertyDefinition ||
          member.type === AST_NODE_TYPES.TSAbstractMethodDefinition || member.type === AST_NODE_TYPES.TSAbstractPropertyDefinition) &&
        !member.static && memberName(member) === name) return member;
    }
  }
  return null;
}

/** The first non-static property with this name (that is not `declare`), in the classes of the chain. */
export function findPropertyInChain(chain: ClassChain, name: string): TSESTree.PropertyDefinition | null {
  for (const classNode of chain.classes) {
    for (const member of classNode.body.body) {
      if (member.type === AST_NODE_TYPES.PropertyDefinition && !member.static && !member.declare &&
        memberName(member) === name) return member;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// With type information.

/** The instance type of a class declared in this file. */
export function instanceTypeOfClass(classNode: ClassNode, {services, checker}: TypeInfo): ts.Type {
  return checker.getTypeAtLocation(services.esTreeNodeToTSNodeMap.get(classNode));
}

/** The name of the class that declares this member declaration, if any. */
function ownerName(declaration: ts.Declaration): string | undefined {
  const owner = declaration.parent as ts.Node & { name?: ts.Identifier };
  return owner?.name?.text;
}

/** The declarations of a member of the type, that are not in Kiss's own classes. */
export function userDeclarations(type: ts.Type, name: string): ts.Declaration[] {
  const symbol = type.getProperty(name);
  return (symbol?.getDeclarations() ?? []).filter((declaration) => !KISS_CLASSES.includes(ownerName(declaration) ?? ''));
}

/** True if the type has a member with this name that is declared in the app, not in Kiss. */
export function isDeclaredByUser(type: ts.Type, name: string): boolean {
  return userDeclarations(type, name).length > 0;
}

/** The text of the initializer of a property of the type, like `{ on: true }` for `retry`. */
export function initializerTextOf(type: ts.Type, name: string): string | null {
  for (const declaration of userDeclarations(type, name)) {
    const initializer = (declaration as ts.PropertyDeclaration).initializer;
    if (initializer) return initializer.getText(declaration.getSourceFile());
  }
  return null;
}

/** True if the type is a class that extends a class with this name, directly or not. */
export function extendsClassNamed(type: ts.Type, name: string, checker: ts.TypeChecker, seen = new Set<ts.Type>()): boolean {
  if (seen.has(type)) return false;
  seen.add(type);
  const target = (type as ts.TypeReference).target ?? type;
  if (target.getSymbol()?.getName() === name) return true;
  const bases = target.isClassOrInterface() ? checker.getBaseTypes(target) : [];
  return bases.some((base) => extendsClassNamed(base, name, checker, seen));
}

// ---------------------------------------------------------------------------------------------
// Sync or async `reduce`.

/**
 * If the `reduce` of the action is sync or async, or `unknown`. It's `unknown` when it may
 * return a promise or not, or when it's not known (for example, it's declared in another file,
 * and there is no type information).
 */
export function reduceKind(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): 'sync' | 'async' | 'unknown' {
  if (typeInfo) {
    const own = findMethod(classNode, 'reduce');
    if (own?.value.async) return 'async';
    const type = instanceTypeOfClass(classNode, typeInfo);
    const symbol = type.getProperty('reduce');
    if (!symbol || !isDeclaredByUser(type, 'reduce') &&
      !symbol.getDeclarations()?.some((d) => KISS_CLASSES_WITH_REDUCE.includes(ownerName(d) ?? ''))) {
      return 'unknown';
    }
    const location = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode);
    const signatures = typeInfo.checker.getTypeOfSymbolAtLocation(symbol, location).getCallSignatures();
    if (signatures.length === 0) return 'unknown';
    const returnTypes = signatures.map((signature) => typeInfo.checker.getReturnTypeOfSignature(signature));
    if (returnTypes.every((returnType) => isThenable(returnType))) return 'async';
    if (returnTypes.some((returnType) => isAnyOrUnknown(returnType) ||
      isThenable(returnType) || (returnType.isUnion() && returnType.types.some((t) => isThenable(t))))) return 'unknown';
    return 'sync';
  }
  const chain = classChain(classNode, context);
  const reduce = findMemberInChain(chain, 'reduce');
  if (!reduce || reduce.type !== AST_NODE_TYPES.MethodDefinition) return 'unknown';
  return isAsyncMethod(reduce, context, null) ? 'async' : 'sync';
}

// ---------------------------------------------------------------------------------------------
// Property values.

/** True if the property's value is not `null` or `undefined` (and it has a value). */
export function isSet(property: TSESTree.PropertyDefinition): boolean {
  if (!property.value) return false;
  const value = unwrap(property.value);
  return !(value.type === AST_NODE_TYPES.Literal && value.value === null) &&
    !(value.type === AST_NODE_TYPES.Identifier && value.name === 'undefined');
}

/** True if the property's value is `true`. */
export function isTrue(property: TSESTree.PropertyDefinition): boolean {
  if (!property.value) return false;
  const value = unwrap(property.value);
  return value.type === AST_NODE_TYPES.Literal && value.value === true;
}

/**
 * From the text of a `retry` value: if it turns retry on, and the option that makes it retry
 * forever, if any (`maxRetries: -1` or `unlimitedRetries: true`).
 */
export function retryOf(text: string): { on: boolean, unlimited: string | null } {
  const value = text.trim();
  if (value === 'null' || value === 'undefined' || /\bon\s*:\s*false\b/.test(value)) return {on: false, unlimited: null};
  if (/\bmaxRetries\s*:\s*-\s*1(?![\d.])/.test(value)) return {on: true, unlimited: 'maxRetries: -1'};
  if (/\bunlimitedRetries\s*:\s*true\b/.test(value)) return {on: true, unlimited: 'unlimitedRetries: true'};
  return {on: true, unlimited: null};
}

/** The retry of a class, from its own `retry` or its superclasses' (in this file, or with type information). */
export function retryOfClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): { on: boolean, unlimited: string | null } | null {
  if (typeInfo) {
    const text = initializerTextOf(instanceTypeOfClass(classNode, typeInfo), 'retry');
    return text === null ? null : retryOf(text);
  }
  const retry = findPropertyInChain(classChain(classNode, context), 'retry');
  return retry?.value ? retryOf(context.sourceCode.getText(retry.value)) : null;
}

/**
 * From the text of an `unlimitedRetryCheckInternet` value: if it turns it on. It's on for `true`
 * and for an object with the retry options, and off for `false`, `null` and `undefined`.
 */
export function isUnlimitedRetryCheckInternetOn(text: string): boolean {
  return !['false', 'null', 'undefined'].includes(text.trim());
}

/**
 * True if the class turns on `unlimitedRetryCheckInternet`, itself or with its superclasses (in
 * this file, or with type information).
 */
export function unlimitedRetryCheckInternetOfClass(classNode: ClassNode, context: Context, typeInfo: TypeInfo | null): boolean {
  if (typeInfo) {
    const text = initializerTextOf(instanceTypeOfClass(classNode, typeInfo), 'unlimitedRetryCheckInternet');
    return text !== null && isUnlimitedRetryCheckInternetOn(text);
  }
  const property = findPropertyInChain(classChain(classNode, context), 'unlimitedRetryCheckInternet');
  return !!property?.value && isUnlimitedRetryCheckInternetOn(context.sourceCode.getText(property.value));
}

// ---------------------------------------------------------------------------------------------
// Fixes.

/** Removes a class member, with its line if it's alone in it. */
export function removeMember(fixer: TSESLint.RuleFixer, member: TSESTree.Node, context: Context): TSESLint.RuleFix {
  const text = context.sourceCode.getText();
  let start = member.range[0];
  let end = member.range[1];
  while (start > 0 && (text[start - 1] === ' ' || text[start - 1] === '\t')) start--;
  const lineStart = start === 0 || text[start - 1] === '\n';
  let after = end;
  while (after < text.length && (text[after] === ' ' || text[after] === '\t')) after++;
  if (lineStart && (text[after] === '\n' || text.startsWith('\r\n', after))) {
    end = after + (text[after] === '\n' ? 1 : 2);
    return fixer.removeRange([start, end]);
  }
  return fixer.remove(member);
}

/** The indentation of the line where the node starts. */
export function indentationOf(node: TSESTree.Node, context: Context): string {
  const line = context.sourceCode.lines[node.loc.start.line - 1];
  return /^\s*/.exec(line)![0];
}

/**
 * True if new members that override inherited ones need the `override` keyword: when the project
 * uses `noImplicitOverride`, or when some member of the class already uses it.
 */
export function needsOverrideKeyword(classNode: ClassNode, typeInfo: TypeInfo | null): boolean {
  if (typeInfo?.services.program.getCompilerOptions().noImplicitOverride) return true;
  return classNode.body.body.some((member) => 'override' in member && member.override === true);
}

// ---------------------------------------------------------------------------------------------
// The classes of the program (with type information).

export interface BaseActionDeclaration {
  name: string;
  fileName: string;
  /** The position of the declaration in its file. */
  position: number;
  /** The state type, in `KissAction<State>`. */
  stateType: ts.Type;
  /** True if it's exported by name from its file. */
  exported: boolean;
}

interface ProgramScan {
  /** The classes (symbols) that some class or interface of the program extends. */
  extended: Set<ts.Symbol>;
  /** The abstract classes that extend `KissAction<State>` directly, for some `State`. */
  baseActions: BaseActionDeclaration[];
}

const scans = new WeakMap<ts.Program, ProgramScan>();

/**
 * Scans the source files of the program (not the `.d.ts` files, nor `node_modules`) for the
 * classes that are extended, and for the base actions. The result is cached for the program.
 */
export function scanProgram({services, checker}: TypeInfo): ProgramScan {
  const program = services.program;
  const cached = scans.get(program);
  if (cached) return cached;

  const scan: ProgramScan = {extended: new Set(), baseActions: []};
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile || /[\\/]node_modules[\\/]/.test(sourceFile.fileName)) continue;
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    const exportNames = new Set(moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map((s) => s.getName()) : []);

    const visit = (node: ts.Node): void => {
      const heritageClauses = (node as ts.ClassLikeDeclaration).heritageClauses;
      if (heritageClauses) {
        for (const clause of heritageClauses) {
          if (!clause.getText(sourceFile).startsWith('extends')) continue;
          const superType = clause.types[0];
          if (!superType) continue;
          let symbol = checker.getSymbolAtLocation(superType.expression);
          if (symbol && (symbol.flags & SYMBOL_FLAGS_ALIAS) !== 0) symbol = checker.getAliasedSymbol(symbol);
          if (!symbol) continue;
          scan.extended.add(symbol);

          const classNode = node as ts.ClassLikeDeclaration;
          const isAbstract = !!(classNode as ts.ClassDeclaration).modifiers?.some((m) => m.getText(sourceFile) === 'abstract');
          const stateTypeNode = superType.typeArguments?.[0];
          if (isAbstract && classNode.name && stateTypeNode && symbol.getName() === 'KissAction') {
            scan.baseActions.push({
              name: classNode.name.text,
              fileName: sourceFile.fileName,
              position: classNode.getStart(sourceFile),
              stateType: checker.getTypeFromTypeNode(stateTypeNode),
              exported: exportNames.has(classNode.name.text),
            });
          }
        }
      }
      node.forEachChild(visit);
    };
    sourceFile.forEachChild(visit);
  }
  scans.set(program, scan);
  return scan;
}

/** True if some class of this file, or of the program (with type information), extends the class. */
export function hasSubclasses(
  classRef: TSESTree.Expression,
  classNode: TSESTree.ClassDeclaration | null,
  context: Context,
  typeInfo: TypeInfo | null,
): boolean {
  if (typeInfo) {
    const tsNode = typeInfo.services.esTreeNodeToTSNodeMap.get(unwrap(classRef));
    let symbol = typeInfo.checker.getSymbolAtLocation(tsNode);
    if (symbol && (symbol.flags & SYMBOL_FLAGS_ALIAS) !== 0) symbol = typeInfo.checker.getAliasedSymbol(symbol);
    return !symbol || scanProgram(typeInfo).extended.has(symbol);
  }
  if (!classNode) return true;
  let found = false;
  const visit = (node: TSESTree.Node): void => {
    if (found) return;
    if ((node.type === AST_NODE_TYPES.ClassDeclaration || node.type === AST_NODE_TYPES.ClassExpression) &&
      node.superClass?.type === AST_NODE_TYPES.Identifier &&
      classDeclarationOf(node.superClass, context) === classNode) {
      found = true;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const value = (node as any)[key];
      if (Array.isArray(value)) {
        for (const child of value) if (child && typeof child.type === 'string') visit(child);
      } else if (value && typeof value.type === 'string') visit(value);
    }
  };
  visit(context.sourceCode.ast);
  return found;
}

/** The variable that an identifier refers to. */
export function variableOf(identifier: TSESTree.Identifier, context: Context) {
  return ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name);
}
