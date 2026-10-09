import { TSESTree } from '@typescript-eslint/utils';
import { actionNameMessages, checkActionName } from '../naming.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Opt-in. Reports an action whose name doesn't end with `Action`, like `LoadUser`
 * instead of `LoadUserAction`. Only concrete (non-abstract) action
 * classes are checked.
 *
 * Suggestion: rename the class in this file. Only when it's not exported (since other files may
 * use it, and ESLint can only change this file), and the new name is not used in the file.
 */
export default createRule({
  name: 'action-name-ends-with-action',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require action names to end with `Action`, like `LoadUserAction`.',
    },
    hasSuggestions: true,
    schema: [],
    messages: actionNameMessages('This project names actions like `LoadUserAction`.'),
  },
  defaultOptions: [],
  create(context) {
    const typeInfo = getTypeInfo(context);
    return {
      ClassDeclaration: (node: TSESTree.ClassDeclaration) => checkActionName(context, node, 'ends-with-action', typeInfo),
    };
  },
});
