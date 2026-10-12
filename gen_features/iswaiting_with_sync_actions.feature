Feature: isWaiting with sync actions

  Scenario: Outside the action, isWaiting is always false for a sync action.
    Given A sync action.
    When The action is dispatched.
    Then isWaiting for its type is false before the dispatch, and false when the dispatch returns.

  Scenario: Inside a sync action, isWaiting for its own type is true, since it is being processed.
    Given A sync action whose reducer checks isWaiting for its own type.
    When The action is dispatched.
    Then isWaiting is true inside the reducer.
    And It is false when the dispatch returns.

  Scenario: Outside the action, isWaiting is true for an async action, until it finishes.
    Given An async action.
    When The action is dispatched.
    Then isWaiting for its type is true while it runs.
    And It is false when the action finishes.
