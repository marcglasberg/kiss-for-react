Feature: wrapError that returns undefined

  Scenario Outline: A wrapError that returns undefined swallows the error, the same as returning null.
    Given A <Action> action that throws an error.
    And Its wrapError returns <Returned>.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves with the action status, since the error was swallowed.
    And The action status is "completed failed", since the reducer did not finish.
    And The status has the original error, and no wrapped error.
    And The action does not count as failed for isFailed and exceptionFor.
    And The state is not changed.
    Examples: 
      | Action | Returned  |
      | sync   | null      |
      | sync   | undefined |
      | async  | null      |
      | async  | undefined |

  Scenario: A SYNC action whose wrapError returns undefined does not throw when dispatched with dispatch.
    Given A SYNC action that throws an error.
    And Its wrapError returns undefined.
    When The action is dispatched with dispatch.
    Then dispatch does not throw.
    And The status has the original error, and no wrapped error.

  Scenario: An ASYNC action whose wrapError returns undefined does not cause an unhandled rejection.
    Given An ASYNC action that throws an error.
    And Its wrapError returns undefined.
    When The action is dispatched with dispatch, and nobody waits for it.
    Then There is no unhandled rejection.
    And The status has the original error, and no wrapped error.

  Scenario Outline: The errorObserver is not called when the action wrapError returns undefined.
    Given A <Action> action that throws an error, and has a wrapError that returns undefined.
    And A store with an errorObserver that returns the error it gets.
    When The action is dispatched with dispatchAndWait.
    Then The errorObserver is not called, the same as when wrapError returns null.
    And dispatchAndWait resolves.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario: The type of wrapError does not allow returning undefined, but allows returning null.
    Given An action whose wrapError returns the error only for UserExceptions.
    And For other errors it ends without a return, which returns undefined.
    When The action is compiled.
    Then It does not compile, since wrapError may not return undefined.
    And The type of wrapError allows returning null, or an error.
    And If it still runs (for example, in JavaScript), the other errors are swallowed.
    And The UserExceptions are not swallowed.
