/* eslint-disable kiss-for-react/action-name-ends-with-action */
/* eslint-disable kiss-for-react/action-name-ends-with-underscore-action */
/* eslint-disable kiss-for-react/action-name-without-action */
/* eslint-disable kiss-for-react/action-file-name-ends-with-action */
/* eslint-disable kiss-for-react/action-file-name-starts-with-action */

// Demonstrates the naming rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react).
// Each warning is marked with a comment right above the line it underlines: the rule name, then
// what the problem is (in parentheses, when needed), then its quick fixes, if any. Each variant
// of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.
//
// The naming rules are opt-in. There are 3 styles of action names, with one rule each:
//
// * `action-name-ends-with-action`: like `LoadUserAction`.
// * `action-name-ends-with-underscore-action`: like `LoadUser_Action`.
// * `action-name-without-action`: like `LoadUser`.
//
// And 2 styles of names for the files that declare actions, with one rule each:
//
// * `action-file-name-ends-with-action`: like `LoadUserAction.ts` or `load-user-action.ts`.
// * `action-file-name-starts-with-action`: like `ACTION_LoadUser.ts` or `ACTION_load_user.ts`.
//
// A project turns on only one rule of each kind. In this demo they're all on (and only in this
// file), so each action is reported by more than one of them: whatever its name, it's wrong for
// the other styles.
//
// The action-name rules suggest renaming the action in the whole file. ESLint can only change
// the current file, so there's no suggestion for exported actions: rename them with your IDE's
// rename refactoring, which also renames them in the other files.

import { Action, store } from './state';

// OK: abstract classes, like a base action, are not checked.
abstract class TodoAction extends Action {}

// kiss-for-react/action-file-name-ends-with-action
// (This file declares actions, but its name `naming.ts` doesn't end with `Action`. The warning
// is shown on the first action of the file. The message suggests `naming-actions.ts`, in the
// case style of the current name. No quick fix, since ESLint can't rename files: rename it with
// your IDE, which also updates the imports)
//
// kiss-for-react/action-file-name-starts-with-action
// (The file name doesn't start with `ACTION_`. The message suggests `action-naming.ts`)
//
// kiss-for-react/action-name-ends-with-action
// (The name doesn't end with `Action`)
// Fix (suggestion): Will rename `LoadTodos` to `LoadTodosAction` in this file, also in
// `loadAll` below.
//
// kiss-for-react/action-name-ends-with-underscore-action
// (The name doesn't end with `_Action`)
// Fix (suggestion): Will rename `LoadTodos` to `LoadTodos_Action` in this file.
//
// OK for `action-name-without-action`.
class LoadTodos extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-underscore-action
// (The name ends with `Action`, not with `_Action`)
// Fix (suggestion): Will rename `SaveTodosAction` to `SaveTodos_Action` in this file.
//
// kiss-for-react/action-name-without-action
// (The name ends with `Action`)
// Fix (suggestion): Will rename `SaveTodosAction` to `SaveTodos` in this file.
//
// OK for `action-name-ends-with-action`.
class SaveTodosAction extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-action
// (The name ends with `_Action`, not with `Action`)
// Fix (suggestion): Will rename `DeleteTodo_Action` to `DeleteTodoAction` in this file.
//
// kiss-for-react/action-name-without-action
// (The name ends with `_Action`)
// Fix (suggestion): Will rename `DeleteTodo_Action` to `DeleteTodo` in this file.
//
// OK for `action-name-ends-with-underscore-action`.
class DeleteTodo_Action extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-action
// Fix (suggestion): Will rename `ActionLog` to `ActionLogAction` in this file.
//
// kiss-for-react/action-name-ends-with-underscore-action
// Fix (suggestion): Will rename `ActionLog` to `ActionLog_Action` in this file.
//
// OK for `action-name-without-action`: the name only has `Action` at the start, not at the end.
class ActionLog extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-action
// (Exported, so other files may use it. No quick fix: rename it with your IDE)
//
// kiss-for-react/action-name-ends-with-underscore-action
// (Exported. No quick fix)
export class ClearTodos extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-underscore-action
// (Exported. No quick fix)
//
// kiss-for-react/action-name-without-action
// (Exported. No quick fix)
export class ArchiveTodosAction extends TodoAction {
  reduce() {
    return null;
  }
}

/** The name of `ToggleTodo` in the log. */
const ToggleTodoAction = 'Toggle todo';

// kiss-for-react/action-name-ends-with-action
// (No quick fix, since the new name `ToggleTodoAction` is already used in this file)
//
// kiss-for-react/action-name-ends-with-underscore-action
// Fix (suggestion): Will rename `ToggleTodo` to `ToggleTodo_Action` in this file.
class ToggleTodo extends TodoAction {
  reduce() {
    return null;
  }
}

// kiss-for-react/action-name-ends-with-underscore-action
// Fix (suggestion): Will rename `ErrorAction` to `Error_Action` in this file.
//
// kiss-for-react/action-name-without-action
// (No quick fix, since the new name `Error` is a global)
class ErrorAction extends TodoAction {
  reduce() {
    return null;
  }
}

// OK: not an action.
class TodoFilter {
  constructor(readonly text: string) {}
}

function loadAll() {
  store.dispatch(new LoadTodos());
  store.dispatch(new SaveTodosAction());
}
