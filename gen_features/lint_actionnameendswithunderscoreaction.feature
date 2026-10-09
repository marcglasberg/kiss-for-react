Feature: Lint: action-name-ends-with-underscore-action

  Scenario Outline: An action whose name does not end with _Action is reported.
    Given An action called {Name}, which is not exported.
    When The code is linted.
    Then The action name is reported, telling to rename it to LoadUser_Action.
    And The suggestion renames the action and all its uses in the file.
    And The renamed code compiles.
    Examples: 
      | Name           | Type information |
      | LoadUser       | true             |
      | LoadUser       | false            |
      | LoadUserAction | true             |
      | LoadUserAction | false            |

  Scenario Outline: Actions whose names end with _Action, and abstract actions, are not reported.
    Given {Description}.
    When The code is linted, with or without type information.
    Then There are no reports.
    Examples: 
      | Description                          | Code                                                                                   |
      | An action called LoadUser_Action     | 
class LoadUser_Action extends Action {
  reduce() { return new State('Mary'); }
}     |
      | An abstract action called UserAction | 
abstract class UserAction extends Action {
  reduce() { return new State('Mary'); }
} |

  Scenario: An exported action is reported, but there is no suggestion.
    Given An exported action called LoadUser.
    When The code is linted.
    Then It is reported, telling to rename it with the IDE.
    And There is no suggestion, since ESLint can only change this file.
