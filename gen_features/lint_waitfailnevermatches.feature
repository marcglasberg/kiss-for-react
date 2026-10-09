Feature: Lint: wait-fail-never-matches

  Scenario Outline: isWaiting or useIsWaiting with a sync action is a warning.
    Given A sync action.
    When It is checked with {Call}.
    Then There is a warning in the action class, saying it's always false.
    Examples: 
      | Call                       | Type information |
      | useIsWaiting(Increment)    | true             |
      | useIsWaiting(Increment)    | false            |
      | store.isWaiting(Increment) | true             |
      | store.isWaiting(Increment) | false            |

  Scenario Outline: isWaiting with an async action, an abstract class, or isFailed with a sync action, is fine.
    Given {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                     | Call                            |
      | An action with an async reduce                           | useIsWaiting(LoadCount)         |
      | An action with checkInternet, which makes it async       | useIsWaiting(WithCheckInternet) |
      | An abstract class, which also matches its subclasses     | useIsWaiting(BaseAction)        |
      | isFailed with a sync action, since sync actions can fail | useIsFailed(Increment)          |

  Scenario Outline: A sync action that may become async is not reported.
    Given A sync action that {Case}.
    When It is checked with useIsWaiting.
    Then There are no warnings.
    Examples: 
      | Case                                                | Code                                                                                                                                                       |
      | has an async subclass, which isWaiting also matches | 
class Sync extends KissAction<State> {
  reduce() { return this.state.add(1); }
}
class AsyncSubclass extends Sync {
  async before() { await load(); }
} |
      | overrides wrapReduce                                | 
class Sync extends KissAction<State> {
  wrapReduce(reduce: () => any) { return reduce; }
  reduce() { return this.state.add(1); }
}                      |

  Scenario: With type information, a sync action from another file is reported.
    Given A sync action declared in another file, and imported.
    When It is checked with useIsWaiting.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since the action's class is unknown.

  Scenario: isWaiting in tests is not reported.
    Given A test that checks that a sync action is not waiting.
    When The code is linted.
    Then There are no warnings.

  Scenario: With type information, a sync action with a subclass in another file is not reported.
    Given A sync action.
    And Another file has an async subclass of it, which isWaiting also matches.
    When The sync action is checked with useIsWaiting.
    Then There are no warnings.
