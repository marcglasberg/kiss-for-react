Feature: Retry and wrapReduce

  Scenario: A custom wrapReduce still runs when retry is on.
    Given An ASYNC action with retry on.
    And The action has a custom wrapReduce that discards the reducer result.
    When The action is dispatched.
    Then The custom wrapReduce runs.
    And The state does not change, because wrapReduce discarded the result.

  Scenario: A custom wrapReduce can change the result of an action with retry.
    Given An ASYNC action with retry on, whose reducer adds 1.
    And The action has a custom wrapReduce that adds another 10 to the result.
    When The action is dispatched.
    Then The state gets both changes.

  Scenario: A custom wrapReduce runs on every retry attempt.
    Given An ASYNC action with retry on, and a custom wrapReduce.
    And The reducer fails the first 2 times, and then succeeds.
    When The action is dispatched.
    Then The custom wrapReduce runs once per attempt, 3 times in total.
    And The state changes once.

  Scenario: Dispatching an action with retry does not replace its wrapReduce method.
    Given An ASYNC action with retry on, and a custom wrapReduce.
    When The action is dispatched.
    Then The action still has its own wrapReduce method.

  Scenario: When a custom wrapReduce throws synchronously, the action fails with its error.
    Given An ASYNC action with retry on.
    And The action has a custom wrapReduce that throws an error synchronously, without calling the reducer.
    When The action is dispatched.
    Then The action fails with the error thrown by wrapReduce.
    And It is not retried, since the reducer is ASYNC, and never ran.

  Scenario: A SYNC reducer with retry fails, even when a custom wrapReduce calls it asynchronously.
    Given A SYNC action with retry on, whose reducer always fails.
    And The action has a custom wrapReduce that waits a little, and only then calls the reducer.
    When The action is dispatched.
    Then The reducer runs only once.
    And It fails with a StoreException saying retry needs an ASYNC reducer.
