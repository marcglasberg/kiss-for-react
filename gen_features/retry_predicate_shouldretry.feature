Feature: Retry predicate (shouldRetry)

  Scenario: By default, an action with retry retries every error, including a UserException.
    Given An action with retry on, that does not override "shouldRetry".
    And Its reducer fails with a UserException twice, then succeeds.
    When The action is dispatched.
    Then The reducer runs 3 times, and the action completes OK.
    # This is the same as the Retry mixin of Async Redux, which retries every error.

  Scenario: When "shouldRetry" returns false, the action fails right away with that error, without retrying.
    Given An action with retry on, and up to 3 retries.
    And Its "shouldRetry" returns false for a NotFoundError.
    And Its reducer always fails with a NotFoundError.
    When The action is dispatched.
    Then The reducer runs only once, and there is no retry delay.
    And The action fails with the NotFoundError.

  Scenario: "shouldRetry" gets the error and the attempt number, and the action retries while it returns true.
    Given An action with retry on, and up to 10 retries.
    And Its reducer always fails, with a different error each time.
    And Its "shouldRetry" returns true for the first 2 attempts, and false for the 3rd.
    When The action is dispatched.
    Then "shouldRetry" is called 3 times, with the error of each failed attempt, and the attempt numbers 1, 2 and 3.
    And The reducer runs 3 times, and the action fails with the error of the 3rd attempt.

  Scenario: "shouldRetry" is not called when the retries ran out.
    Given An action with retry on, and up to 2 retries.
    And Its reducer always fails.
    And Its "shouldRetry" always returns true.
    When The action is dispatched.
    Then The reducer runs 3 times, and the action fails with the last error.
    And "shouldRetry" is called only twice, for attempts 1 and 2, since after the 3rd failure the action fails anyway.

  Scenario: An aborted action is not retried, and "shouldRetry" is not called.
    Given An action with retry on, whose "shouldRetry" always returns true.
    And Its reducer throws an AbortDispatchException.
    When The action is dispatched.
    Then The reducer runs only once, and the action is aborted, not failed.
    And "shouldRetry" is not called.

  Scenario: If "shouldRetry" itself throws, the action fails with that error.
    Given An action with retry on, whose "shouldRetry" throws an error.
    And Its reducer fails with a UserException.
    When The action is dispatched.
    Then The reducer runs only once.
    And The action fails with the error thrown by "shouldRetry", not with the UserException.

  Scenario: With unlimitedRetryCheckInternet, "shouldRetry" returning false stops the unlimited retries.
    Given An action with "unlimitedRetryCheckInternet = true", and there is internet.
    And Its reducer fails with a UserException twice, then always fails with a NotFoundError.
    And Its "shouldRetry" returns false for a NotFoundError.
    When The action is dispatched.
    Then The UserExceptions are retried, but the NotFoundError is not.
    And The reducer runs 3 times, and the action fails with the NotFoundError.
    # Without "shouldRetry", the action would retry the NotFoundError forever.

  Scenario: With unlimitedRetryCheckInternet, "shouldRetry" is not called while there is no internet.
    Given An action with "unlimitedRetryCheckInternet = true", whose "shouldRetry" always returns false.
    And There is no internet for the first 3 checks, and then there is.
    And Its reducer always succeeds.
    When The action is dispatched.
    Then The action keeps waiting for the internet, since "shouldRetry" is not called for the no-internet case.
    And When the internet comes back, the reducer runs, and the action completes OK.

  Scenario: With unlimitedRetryCheckInternet, the attempt number given to "shouldRetry" also counts the no-internet attempts.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet for the first 2 checks, and then there is.
    And Its reducer fails once with a UserException, then succeeds.
    When The action is dispatched.
    Then "shouldRetry" is called once, with attempt number 3: two attempts aborted for no internet, plus the one that failed.
    And This is the same number as "action.attempts".

  Scenario: An optimistic command with retry retries every error by default, including a UserException.
    Given An optimistic command with retry on, that does not override "shouldRetry".
    And Its server call fails with a UserException twice, then succeeds.
    When The command is dispatched.
    Then The server call runs 3 times, the optimistic value stays, and the command completes OK.

  Scenario: An optimistic command with retry gives up right away when "shouldRetry" returns false: it rolls back and fails.
    Given An optimistic command with retry on, and up to 3 retries.
    And Its "shouldRetry" returns false for a NotFoundError.
    And Its server call always fails with a NotFoundError.
    When The command is dispatched.
    Then The server call runs only once.
    And The optimistic value is applied, and then rolled back.
    And The command fails with the NotFoundError.

  Scenario: An optimistic command with retry calls "shouldRetry" with the error and the attempt number of each failed server call.
    Given An optimistic command with retry on, and up to 10 retries.
    And Its server call always fails, with a different error each time.
    And Its "shouldRetry" returns true for the first 2 attempts, and false for the 3rd.
    When The command is dispatched.
    Then "shouldRetry" is called 3 times, with the error of each failed call, and the attempt numbers 1, 2 and 3.
    And The server call runs 3 times, and the command fails with the error of the 3rd call.
