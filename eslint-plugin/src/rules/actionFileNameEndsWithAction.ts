import { checkActionFileName } from '../naming.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Opt-in. Reports a file that declares actions, but whose name doesn't end with `Action`
 * (in any case style), like `LoadUser.ts` instead of `LoadUserAction.ts`, `load-user-action.ts`
 * or `load_user_action.ts`. The plural `Actions` is also accepted, like `user-actions.ts`.
 *
 * Only files with concrete (non-abstract) actions are checked, and not tests or `index` files.
 * The warning is shown on the first action. No fix, since ESLint can't rename files.
 */
export default createRule({
  name: 'action-file-name-ends-with-action',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require the names of files that declare actions to end with `Action`, like `LoadUserAction.ts` or `load-user-action.ts`.',
    },
    schema: [],
    messages: {
      wrongFileName: 'Rename the file `{{fileName}}` to `{{suggested}}`, with your IDE, which also updates the imports. This project names the files that declare actions like `LoadUserAction.ts` or `load-user-action.ts`.',
    },
  },
  defaultOptions: [],
  create(context) {
    return checkActionFileName(context, 'ends-with-action', getTypeInfo(context));
  },
});
