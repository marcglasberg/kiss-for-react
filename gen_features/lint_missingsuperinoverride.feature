Feature: Lint: missing-super-in-override

  Scenario Outline: A before without super.before(), in an action that sets checkInternet, is an error.
    Given An action that sets checkInternet {Where}.
    And Its before does not call super.before().
    When The code is linted.
    Then There is an error in before.
    And There is a suggestion to call super.before() first.
    Examples: 
      | Where                            | Type information |
      | itself                           | true             |
      | itself                           | false            |
      | in a superclass of the same file | true             |
      | in a superclass of the same file | false            |

  Scenario Outline: The suggestion calls super.before() first, and the code compiles.
    Given An action that sets checkInternet, with {Before}.
    When The suggestion is applied.
    Then The before method is {Result}.
    And The code compiles, and there are no errors.
    Examples: 
      | Before                        | Code                                       | Result                                                                 |
      | an async before in one line   | async before() { await prepare(); }        | async before() { await super.before(); await prepare(); }              |
      | an async before in many lines | async before() {
    await prepare();
  }  | async before() {
    await super.before();
    await prepare();
  }    |
      | a sync before                 | before() { console.log(this.state.user); } | async before() { await super.before(); console.log(this.state.user); } |
      | an empty before               | before() {}                                | async before() { await super.before(); }                               |

  Scenario: There is no suggestion when before has a declared return type that is not a promise.
    Given An action that sets checkInternet, with a before declared as returning void.
    When The code is linted.
    Then There is an error in before, but no suggestion.

  Scenario: With type information, checkInternet inherited from another file is found.
    Given A base action, declared in another file, that sets checkInternet.
    And An action that extends it, with a before that does not call super.before().
    When The code is linted with type information.
    Then There is an error in before.
    And Without type information, there is no error, since the base action is not known.

  Scenario Outline: An action that sets checkInternet, but inherits a before without super.before(), is an error.
    Given A base action with a before that does not call super.before().
    And An action that extends it, and sets checkInternet.
    When The code is linted.
    Then There is an error in checkInternet, that names the base action.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Overrides of before that keep checkInternet working are fine.
    Given An action with {Case}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Case                                                             | Code                                                                                                                                                                                                                                                       |
      | checkInternet, and a before that calls super.before()            | 
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { await super.before(); await prepare(); }
  reduce() { return null; }
}                                                                                  |
      | a before without super.before(), and no checkInternet            | 
class LoadUser extends KissAction<State> {
  async before() { await prepare(); }
  reduce() { return null; }
}                                                                                                                                            |
      | a before without super.before(), and checkInternet turned off    | 
abstract class Action extends KissAction<State> {
  checkInternet: { dialog: boolean } | undefined = { dialog: true };
}
class LoadUser extends Action {
  checkInternet = undefined;
  async before() { await prepare(); }
  reduce() { return null; }
} |
      | a before that checks this.checkInternet by itself                | 
class LoadUser extends KissAction<State> {
  checkInternet = { dialog: true };
  async before() { if (this.checkInternet) await prepare(); }
  reduce() { return null; }
}                                                                                |
      | checkInternet, and an inherited before that calls super.before() | 
abstract class Action extends KissAction<State> {
  async before() { await super.before(); await prepare(); }
}
class LoadUser extends Action {
  checkInternet = { dialog: true };
  reduce() { return null; }
}                                         |

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
