Feature: Lint: action-name-without-action

  Scenario Outline: An action whose name ends with Action is reported.
    Given An action called {Name}, which is not exported.
    When The code is linted.
    Then The action name is reported, telling to rename it to LoadUser.
    And The suggestion renames the action and all its uses in the file.
    And The renamed code compiles.
    Examples: 
      | Name            | Type information |
      | LoadUserAction  | true             |
      | LoadUserAction  | false            |
      | LoadUser_Action | true             |
      | LoadUser_Action | false            |

  Scenario Outline: Actions whose names do not end with Action, and abstract actions, are not reported.
    Given {Description}.
    When The code is linted, with or without type information.
    Then There are no reports.
    Examples: 
      | Description                                               | Code                                                                                   |
      | An action called LoadUser                                 | 
class LoadUser extends Action {
  reduce() { return new State('Mary'); }
}            |
      | An action called ActionLog, with Action only at the start | 
class ActionLog extends Action {
  reduce() { return new State('Mary'); }
}           |
      | An abstract action called UserAction                      | 
abstract class UserAction extends Action {
  reduce() { return new State('Mary'); }
} |

  Scenario Outline: There is no suggestion when the new name is already used in the file, or is a global.
    Given An action called {Name}.
    And The name {New name} is {Where}.
    When The code is linted.
    Then It is reported, but there is no suggestion.
    Examples: 
      | Name           | New name | Where                    | Code                             |
      | LoadUserAction | LoadUser | already used in the file | 
type LoadUser = { id: string }; |
      | ErrorAction    | Error    | a global class           |                                  |

  Scenario: An exported action is reported, but there is no suggestion.
    Given An exported action called LoadUserAction.
    When The code is linted.
    Then It is reported, telling to rename it with the IDE.
    And There is no suggestion, since ESLint can only change this file.
