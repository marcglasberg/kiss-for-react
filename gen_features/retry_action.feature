Feature: Retry action

  Scenario: A SYNC action with retry fails, because only ASYNC actions can retry.
    Given A SYNC action that retries up to 10 times.
    And The action fails with a user exception the first 4 times.
    When The action is dispatched.
    Then It is not retried.
    And It does not change the state, and fails with a StoreException saying retry needs an ASYNC reducer.

  Scenario: A SYNC action with retry, whose reducer always throws, fails right away with a StoreException.
    Given A SYNC action that retries up to 3 times.
    And Its reducer always throws an error.
    When The action is dispatched.
    Then The reducer runs only once, with no retry delays.
    And It fails with a StoreException saying retry needs an ASYNC reducer, not with the original error.

  Scenario: A SYNC action with retry fails, even if its reducer does not change the state.
    Given A SYNC action with retry.
    And Its reducer returns null, or the unchanged state.
    When The action is dispatched.
    Then The reducer runs only once.
    And It fails with a StoreException saying retry needs an ASYNC reducer.

  Scenario: Action retries a few times and succeeds.
    Given An action that retries up to 10 times.
    And The action fails with a user exception the first 4 times.
    When The action is dispatched.
    Then It does change the state.

  Scenario: Action retries unlimited tries until it succeeds.
    Given An action marked with "UnlimitedRetries".
    And The action fails with a user exception the first 6 times.
    When The action is dispatched.
    Then It does change the state.
    # Without the "UnlimitedRetries" it would fail because the default is 3 retries.

  Scenario: Action retries a few times and fails.
    Given An action that retries up to 3 times.
    And The action fails with a user exception the first 4 times.
    When The action is dispatched.
    Then It does NOT change the state.

  Scenario: An action with retry succeeds the first time, without retrying.
    Given An ASYNC action that retries up to 10 times.
    When The action is dispatched and succeeds the first time.
    Then It changes the state, with no retry attempts.
    And It cannot be dispatched with dispatchSync, since it is ASYNC.

  Scenario: When the "before" method fails, the action is not retried.
    Given An action with retry, whose "before" method throws an error.
    When The action is dispatched.
    Then The reducer never runs, and there are no retry attempts.
    And The action fails with the error from "before".

  Scenario: When all attempts fail, only the last error is processed and shown.
    Given An action that retries up to 2 times.
    And Each attempt fails with a different UserException.
    When The action is dispatched.
    Then The action fails with the error of the last attempt.
    And The errors of the previous attempts are ignored.
    And The wrapError method, the state-observer and the dialog see only the last error.

  Scenario: A non-reentrant action with retry is not dispatched again while it waits to retry.
    Given A non-reentrant action with retry, that fails the first 2 times.
    When The action is dispatched.
    And The same action is dispatched again, while the first one waits to retry.
    Then The second dispatch is aborted.
    And The first action retries and succeeds.

  Scenario: After retrying, the reducer result is applied to the current state.
    Given An action with retry, that fails the first time, and then increments the count.
    When The action is dispatched.
    And While it waits to retry, another action changes the count to 10.
    Then The final count is 11.
    # The state is not reverted to what it was when the action was dispatched.
