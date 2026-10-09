import { AST_NODE_TYPES, ASTUtils, TSESLint, TSESTree } from '@typescript-eslint/utils';
import {
  Context,
  DISPATCH_HOOKS,
  dispatchMethodOf,
  FunctionNode,
  importKissExport,
  indentOf,
  renderingComponentOf,
  storeKind,
} from '../components.js';
import { contains, createRule, getTypeInfo, isFunction, kissImportName, TypeInfo, unwrap, walk } from '../utils.js';

/**
 * Reports a dispatch in an effect (`useEffect` or `useLayoutEffect`), which runs when the
 * component mounts. When the store has a persistor, it may still be reading the persisted state,
 * and dispatching before the store is ready throws a `StoreException`:
 *
 * ```tsx
 * function Cards() {
 *   const dispatch = useDispatch();
 *   useEffect(() => { dispatch(new FetchCards()); }, []);              // Warning
 *   useDispatch({ onMount: (store) => store.dispatch(new FetchCards()) }); // OK
 * }
 * ```
 *
 * The `onMount`, `onDepsChange` and `onUnmount` options of `useDispatch` only run after the
 * store is ready.
 *
 * Only effects with a dependency array, in components and custom hooks, are checked. The
 * dispatch must run when the effect runs (not in a callback inside it), and must use a dispatch
 * function of the component: from `useDispatch()` and the other dispatch hooks, or from
 * `useStore()`. Effects that check `useIsStoreReady()`, or call `ready()`, are not reported.
 *
 * With type information, it's only reported when some file of the project creates a store with
 * a `persistor`, since otherwise the store is always ready.
 *
 * Suggestion: replace the effect with `useDispatch({ onMount })`. The dependencies become
 * `deps` and `onDepsChange`, and the cleanup function becomes `onUnmount` (no suggestion when
 * the effect has both).
 */
export default createRule({
  name: 'dispatch-in-effect',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow dispatching in effects, which may run before a store with a persistor is ready.',
    },
    hasSuggestions: true,
    schema: [],
    messages: {
      dispatchInEffect:
        '`{{callee}}` dispatches in an effect, when the component mounts. If the store has a persistor, it ' +
        'may not be ready yet, and dispatching throws a `StoreException`. Use the `onMount` option of ' +
        '`useDispatch`, which waits for the store to be ready.',
      useOnMount: 'Replace the effect with `useDispatch({ {{options}} })`.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    if (typeInfo && !projectHasPersistor(typeInfo)) return {};

    return {
      CallExpression(node) {
        if (!isReactEffect(node.callee, context)) return;
        const [effectArgument, depsArgument] = node.arguments;
        if (!effectArgument || !depsArgument) return;
        const effect = unwrap(effectArgument);
        if (effect.type !== AST_NODE_TYPES.ArrowFunctionExpression && effect.type !== AST_NODE_TYPES.FunctionExpression) return;
        if (effect.async) return;
        const deps = unwrap(depsArgument);
        if (deps.type !== AST_NODE_TYPES.ArrayExpression) return;
        if (!renderingComponentOf(node)) return;

        const dispatches = dispatchesWhenRun(effect.body, context, typeInfo);
        if (dispatches.length === 0) return;
        if (checksReadiness(effect, deps, context)) return;

        const suggestion = buildSuggestion(node, effect, deps, context, typeInfo);
        context.report({
          node: dispatches[0].callee,
          messageId: 'dispatchInEffect',
          data: {callee: context.sourceCode.getText(dispatches[0].callee)},
          suggest: suggestion ? [suggestion] : [],
        });
      },
    };
  },
});

// ---------------------------------------------------------------------------------------------
// What is checked.

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect']);

/** True for `useEffect` or `useLayoutEffect` imported from React, or `React.useEffect`. */
function isReactEffect(callee: TSESTree.Node, context: Context): boolean {
  const isFromReact = (identifier: TSESTree.Identifier, kinds: string[]) => {
    const def = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name)?.defs[0];
    return def?.type === 'ImportBinding' && kinds.includes(def.node.type) &&
      (def.parent as TSESTree.ImportDeclaration).source.value === 'react';
  };
  if (callee.type === AST_NODE_TYPES.Identifier) {
    if (!EFFECT_HOOKS.has(callee.name)) return false;
    const def = ASTUtils.findVariable(context.sourceCode.getScope(callee), callee.name)?.defs[0];
    if (!def || def.type !== 'ImportBinding' || def.node.type !== AST_NODE_TYPES.ImportSpecifier) return false;
    const imported = def.node.imported;
    return (def.parent as TSESTree.ImportDeclaration).source.value === 'react' &&
      imported.type === AST_NODE_TYPES.Identifier && imported.name === callee.name;
  }
  return callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier && EFFECT_HOOKS.has(callee.property.name) &&
    callee.object.type === AST_NODE_TYPES.Identifier &&
    isFromReact(callee.object, [AST_NODE_TYPES.ImportDefaultSpecifier, AST_NODE_TYPES.ImportNamespaceSpecifier]);
}

/** True for what `useStore()` returns, or its `store`. */
function isFromUseStore(node: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): boolean {
  const expression = unwrap(node);
  if (storeKind(expression, context, typeInfo) === 'dispatchers') return true;
  return expression.type === AST_NODE_TYPES.MemberExpression && !expression.computed &&
    expression.property.type === AST_NODE_TYPES.Identifier && expression.property.name === 'store' &&
    storeKind(expression.object, context, typeInfo) === 'dispatchers';
}

/**
 * If the callee is a dispatch function of the component (from a dispatch hook, or from
 * `useStore()`), returns the store method it calls, like `'dispatch'`. Not for `dispatchWhen`,
 * which waits for its condition before dispatching.
 */
function componentDispatchMethod(callee: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): string | null {
  const method = dispatchMethodOf(callee, context, typeInfo);
  if (!method || method === 'dispatchWhen') return null;
  const expression = unwrap(callee);
  if (expression.type === AST_NODE_TYPES.MemberExpression) {
    return isFromUseStore(expression.object, context, typeInfo) ? method : null;
  }
  const declarator = declaratorOf(expression as TSESTree.Identifier, context);
  if (!declarator?.init) return null;
  if (declarator.id.type === AST_NODE_TYPES.Identifier) return method; // `const dispatch = useDispatch()`
  return isFromUseStore(declarator.init, context, typeInfo) ? method : null; // `const { dispatch } = useStore()`
}

function declaratorOf(identifier: TSESTree.Identifier, context: Context): TSESTree.VariableDeclarator | null {
  const def = ASTUtils.findVariable(context.sourceCode.getScope(identifier), identifier.name)?.defs[0];
  return def?.type === 'Variable' && def.node.type === AST_NODE_TYPES.VariableDeclarator ? def.node : null;
}

/**
 * The calls of the component's dispatch functions that run when the effect runs: in its body,
 * and in functions called right away, but not in callbacks.
 */
function dispatchesWhenRun(body: TSESTree.Node, context: Context, typeInfo: TypeInfo | null): TSESTree.CallExpression[] {
  const result: TSESTree.CallExpression[] = [];
  const visit = (root: TSESTree.Node) => walk(root, (node) => {
    if (node.type !== AST_NODE_TYPES.CallExpression) return;
    const callee = unwrap(node.callee);
    if (isFunction(callee)) visit(callee.body);
    else if (componentDispatchMethod(node.callee, context, typeInfo)) result.push(node);
  });
  visit(body);
  return result;
}

/** True if the effect (or its deps) calls `ready()`, or reads the value of `useIsStoreReady()`. */
function checksReadiness(effect: FunctionNode, deps: TSESTree.ArrayExpression, context: Context): boolean {
  let found = false;
  const visit = (node: TSESTree.Node) => {
    if (found) return;
    if (node.type === AST_NODE_TYPES.CallExpression) {
      const callee = unwrap(node.callee);
      if (callee.type === AST_NODE_TYPES.MemberExpression && !callee.computed &&
        callee.property.type === AST_NODE_TYPES.Identifier && callee.property.name === 'ready') found = true;
    }
    if (node.type === AST_NODE_TYPES.Identifier) {
      const init = declaratorOf(node, context)?.init;
      if (init && unwrap(init).type === AST_NODE_TYPES.CallExpression &&
        kissImportName((unwrap(init) as TSESTree.CallExpression).callee, context) === 'useIsStoreReady') found = true;
    }
  };
  walk(effect, visit, true);
  walk(deps, visit, true);
  return found;
}

// ---------------------------------------------------------------------------------------------
// Persistors in the project.

const persistorCache = new WeakMap<object, boolean>();

/**
 * True if some file of the project (not a test, and not in `node_modules`) imports Kiss and
 * passes a `persistor` option, like `createStore({ ..., persistor })`. It's a quick check of the
 * text, done once per program.
 */
function projectHasPersistor(typeInfo: TypeInfo): boolean {
  const program = typeInfo.services.program;
  const cached = persistorCache.get(program);
  if (cached !== undefined) return cached;
  const result = program.getSourceFiles().some((file) => {
    const name = file.fileName.replace(/\\/g, '/');
    if (file.isDeclarationFile || name.includes('/node_modules/')) return false;
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name) || /(^|\/)__tests__\//.test(name)) return false;
    return /from\s*['"]kiss-for-react['"]/.test(file.text) && /\bpersistor\s*[:,}]/.test(file.text);
  });
  persistorCache.set(program, result);
  return result;
}

// ---------------------------------------------------------------------------------------------
// Suggestion.

/** The text of a range, with some of its parts replaced. */
function textWith(range: TSESTree.Range, replacements: { range: TSESTree.Range, text: string }[], context: Context): string {
  let result = '';
  let position = range[0];
  for (const replacement of [...replacements].sort((a, b) => a.range[0] - b.range[0])) {
    if (replacement.range[0] < position || replacement.range[1] > range[1]) continue;
    result += context.sourceCode.text.slice(position, replacement.range[0]) + replacement.text;
    position = replacement.range[1];
  }
  return result + context.sourceCode.text.slice(position, range[1]);
}

/** Adds `indent` to each line, except the first. */
function indentLines(text: string, indent: string): string {
  return text.split('\n').map((line, index) => index === 0 || line.trim() === '' ? line : indent + line).join('\n');
}

/** The text of the body of a function, from after `=>` (or the block of a `function`). */
function functionBodyRange(fn: FunctionNode, context: Context): TSESTree.Range {
  if (fn.type !== AST_NODE_TYPES.ArrowFunctionExpression) return fn.body.range;
  const arrow = context.sourceCode.getTokenBefore(fn.body, {filter: (token) => token.value === '=>'})!;
  return [arrow.range[1], fn.range[1]];
}

/**
 * Replaces the effect with `useDispatch({ deps, onMount, onDepsChange, onUnmount })`, calling
 * the dispatch methods of the store it gets, like `store.dispatch(...)`. If a dispatch function
 * like `const dispatch = useDispatch();` is not used anymore, removes it. Returns null when the
 * effect can't be converted:
 * - It has a cleanup function, and dependencies that change. React calls the cleanup before
 *   running the effect again, with the old values.
 * - It returns something other than a cleanup function written in the `return` at its end, or
 *   the cleanup uses variables declared in the effect.
 */
function buildSuggestion(
  node: TSESTree.CallExpression,
  effect: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
  deps: TSESTree.ArrayExpression,
  context: Context,
  typeInfo: TypeInfo | null,
): TSESLint.SuggestionReportDescriptor<'useOnMount'> | null {
  if (effect.params.length > 0) return null;

  // The deps that change. The dispatch functions and `useStore()` never change.
  const changingDeps: TSESTree.Node[] = [];
  const droppedDeps: TSESTree.Node[] = [];
  for (const element of deps.elements) {
    if (!element || element.type === AST_NODE_TYPES.SpreadElement) return null;
    if (componentDispatchMethod(element, context, typeInfo) || isFromUseStore(element, context, typeInfo)) droppedDeps.push(element);
    else changingDeps.push(element);
  }

  // The cleanup: a function returned at the end of the effect.
  let cleanup: FunctionNode | null = null;
  let cleanupReturn: TSESTree.ReturnStatement | null = null;
  if (effect.body.type === AST_NODE_TYPES.BlockStatement) {
    const returns: TSESTree.ReturnStatement[] = [];
    walk(effect.body, (child) => {
      if (child.type === AST_NODE_TYPES.ReturnStatement) returns.push(child);
    });
    const last = effect.body.body[effect.body.body.length - 1];
    const withValue = returns.filter((statement) => statement.argument);
    if (withValue.length > 0) {
      if (returns.length > 1 || last !== withValue[0]) return null;
      const returned = unwrap(withValue[0].argument!);
      if ((returned.type !== AST_NODE_TYPES.ArrowFunctionExpression && returned.type !== AST_NODE_TYPES.FunctionExpression) ||
        returned.params.length > 0 || returned.async) return null;
      cleanup = returned;
      cleanupReturn = withValue[0];
    }
  } else if (isFunction(unwrap(effect.body))) {
    return null;
  }
  if (cleanup && changingDeps.length > 0) return null;
  if (cleanup && usesLocalsOf(cleanup, effect, context)) return null;

  // The dispatch calls to rewrite, and the name of the store parameter.
  const calls: { call: TSESTree.CallExpression, method: string }[] = [];
  walk(effect.body, (child) => {
    if (child.type !== AST_NODE_TYPES.CallExpression) return;
    const method = componentDispatchMethod(child.callee, context, typeInfo);
    if (method) calls.push({call: child, method});
  }, true);
  const isRewritten = (inner: TSESTree.Node) => calls.some(({call}) => contains(call.callee, inner));
  const storeName = ['store', 'kissStore'].find((name) => !usesName(effect, name, isRewritten));
  if (!storeName) return null;
  const replacements = calls.map(({call, method}) => ({range: call.callee.range, text: `${storeName}.${method}`}));
  const usesStore = (range: TSESTree.Range) => calls.some(({call}) => range[0] <= call.range[0] && call.range[1] <= range[1]);

  // Indentation.
  const base = indentOf(node, context);
  let unit = '  ';
  if (effect.body.type === AST_NODE_TYPES.BlockStatement && effect.body.body.length > 0) {
    const inner = indentOf(effect.body.body[0], context);
    if (inner.startsWith(base) && inner.length > base.length && effect.body.body[0].loc.start.line !== node.loc.start.line) {
      unit = inner.slice(base.length);
    }
  }

  // The body of `onMount` (and `onDepsChange`).
  let mountBody: string;
  if (effect.body.type === AST_NODE_TYPES.BlockStatement) {
    const end = cleanupReturn ? cleanupReturn.range[0] : effect.body.range[1] - 1;
    const statements = textWith([effect.body.range[0] + 1, end], replacements, context).trim();
    mountBody = `{\n${base}${unit}${unit}${indentLines(statements, unit)}\n${base}${unit}}`;
  } else {
    mountBody = indentLines(textWith(functionBodyRange(effect, context), replacements, context).trim(), unit);
  }
  const mountParams = `(${storeName})`;

  const options: string[] = [];
  const optionNames: string[] = [];
  if (changingDeps.length > 0) {
    const texts = changingDeps.map((dep) => context.sourceCode.getText(dep));
    options.push(`deps: ${texts.length === 1 ? texts[0] : `[${texts.join(', ')}]`}`);
    optionNames.push('deps');
  }
  options.push(`onMount: ${mountParams} => ${mountBody}`);
  optionNames.push('onMount');
  if (changingDeps.length > 0) {
    options.push(`onDepsChange: ${mountParams} => ${mountBody}`);
    optionNames.push('onDepsChange');
  }
  if (cleanup) {
    const range = functionBodyRange(cleanup, context);
    const text = textWith(range, replacements, context).trim();
    options.push(`onUnmount: ${usesStore(range) ? `(${storeName})` : '()'} => ${text}`);
    optionNames.push('onUnmount');
  }

  // The dispatch functions not used anymore, like `const dispatch = useDispatch();`.
  const removable = unusedDispatchDeclarations(calls.map(({call}) => call.callee), droppedDeps, context);

  return {
    messageId: 'useOnMount' as const,
    data: {options: optionNames.join(', ')},
    fix: (fixer: TSESLint.RuleFixer) => {
      const useDispatch = importKissExport(context, fixer, 'useDispatch', node);
      if (!useDispatch) return null;
      const text = `${useDispatch.name}({\n${options.map((option) => `${base}${unit}${option},\n`).join('')}${base}})`;
      return [
        ...useDispatch.fixes,
        fixer.replaceText(node, text),
        ...removable.map((statement) => fixer.removeRange(lineRangeOf(statement, context))),
      ];
    },
  };
}

/** True if the cleanup function uses variables declared in the effect (outside the cleanup). */
function usesLocalsOf(cleanup: FunctionNode, effect: FunctionNode, context: Context): boolean {
  let found = false;
  walk(cleanup.body, (node) => {
    if (found || node.type !== AST_NODE_TYPES.Identifier) return;
    const def = ASTUtils.findVariable(context.sourceCode.getScope(node), node.name)?.defs[0];
    if (def && contains(effect, def.name) && !contains(cleanup, def.name)) found = true;
  }, true);
  return found;
}

/** True if the function uses the name (as a variable), outside the dispatch calls being rewritten. */
function usesName(fn: FunctionNode, name: string, isRewritten: (node: TSESTree.Node) => boolean): boolean {
  let found = false;
  walk(fn, (node) => {
    if (found || node.type !== AST_NODE_TYPES.Identifier || node.name !== name || isRewritten(node)) return;
    const parent = node.parent;
    if (parent?.type === AST_NODE_TYPES.MemberExpression && parent.property === node && !parent.computed) return;
    if (parent?.type === AST_NODE_TYPES.Property && parent.key === node && !parent.computed && !parent.shorthand) return;
    found = true;
  }, true);
  return found;
}

/**
 * The declarations like `const dispatch = useDispatch();` (alone in their statement, without
 * arguments) whose only uses are the given dispatch callees, and the dropped deps.
 */
function unusedDispatchDeclarations(callees: TSESTree.Node[], droppedDeps: TSESTree.Node[], context: Context): TSESTree.VariableDeclaration[] {
  const result: TSESTree.VariableDeclaration[] = [];
  for (const callee of [...callees, ...droppedDeps]) {
    if (callee.type !== AST_NODE_TYPES.Identifier) continue;
    const variable = ASTUtils.findVariable(context.sourceCode.getScope(callee), callee.name);
    const def = variable?.defs[0];
    if (!variable || def?.type !== 'Variable' || def.node.type !== AST_NODE_TYPES.VariableDeclarator) continue;
    const declaration = def.parent as TSESTree.VariableDeclaration;
    if (result.includes(declaration) || declaration.declarations.length !== 1 || def.node.id !== def.name) continue;
    const init = def.node.init && unwrap(def.node.init);
    if (init?.type !== AST_NODE_TYPES.CallExpression || init.arguments.length > 0) continue;
    const hook = kissImportName(init.callee, context);
    if (!hook || !DISPATCH_HOOKS[hook]) continue;
    const isGone = (identifier: TSESTree.Node) =>
      callees.some((gone) => contains(gone, identifier)) || droppedDeps.some((gone) => contains(gone, identifier));
    if (variable.references.every((reference) => reference.init || isGone(reference.identifier))) result.push(declaration);
  }
  return result;
}

/** The range of a statement, with its whole line when it's alone in it. */
function lineRangeOf(statement: TSESTree.Node, context: Context): TSESTree.Range {
  const lines = context.sourceCode.lines;
  const startLine = statement.loc.start.line;
  const endLine = statement.loc.end.line;
  const before = lines[startLine - 1].slice(0, statement.loc.start.column);
  const after = lines[endLine - 1].slice(statement.loc.end.column);
  if (before.trim() !== '' || after.trim() !== '' || endLine >= lines.length) return statement.range;
  return [
    context.sourceCode.getIndexFromLoc({line: startLine, column: 0}),
    context.sourceCode.getIndexFromLoc({line: endLine + 1, column: 0}),
  ];
}
