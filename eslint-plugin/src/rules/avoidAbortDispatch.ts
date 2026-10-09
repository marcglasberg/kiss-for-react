import { ClassNode, findOverride, isActionClass } from '../actionMethods.js';
import { createRule, getTypeInfo, isTestFile } from '../utils.js';

/**
 * An opt-in rule that reports every override of `abortDispatch` in an action:
 *
 * ```ts
 * class LoadUser extends Action {
 *   abortDispatch(...) { ... } // Warning
 * }
 * ```
 *
 * The Kiss docs call it "a complex power feature that you may not need to learn". Most actions
 * should use a feature instead, like `nonReentrant`, `retry` or `checkInternet`. Turn this
 * rule on to make each override deliberate, with an `eslint-disable` comment where you really
 * need it. Not reported in tests.
 */
export default createRule({
  name: 'avoid-abort-dispatch',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow overriding `abortDispatch` in actions.',
    },
    schema: [],
    messages: {
      avoid:
        'Avoid overriding `abortDispatch`. It\'s a complex power feature that most actions don\'t need. ' +
        'Prefer a feature like `nonReentrant`, `retry` or `checkInternet`, or disable this rule ' +
        'here if you really need it.',
    },
  },
  defaultOptions: [],
  create(context) {
    if (isTestFile(context)) return {};
    const typeInfo = getTypeInfo(context);

    const checkClass = (classNode: ClassNode) => {
      const override = findOverride(classNode, 'abortDispatch');
      if (!override || !isActionClass(classNode, context, typeInfo)) return;
      context.report({node: override.key, messageId: 'avoid'});
    };

    return {
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
    };
  },
});
