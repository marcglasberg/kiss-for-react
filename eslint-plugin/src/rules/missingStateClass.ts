import { createRule, getTypeInfo } from '../utils.js';
import { ClassNode, classNameOf, hasStateClassDecorator, isStateClass } from '../stateClasses.js';

/**
 * Opt-in: require the optional `@stateClass` decorator exported by `kiss-for-react`
 * on every detected state class, including nested classes and base classes.
 *
 * The decorator makes the class's purpose visible in its own file to readers,
 * AI agents, and other lint tools. It also lets the state rules check classes before
 * a store uses them. Automatic detection remains enabled; this rule uses it to find
 * missing annotations instead of replacing it. Each class needs its own decorator.
 *
 * Off by default so existing applications need no decorator configuration. With
 * TypeScript type information, detection follows state types across the project;
 * without it, only classes in the linted file can be found. Third-party classes
 * are not checked. No automatic fix: using decorators may require compiler setup.
 * TypeScript 5+ accepts modern decorators with `experimentalDecorators` absent or false;
 * use `compilerOptions.experimentalDecorators: true` in tsconfig.json only for the legacy
 * format. The decorator supports both formats. Babel/SWC must accept the chosen format
 * if they compile the application. See the linter README's "Configuring decorators" section.
 * ESLint type information (`projectService`) does not configure decorator compilation.
 */
export default createRule({
  name: 'missing-state-class',
  meta: {
    type: 'suggestion',
    docs: { description: 'Require @stateClass on state classes to make their purpose visible to readers, AI agents, and tools.' },
    schema: [],
    messages: {
      missing: 'The state class `{{className}}` needs `@stateClass` from `kiss-for-react`. ' +
        'The decorator makes its purpose visible to readers, AI agents, and lint tools. ' +
        'Import `stateClass` from `kiss-for-react` and annotate this class.',
    },
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    const check = (node: ClassNode) => {
      if (isStateClass(node, context, typeInfo) && !hasStateClassDecorator(node, context, typeInfo)) {
        context.report({node: node.id ?? node, messageId: 'missing', data: {className: classNameOf(node)}});
      }
    };
    return {ClassDeclaration: check, ClassExpression: check};
  },
});
