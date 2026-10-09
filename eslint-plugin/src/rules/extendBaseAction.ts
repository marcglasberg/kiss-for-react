import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import type * as ts from 'typescript';
import * as path from 'path';
import { scanProgram } from '../actionFeatures.js';
import { createRule, getTypeInfo, isTestFile, kissImportName, TypeInfo } from '../utils.js';

type Context = Readonly<TSESLint.RuleContext<string, readonly unknown[]>>;

const MAX_SUGGESTIONS = 3;

/** A base action that the action could extend. */
interface BaseAction {
  name: string;
  /** The import path, from the linted file, or null if it's declared in the linted file. */
  importPath: string | null;
}

/**
 * Reports an action that extends `KissAction<State>` directly, instead of the app's base
 * action, like `abstract class Action extends KissAction<State> {}`:
 *
 * ```ts
 * class LoadUser extends KissAction<State> { ... } // Warning
 * class LoadUser extends Action { ... }            // OK
 * ```
 *
 * The base action is where the app adds what all its actions share, like getters for parts of
 * the state, or a `hasInternet` that works for the app.
 *
 * Not reported for abstract classes, actions with a generic state (like `KissAction<St>`), or
 * in tests.
 *
 * Suggestions: extend the base action, for each abstract class that extends `KissAction` with
 * the same state directly (up to 3), adding its import. Without type information, only the
 * base actions declared in the same file are found.
 */
export default createRule({
  name: 'extend-base-action',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Recommend extending the app\'s base action, instead of `KissAction` directly.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      extendBaseAction:
        '`{{action}}` extends `KissAction` directly. Extend your base action instead ({{bases}}), so that ' +
        'it gets what all your actions share.',
      createBaseAction:
        '`{{action}}` extends `KissAction` directly. Create a base action, like ' +
        '`abstract class Action extends KissAction<{{state}}> {}`, and extend it instead, so that all your ' +
        'actions can share code.',
      extend: 'Extend `{{base}}`.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    return {
      ClassDeclaration(node) {
        if (node.abstract || !node.id || !node.superClass) return;
        if (kissImportName(node.superClass, context) !== 'KissAction') return;
        const stateNode = node.superTypeArguments?.params[0];
        if (!stateNode || isGenericState(stateNode, context)) return;

        const superClass = node.superClass;
        const end = node.superTypeArguments!.range[1];
        const bases = findBaseActions(node, stateNode, context, typeInfo);
        const loc = {start: superClass.loc.start, end: node.superTypeArguments!.loc.end};

        if (bases.length === 0) {
          context.report({
            loc,
            messageId: 'createBaseAction',
            data: {action: node.id.name, state: context.sourceCode.getText(stateNode)},
          });
          return;
        }

        context.report({
          loc,
          messageId: 'extendBaseAction',
          data: {action: node.id.name, bases: bases.map((base) => `\`${base.name}\``).join(', ')},
          suggest: bases.map((base) => ({
            messageId: 'extend' as const,
            data: {base: base.name},
            fix: (fixer: TSESLint.RuleFixer) => extendFix(fixer, superClass, end, base, context),
          })),
        });
      },
    };
  },
});

// The state is generic when it's a type parameter (like `St` in `class X<St> extends KissAction<St>`),
// or `any` or `unknown`.
function isGenericState(stateNode: TSESTree.TypeNode, context: Context): boolean {
  if (stateNode.type === AST_NODE_TYPES.TSAnyKeyword || stateNode.type === AST_NODE_TYPES.TSUnknownKeyword) return true;
  if (stateNode.type !== AST_NODE_TYPES.TSTypeReference || stateNode.typeName.type !== AST_NODE_TYPES.Identifier) return false;
  const def = ASTUtils.findVariable(context.sourceCode.getScope(stateNode), stateNode.typeName.name)?.defs[0];
  return def?.node.type === AST_NODE_TYPES.TSTypeParameter;
}

/**
 * The abstract classes that extend `KissAction` with the same state directly: in the same file
 * (declared before the action, since a class can't be used before its declaration), and, with
 * type information, exported from the other files of the program.
 */
function findBaseActions(
  classNode: TSESTree.ClassDeclaration,
  stateNode: TSESTree.TypeNode,
  context: Context,
  typeInfo: TypeInfo | null,
): BaseAction[] {
  const stateType = typeInfo?.checker.getTypeFromTypeNode(typeInfo.services.esTreeNodeToTSNodeMap.get(stateNode) as ts.TypeNode);
  const isSameState = (other: TSESTree.TypeNode) => typeInfo
    ? typeInfo.checker.getTypeFromTypeNode(typeInfo.services.esTreeNodeToTSNodeMap.get(other) as ts.TypeNode) === stateType
    : context.sourceCode.getText(other) === context.sourceCode.getText(stateNode);

  const result: BaseAction[] = [];

  // In the same file.
  for (const statement of context.sourceCode.ast.body) {
    const declaration =
      statement.type === AST_NODE_TYPES.ExportNamedDeclaration || statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
        ? statement.declaration : statement;
    if (declaration?.type !== AST_NODE_TYPES.ClassDeclaration || !declaration.abstract || !declaration.id) continue;
    if (declaration.range[1] > classNode.range[0]) continue;
    if (!declaration.superClass || kissImportName(declaration.superClass, context) !== 'KissAction') continue;
    const otherState = declaration.superTypeArguments?.params[0];
    if (otherState && isSameState(otherState)) result.push({name: declaration.id.name, importPath: null});
  }

  // In other files.
  if (typeInfo && stateType) {
    const thisFile = typeInfo.services.esTreeNodeToTSNodeMap.get(classNode).getSourceFile().fileName;
    const others = scanProgram(typeInfo).baseActions
      .filter((base) => base.fileName !== thisFile && base.exported && base.stateType === stateType)
      .sort((a, b) => a.fileName.localeCompare(b.fileName) || a.position - b.position);
    for (const base of others) {
      const importPath = relativeImportPath(thisFile, base.fileName);
      const existing = ASTUtils.findVariable(context.sourceCode.getScope(classNode), base.name);
      if (existing) {
        // Already imported from that file: no need to import it again. Otherwise, it's a different thing.
        const def = existing.defs[0];
        if (def?.type === 'ImportBinding' && importsSameFile(def.parent as TSESTree.ImportDeclaration, base.fileName, typeInfo)) {
          result.push({name: base.name, importPath: null});
        }
        continue;
      }
      if (result.some((r) => r.name === base.name)) continue;
      result.push({name: base.name, importPath});
    }
  }

  return result.slice(0, MAX_SUGGESTIONS);
}

function importsSameFile(importDeclaration: TSESTree.ImportDeclaration, fileName: string, {services, checker}: TypeInfo): boolean {
  const tsNode = services.esTreeNodeToTSNodeMap.get(importDeclaration.source);
  const moduleSymbol = checker.getSymbolAtLocation(tsNode);
  return !!moduleSymbol?.getDeclarations()?.some((d) => d.getSourceFile().fileName === fileName);
}

/** Like `'./actions/Action'`: relative, with `/`, and without the extension. */
function relativeImportPath(from: string, to: string): string {
  let relative = path.posix.relative(path.posix.dirname(from.replace(/\\/g, '/')), to.replace(/\\/g, '/'));
  relative = relative.replace(/\.[cm]?[jt]sx?$/, '');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

/**
 * Replaces `KissAction<State>` with the base action, adds the import of the base action (if it's in
 * another file), and removes the import of `KissAction` if it's no longer used.
 */
function extendFix(
  fixer: TSESLint.RuleFixer,
  superClass: TSESTree.LeftHandSideExpression,
  end: number,
  base: BaseAction,
  context: Context,
): TSESLint.RuleFix[] {
  const fixes = [fixer.replaceTextRange([superClass.range[0], end], base.name)];
  const imports = context.sourceCode.ast.body.filter((s): s is TSESTree.ImportDeclaration => s.type === AST_NODE_TYPES.ImportDeclaration);
  const quote = imports[0]?.source.raw.startsWith('"') ? '"' : '\'';
  const importText = base.importPath ? `import { ${base.name} } from ${quote}${base.importPath}${quote};` : null;

  // The import of `KissAction`, if this is its only use.
  let kissImport: TSESTree.ImportDeclaration | null = null;
  let kissSpecifier: TSESTree.ImportClause | null = null;
  if (superClass.type === AST_NODE_TYPES.Identifier) {
    const variable = ASTUtils.findVariable(context.sourceCode.getScope(superClass), superClass.name);
    const def = variable?.defs[0];
    if (variable && def?.type === 'ImportBinding' && variable.references.length === 1) {
      kissImport = def.parent as TSESTree.ImportDeclaration;
      kissSpecifier = def.node as TSESTree.ImportClause;
    }
  }

  if (kissImport && kissSpecifier && kissImport.specifiers.length === 1) {
    // Replace the whole import of `KissAction` with the new import (or remove it).
    fixes.push(importText ? fixer.replaceText(kissImport, importText) : removeLine(fixer, kissImport, context));
    return fixes;
  }

  if (kissImport && kissSpecifier) fixes.push(removeSpecifier(fixer, kissImport, kissSpecifier, context));
  if (importText) {
    const last = imports[imports.length - 1];
    fixes.push(last
      ? fixer.insertTextAfter(last, `\n${importText}`)
      : fixer.insertTextBeforeRange([0, 0], `${importText}\n`));
  }
  return fixes;
}

function removeLine(fixer: TSESLint.RuleFixer, node: TSESTree.Node, context: Context): TSESLint.RuleFix {
  const text = context.sourceCode.getText();
  let end = node.range[1];
  if (text[end] === '\n') end++;
  else if (text.startsWith('\r\n', end)) end += 2;
  return fixer.removeRange([node.range[0], end]);
}

// Removes `KissAction` from `import { KissAction, Store } from 'kiss-for-react'`, with its comma.
function removeSpecifier(
  fixer: TSESLint.RuleFixer,
  importDeclaration: TSESTree.ImportDeclaration,
  specifier: TSESTree.ImportClause,
  context: Context,
): TSESLint.RuleFix {
  const specifiers = importDeclaration.specifiers;
  const index = specifiers.indexOf(specifier);
  const next = specifiers[index + 1];
  if (next && next.type === specifier.type) return fixer.removeRange([specifier.range[0], next.range[0]]);
  const previous = specifiers[index - 1];
  if (previous) {
    const comma = context.sourceCode.getTokenBefore(specifier)!;
    // `import Default, { KissAction } from ...`: remove `, { KissAction }`.
    if (comma.value === '{') {
      const close = context.sourceCode.getTokenAfter(specifier)!;
      return fixer.removeRange([previous.range[1], close.range[1]]);
    }
    return fixer.removeRange([previous.range[1], specifier.range[1]]);
  }
  return fixer.remove(specifier);
}
