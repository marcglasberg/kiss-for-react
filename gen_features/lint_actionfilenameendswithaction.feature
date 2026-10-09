Feature: Lint: action-file-name-ends-with-action

  Scenario Outline: A file with one action, whose name does not end with Action, is reported.
    Given A file called {File name}, which declares the LoadUser action.
    When The code is linted.
    Then The action is reported.
    And The message suggests the name {Suggested}, in the same case style.
    Examples: 
      | File name           | Suggested           | Type information |
      | LoadUser.ts         | LoadUserAction.ts   | true             |
      | LoadUser.ts         | LoadUserAction.ts   | false            |
      | load-user.ts        | load-user-action.ts | false            |
      | load_user.ts        | load_user_action.ts | false            |
      | loadUser.tsx        | loadUserAction.tsx  | false            |
      | user.ts             | load-user-action.ts | false            |
      | ACTION_LoadUser.ts  | LoadUserAction.ts   | false            |
      | ACTION_load_user.ts | load_user_action.ts | false            |

  Scenario Outline: A file with more than one action is reported on the first one, and the name is based on the file name.
    Given A file called {File name}, which declares the LoadUser and SaveUser actions.
    When The code is linted.
    Then Only the first action is reported.
    And The message suggests the name {Suggested}.
    Examples: 
      | File name | Suggested       |
      | user.ts   | user-actions.ts |
      | User.ts   | UserActions.ts  |

  Scenario Outline: Files whose names end with Action, in any case style, are not reported.
    Given A file called {File name}, which declares actions.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | File name           |
      | LoadUserAction.ts   |
      | load-user-action.ts |
      | load_user_action.ts |
      | loadUserAction.tsx  |
      | LOAD_USER_ACTION.ts |
      | user-actions.ts     |
      | UserActions.ts      |

  Scenario Outline: Files without concrete actions, index files, and test files are not reported.
    Given {Description}.
    When The code is linted, with or without type information.
    Then There are no reports.
    Examples: 
      | Description                                        | File name         | Code                                                                                                                                                                                                                                   |
      | A file that only declares the abstract base action | base.ts           | import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}
                                                                             |
      | A file without actions                             | user.ts           | 
export class User {
  constructor(readonly name: string) {}
}
                                                                                                                                                                        |
      | A file with actions, called index.ts               | user/index.ts     | import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}

class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
 |
      | A test file with actions                           | user.test.ts      | import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}

class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
 |
      | A file with actions, in a __tests__ directory      | __tests__/user.ts | import { KissAction } from 'kiss-for-react';

class State {
  constructor(readonly user: string) {}
}

abstract class Action extends KissAction<State> {}

class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}
 |
