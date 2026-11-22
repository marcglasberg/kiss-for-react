Feature: Lint: missing-super-in-override

  Scenario Outline: A before without super.before() is fine, also in an action that sets checkInternet.
    Given An action with {Case}.
    When The code is linted.
    Then There are no errors, since the store checks the internet before it calls before.
    Examples: 
      | Case                                                                          | Code                                                                                                                                                                                                       |
      | checkInternet, and a before that does not call super.before()                 | \nclass LoadUser extends KissAction<State> {\n  checkInternet = { dialog: true };\n  async before() { await prepare(); }\n  reduce() { return null; }\n}                                                   |
      | checkInternet in a superclass, and a before that does not call super.before() | \nabstract class Action extends KissAction<State> {\n  checkInternet = { dialog: true };\n}\nclass LoadUser extends Action {\n  before(): void { console.log('Loading'); }\n  reduce() { return null; }\n} |
      | checkInternet, and an inherited before that does not call super.before()      | \nabstract class Action extends KissAction<State> {\n  async before() { await prepare(); }\n}\nclass LoadUser extends Action {\n  checkInternet = { dialog: true };\n  reduce() { return null; }\n}        |
      | checkInternet, and a before that calls super.before()                         | \nclass LoadUser extends KissAction<State> {\n  checkInternet = { dialog: true };\n  async before() { await super.before(); await prepare(); }\n  reduce() { return null; }\n}                             |

  Scenario Outline: Overriding reduce in an OptimisticCommand is an error.
    Given An action that extends OptimisticCommand {Where}, and overrides reduce.
    When The code is linted.
    Then There is an error in reduce.
    Examples: 
      | Where                                 | Type information |
      | directly                              | true             |
      | directly                              | false            |
      | through a base class of the same file | true             |
      | through a base class of the same file | false            |

  Scenario Outline: An OptimisticCommand without reduce, or a reduce in other actions, is fine.
    Given {Case}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Case                                                   | Code                                                                                                                                                                                                                                                                                                                                                                                                     |
      | An OptimisticCommand that does not override reduce     | \nclass SaveUser extends OptimisticCommand<State, string \| null> {\n  constructor(readonly user: string \| null) { super(); }\n  optimisticValue() { return this.user; }\n  getValueFromState(state: State) { return state.user; }\n  applyValueToState(state: State, user: string \| null) { return new State(user); }\n  async sendCommandToServer(user: string \| null) { await saveUser(user); }\n} |
      | A reduce in an action that is not an OptimisticCommand | \nabstract class MyCommand extends KissAction<State> {}\nclass SaveUser extends MyCommand {\n  reduce() { return null; }\n}                                                                                                                                                                                                                                                                              |

  Scenario Outline: Overriding reduce in an OptimisticSync is an error.
    Given An action that extends OptimisticSync {Where}, and overrides reduce.
    When The code is linted.
    Then There is an error in reduce.
    Examples: 
      | Where                                 | Type information |
      | directly                              | true             |
      | directly                              | false            |
      | through a base class of the same file | true             |
      | through a base class of the same file | false            |

  Scenario: An OptimisticSync that does not override reduce is fine.
    Given An OptimisticSync that does not override reduce.
    When The code is linted.
    Then There are no errors.

  Scenario Outline: Overriding reduce in an OptimisticSyncWithPush or a ServerPush is an error.
    Given An action that extends {Class} {Where}, and overrides reduce.
    When The code is linted.
    Then There is an error in reduce, saying not to override it in an {Class}.
    Examples: 
      | Class                  | Where                                 | Type information |
      | OptimisticSyncWithPush | directly                              | true             |
      | OptimisticSyncWithPush | directly                              | false            |
      | OptimisticSyncWithPush | through a base class of the same file | true             |
      | OptimisticSyncWithPush | through a base class of the same file | false            |
      | ServerPush             | directly                              | true             |
      | ServerPush             | directly                              | false            |
      | ServerPush             | through a base class of the same file | true             |
      | ServerPush             | through a base class of the same file | false            |

  Scenario: An OptimisticSyncWithPush and a ServerPush that do not override reduce are fine.
    Given An OptimisticSyncWithPush and a ServerPush that do not override reduce.
    When The code is linted.
    Then There are no errors.
