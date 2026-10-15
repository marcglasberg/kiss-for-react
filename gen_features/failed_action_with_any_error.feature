Feature: Failed action with any error

  Scenario: A SYNC action that fails with an error which is not a UserException.
    Given A SYNC action that throws a plain Error (not a UserException).
    When The action is dispatched, and the error is caught.
    Then `isFailed` is true for the action type.
    And `exceptionFor` is null, since the error is not a UserException.
    And Dispatching the action again, and succeeding, clears the failed state.

  Scenario: An ASYNC action that fails with an error which is not a UserException.
    Given An ASYNC action that throws a plain Error (not a UserException).
    When The action is dispatched with `dispatchAndWait`, and the rejection is caught.
    Then `isFailed` is true for the action type.
    And `exceptionFor` is null, since the error is not a UserException.
    And Dispatching the action again, and succeeding, clears the failed state.

  Scenario: `clearExceptionFor` clears an action that failed with a plain error.
    Given An action that failed with a plain Error (not a UserException).
    When We call `clearExceptionFor` for its type.
    Then `isFailed` is false.

  Scenario: Both errors are reported: first a plain error, then a UserException.
    Given An action that failed with a plain Error.
    When The same action type is dispatched again, and fails with a UserException.
    Then `isFailed` is true, and `exceptionFor` returns the UserException.

  Scenario: An action whose error is swallowed by `wrapError` did not fail.
    Given An action that throws, but its `wrapError` returns null (swallows the error).
    When The action is dispatched.
    Then `isFailed` is false, since the error was swallowed.

  Scenario: An action aborted with `AbortDispatchException` did not fail.
    Given An action that throws `AbortDispatchException`.
    When The action is dispatched.
    Then `isFailed` is false, since the action was aborted, not failed.

  Scenario: Inside an action, `isFailed` sees a failure with a plain error.
    Given An action that failed with a plain Error (not a UserException).
    When Another action calls `this.isFailed` for that type, in its reducer.
    Then It gets true.
