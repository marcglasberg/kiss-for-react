Feature: dispatchWhen met by the same state change

  Scenario: A dispatchWhen is not dispatched if an earlier one, met by the same state change, made its condition false.
    Given Two dispatchWhen that buy for 100 when the cash is at least 100.
    When The cash is set to 100.
    Then Only the first buy is dispatched, since after it the cash is 0.
    And The cash never goes below zero.

  Scenario: A dispatchWhen whose condition was made false keeps waiting, and is dispatched when it is met again.
    Given Two dispatchWhen that buy for 100 when the cash is at least 100.
    And The cash was set to 100, so only the first one was dispatched.
    When The cash is set to 100 again.
    Then The second buy is dispatched now.

  Scenario: A dispatchWhen whose condition was made false keeps its timeout.
    Given Two dispatchWhen that buy for 100 when the cash is at least 100, with a timeout and an onTimeout.
    And The cash was set to 100, so only the first one was dispatched.
    When The timeout expires, and the cash is never 100 again.
    Then The second buy is never dispatched, and its onTimeout is called.
    And The first one does not call its onTimeout.

  Scenario: All dispatchWhen met by the same state change are dispatched, if none makes the others false.
    Given Three dispatchWhen that log a text when the cash is at least 100.
    When The cash is set to 100.
    Then The three are dispatched, in the order of the dispatchWhen calls.

  Scenario: A dispatchWhen whose condition is made false is skipped, but the ones after it are still dispatched.
    Given A dispatchWhen that buys for 100 when the cash is at least 100.
    And Another one, that also buys for 100 when the cash is at least 100.
    And A third one, that logs a text when the cash is at least 0.
    When The cash is set to 100.
    Then The first buy and the log are dispatched, but not the second buy.

  Scenario: An async dispatchWhen action does not change the state in between, so the next one is still dispatched.
    Given Two dispatchWhen with an async action that buys for 100 when the cash is at least 100.
    When The cash is set to 100.
    Then Both async buys are dispatched, since the state only changes when they finish.

  Scenario: A dispatchWhen whose condition throws when checked again does not dispatch, and does not affect the others.
    Given A dispatchWhen that buys for 100 when the cash is at least 100.
    And A dispatchWhen whose condition is met when the cash is 100, but throws when the cash is 0.
    And A dispatchWhen that logs a text when the cash is at least 0.
    When The cash is set to 100.
    Then The buy and the log are dispatched, but not the action of the condition that throws.
    And The error is logged.

  Scenario: A logOut dispatched by a dispatchWhen action cancels the next ones met by the same state change.
    Given A dispatchWhen that logs out when the cash is at least 100.
    And A dispatchWhen that logs a text when the cash is at least 100.
    When The cash is set to 100.
    Then The log out cancels the second dispatchWhen, which is not dispatched.
