Feature: Lint: extend-base-action

  Scenario Outline: An action that extends KissAction directly is a warning, when there is a base action in the same file.
    Given A base action, and an action that extends KissAction<State> directly, in the same file.
    When The code is linted.
    Then There is a warning in KissAction<State>, that names the base action.
    And The suggestion extends the base action, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, the base action can be in another file.
    Given A base action in another file.
    And An action that extends KissAction<State> directly, and uses KissAction only there.
    When The suggestion is applied.
    Then The action extends the base action.
    And The import of KissAction is replaced with the import of the base action.
    And The code compiles.

  Scenario: The suggestion keeps the other imports from Kiss, and adds the import after the last one.
    Given An action that extends KissAction<State> directly, in a file that also imports Store from Kiss.
    And A base action in another file.
    When The suggestion is applied.
    Then KissAction is removed from the import, and the base action is imported after the last import.
    And The code compiles.

  Scenario Outline: Without a base action, the warning says to create one, with no suggestion.
    Given An action that extends KissAction<State> directly.
    And {Case}.
    When The code is linted.
    Then There is a warning that says to create a base action.
    And There is no suggestion.
    Examples: 
      | Case                                                                 | Files       | Type information |
      | There is no base action in the project                               | none        | true             |
      | There is no base action in the file                                  | none        | false            |
      | The base action is in another file, but there is no type information | base action | false            |
      | The only abstract action of the project has another state            | other state | true             |

  Scenario: A base action declared after the action, in the same file, is not suggested.
    Given An action that extends KissAction<State> directly.
    And A base action declared after it, in the same file.
    When The code is linted.
    Then There is a warning, without suggestions, since a class can't be used before its declaration.

  Scenario Outline: Classes that are not reported.
    Given {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                      | Code                                                                                                                             |
      | An action that extends the base action    | 
abstract class Action extends KissAction<State> {}
class LoadUser extends Action {
  reduce() { return new State(); }
}         |
      | An abstract class that extends KissAction | 
abstract class Action extends KissAction<State> {}                                                                              |
      | An action with a generic state            | 
class Reset<St> extends KissAction<St> {
  constructor(readonly initial: St) { super(); }
  reduce() { return this.initial; }
} |

  Scenario: Actions that extend KissAction directly are not reported in tests.
    Given A test file with an action that extends KissAction<State> directly.
    When The code is linted.
    Then There are no warnings.
