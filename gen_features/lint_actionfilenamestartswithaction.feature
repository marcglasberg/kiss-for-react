Feature: Lint: action-file-name-starts-with-action

  Scenario Outline: A file with one action, whose name does not start with ACTION, is reported.
    Given A file called {File name}, which declares the LoadUser action.
    When The code is linted.
    Then The action is reported.
    And The message suggests the name {Suggested}, in the same case style.
    Examples: 
      | File name           | Suggested           | Type information |
      | LoadUser.ts         | ACTION_LoadUser.ts  | true             |
      | LoadUser.ts         | ACTION_LoadUser.ts  | false            |
      | load_user.ts        | ACTION_load_user.ts | false            |
      | load-user.ts        | action-load-user.ts | false            |
      | loadUser.tsx        | actionLoadUser.tsx  | false            |
      | LoadUserAction.ts   | ACTION_LoadUser.ts  | false            |
      | load_user_action.ts | ACTION_load_user.ts | false            |

  Scenario Outline: A file with more than one action is reported on the first one, and the name is based on the file name.
    Given A file called {File name}, which declares the LoadUser and SaveUser actions.
    When The code is linted.
    Then Only the first action is reported.
    And The message suggests the name {Suggested}.
    Examples: 
      | File name | Suggested      |
      | user.ts   | action-user.ts |
      | User.ts   | ACTION_User.ts |

  Scenario Outline: Files whose names start with ACTION, in any case style, are not reported.
    Given A file called {File name}, which declares actions.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | File name           |
      | ACTION_LoadUser.ts  |
      | ACTION_load_user.ts |
      | action-load-user.ts |
      | actionLoadUser.tsx  |
      | ACTIONS_user.ts     |

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
