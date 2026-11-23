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
      | Description                        | Code                                                                                                                      |
      | An action called LoadUserAction    | \nclass LoadUserAction extends Action {\n  reduce() { return new State('Mary', false); }\n}                               |
      | An abstract action called BaseUser | \nabstract class BaseUser extends Action {\n  reduce() { return new State('Mary', false); }\n}                            |
      | A class that is not an action      | \nclass UserList extends Array<string> {\n  total() { return this.length; }\n}\nclass User {\n  reduce() { return 1; }\n} |

  Scenario Outline: Actions that inherit reduce are reported too.
    Given An action that extends {Superclass}, and does not declare reduce.
    When The code is linted, with or without type information.
    Then It is reported.
    Examples: 
      | Superclass                                               | Code                                                                                                                                                                                                                                                                                                         | Name     |
      | OptimisticCommand                                        | \nclass LikePost extends OptimisticCommand<State, boolean> {\n  optimisticValue() { return true; }\n  applyValueToState(state: State, value: boolean) { return new State(state.user, value); }\n  getValueFromState(state: State) { return state.liked; }\n  async sendCommandToServer(value: boolean) {}\n} | LikePost |
      | an abstract action of the same file that declares reduce | \nabstract class LoadUserBase extends Action {\n  abstract readonly name: string;\n  reduce() { return new State(this.name, false); }\n}\nclass LoadMary extends LoadUserBase {\n  readonly name = 'Mary';\n}                                                                                                | LoadMary |

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
      | Exported                     | Code                                                                                                            |
      | declared with export         | \nexport class LoadUser extends Action {\n  reduce() { return new State('Mary', false); }\n}                    |
      | declared with export default | \nexport default class LoadUser extends Action {\n  reduce() { return new State('Mary', false); }\n}            |
      | exported by name later       | \nclass LoadUser extends Action {\n  reduce() { return new State('Mary', false); }\n}\nexport { LoadUser };     |
      | exported as default later    | \nclass LoadUser extends Action {\n  reduce() { return new State('Mary', false); }\n}\nexport default LoadUser; |

  Scenario: There is no suggestion when the new name is already used in the file.
    Given An action called LoadUser.
    And The file already uses the name LoadUserAction.
    When The code is linted.
    Then It is reported, but there is no suggestion, since renaming would clash with the other name.

  Scenario: Actions in test files are also checked.
    Given An action called LoadUser, declared in a test file.
    When The code is linted.
    Then It is reported.

  Scenario Outline: Actions in declaration files (.d.ts) are not checked.
    Given A declaration file that declares an action called LoadUser, without the declare keyword.
    When The code is linted.
    Then There are no reports, since the action is declared somewhere else.
    Examples: 
      | Type information |
      | true             |
      | false            |
