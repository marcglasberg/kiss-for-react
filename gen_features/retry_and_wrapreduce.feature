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
