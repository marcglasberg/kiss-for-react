Feature: Lint: action-name-ends-with-action

  Scenario Outline: An action whose name does not end with Action is reported.
    Given An action called LoadUser, which is not exported.
    And The action is used in other places of the same file.
    When The code is linted.
    Then The action name is reported, telling to rename it to LoadUserAction.
    And The suggestion renames the action and all its uses in the file.
    And The renamed code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: An action whose name ends with _Action is reported, to remove the underscore.
    Given An action called LoadUser_Action.
    When The code is linted.
    Then It is reported, and the suggestion renames it to LoadUserAction.

  Scenario Outline: Actions whose names end with Action, abstract actions, and other classes are not reported.
    Given {Description}.
    When The code is linted, with or without type information.
    Then There are no reports.
    Examples: 
      | Description                        | Code                                                                                                                |
      | An action called LoadUserAction    | 
class LoadUserAction extends Action {
  reduce() { return new State('Mary', false); }
}                            |
      | An abstract action called BaseUser | 
abstract class BaseUser extends Action {
  reduce() { return new State('Mary', false); }
}                         |
      | A class that is not an action      | 
class UserList extends Array<string> {
  total() { return this.length; }
}
class User {
  reduce() { return 1; }
} |

  Scenario Outline: Actions that inherit reduce are reported too.
    Given An action that extends {Superclass}, and does not declare reduce.
    When The code is linted, with or without type information.
    Then It is reported.
    Examples: 
      | Superclass                                               | Code                                                                                                                                                                                                                                                                                                   | Name     |
      | OptimisticCommand                                        | 
class LikePost extends OptimisticCommand<State, boolean> {
  optimisticValue() { return true; }
  applyValueToState(state: State, value: boolean) { return new State(state.user, value); }
  getValueFromState(state: State) { return state.liked; }
  async sendCommandToServer(value: boolean) {}
} | LikePost |
      | an abstract action of the same file that declares reduce | 
abstract class LoadUserBase extends Action {
  abstract readonly name: string;
  reduce() { return new State(this.name, false); }
}
class LoadMary extends LoadUserBase {
  readonly name = 'Mary';
}                                                                                                 | LoadMary |

  Scenario: With type information, actions that inherit reduce from another file are reported.
    Given An action that extends an abstract action of another file, which declares reduce.
    When The code is linted with type information.
    Then It is reported.
    And Without type information, it is not reported, since the action can not be recognized.

  Scenario Outline: An action that other files may use is reported, but there is no suggestion.
    Given An action called LoadUser that is {Exported}.
    When The code is linted.
    Then It is reported, telling to rename it with the IDE.
    And There is no suggestion, since ESLint can only change this file.
    Examples: 
      | Exported                     | Code                                                                                                        |
      | declared with export         | 
export class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}                   |
      | declared with export default | 
export default class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}           |
      | exported by name later       | 
class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}
export { LoadUser };     |
      | exported as default later    | 
class LoadUser extends Action {
  reduce() { return new State('Mary', false); }
}
export default LoadUser; |

  Scenario: There is no suggestion when the new name is already used in the file.
    Given An action called LoadUser.
    And The file already uses the name LoadUserAction.
    When The code is linted.
    Then It is reported, but there is no suggestion, since renaming would clash with the other name.

  Scenario: Actions in test files are also checked.
    Given An action called LoadUser, declared in a test file.
    When The code is linted.
    Then It is reported.
