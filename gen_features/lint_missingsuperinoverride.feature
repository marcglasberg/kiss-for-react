Feature: Lint: missing-super-in-override

  Scenario Outline: A before without super.before() is fine, also in an action that sets checkInternet.
    Given An action with {Case}.
    When The code is linted.
    Then There are no errors, since the store checks the internet before it calls before.
    Examples: 
      | Case                                                                          | Code                                                                                                                                                                                                |
      | checkInternet, and a before that does not call super.before()                 | 
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await prepare(); }
  reduce() { return null; }
}                                                 |
      | checkInternet in a superclass, and a before that does not call super.before() | 
abstract class Action extends KissAction<State> {
  checkInternet = { dialog: true };
}
class LoadUser extends Action {
  before(): void { console.log('Loading'); }
  reduce() { return null; }
} |
      | checkInternet, and an inherited before that does not call super.before()      | 
abstract class Action extends KissAction<State> {
  async before() { await prepare(); }
}
class LoadUser extends Action {
  checkInternet = { dialog: true };
  reduce() { return null; }
}        |
      | checkInternet, and a before that calls super.before()                         | 
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await super.before(); await prepare(); }
  reduce() { return null; }
}                           |

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
      | Case                                                   | Code                                                                                                                                                                                                                                                                                                                                                                                          |
      | An OptimisticCommand that does not override reduce     | 
class SaveUser extends OptimisticCommand<State, string | null> {
  constructor(readonly user: string | null) { super(); }
  optimisticValue() { return this.user; }
  getValueFromState(state: State) { return state.user; }
  applyValueToState(state: State, user: string | null) { return new State(user); }
  async sendCommandToServer(user: string | null) { await saveUser(user); }
} |
      | A reduce in an action that is not an OptimisticCommand | 
abstract class MyCommand extends KissAction<State> {}
class SaveUser extends MyCommand {
  reduce() { return null; }
}                                                                                                                                                                                                                                                                       |

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
