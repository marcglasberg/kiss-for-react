Feature: Failed action

  Scenario: Checking if a SYNC action has failed.
    Given A SYNC action.
    When The action is dispatched twice with `dispatch(action)`.
    And The action fails the first time, but not the second time.
    Then We can check that the action failed the first time, but not the second.
    And We can get the action exception the first time, but null the second time.
    And We can clear the failing flag.

  Scenario: Dispatching an action again clears its failed state, even if nobody checked it before.
    Given A SYNC action that failed, and nobody called `isFailed` or `exceptionFor` for it.
    When The action is dispatched again and succeeds.
    And Only then `isFailed` and `exceptionFor` are called for it.
    Then The action is not failed, and has no exception.

  Scenario: The failed state is cleared when the action is dispatched again, not when it finishes.
    Given An ASYNC action that failed, and nobody called `isFailed` or `exceptionFor` for it.
    When The action is dispatched again, and is still running.
    Then The action is not failed, and has no exception.
    And If it fails again, it is failed again, with the new exception.

  Scenario: Checking if an ASYNC action has failed.
    Given An ASYNC action.
    When The action is dispatched twice with `dispatch(action)`.
    And The action fails the first time, but not the second time.
    Then We can check that the action failed the first time, but not the second.
    And We can get the action exception the first time, but null the second time.
    And We can clear the failing flag.
