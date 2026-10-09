import { checkActionFileName } from '../naming.js';
import { createRule, getTypeInfo } from '../utils.js';

/**
 * Opt-in. Reports a file that declares actions, but whose name doesn't start with `ACTION`
 * (in any case style), like `LoadUser.ts` instead of `ACTION_LoadUser.ts`, `ACTION_load_user.ts`
 * or `action-load-user.ts`. The plural `ACTIONS` is also accepted, like `ACTIONS_user.ts`.
 *
 * Only files with concrete (non-abstract) actions are checked, and not tests or `index` files.
 * The warning is shown on the first action. No fix, since ESLint can't rename files.
 */
export default createRule({
  name: 'action-file-name-starts-with-action',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require the names of files that declare actions to start with `ACTION_`, like `ACTION_LoadUser.ts` or `ACTION_load_user.ts`.',
    },
    schema: [],
    messages: {
      wrongFileName: 'Rename the file `{{fileName}}` to `{{suggested}}`, with your IDE, which also updates the imports. This project names the files that declare actions like `ACTION_LoadUser.ts` or `ACTION_load_user.ts`.',
    },
  },
  defaultOptions: [],
  create(context) {
    return checkActionFileName(context, 'starts-with-action', getTypeInfo(context));
  },
});
