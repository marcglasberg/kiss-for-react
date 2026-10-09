Feature: Lint: async-after

  Scenario Outline: An after method that returns a promise is an error.
    Given An action with {Case}.
    When The code is linted.
    Then There is an error in after.
    Examples: 
      | Case                                         | Code                                            | Type information |
      | an async after                               | 
  async after() { await cleanup(); }           | true             |
      | an async after                               | 
  async after() { await cleanup(); }           | false            |
      | an after with a declared Promise return type | 
  after(): Promise<void> { return cleanup(); } | false            |

  Scenario: With type information, an after that returns a promise without declaring it is an error.
    Given An action whose after method returns a promise, with no declared return type.
    When The code is linted.
    Then With type information, there is an error in after.
    And Without type information, there is no error.

  Scenario: An async after without await has a suggestion to remove async.
    Given An action with an async after method that has no await.
    When The suggestion is applied.
    Then after is sync.
    And The code compiles, and there are no errors.

  Scenario Outline: A sync after, or async methods that are not after, are fine.
    Given {Case}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Case                                               | Code                                                                                                                               |
      | An action with a sync after                        | 
class Save extends KissAction<State> {
  reduce() { return null; }
  after() { log(); }
}                                         |
      | An action with an async before and reduce          | 
class Save extends KissAction<State> {
  async before() { await cleanup(); }
  async reduce() { await cleanup(); return null; }
} |
      | A class that is not an action, with an async after | 
class Base { after(): unknown { return null; } }
class Job extends Base {
  async after() { await cleanup(); }
}                  |
