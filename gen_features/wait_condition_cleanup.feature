Feature: Wait condition cleanup

  Scenario: The timeout timer of a state condition is cleared when the condition is met.
    Given We wait for a state condition, with a timeout.
    When The state changes so that the condition is met.
    Then The wait resolves.
    And No timer is left running.

  Scenario: A state condition is removed when its timeout expires.
    Given We wait for a state condition, with a short timeout.
    When The timeout expires before the condition is met.
    Then The wait fails with a timeout.
    And The condition is no longer checked on later state changes.

  Scenario: The timeout timer of an action condition is cleared when the condition is met.
    Given We wait for an action condition, with a timeout.
    When An action is dispatched so that the condition is met.
    Then The wait resolves.
    And No timer is left running for the wait.

  Scenario: An action condition is removed when its timeout expires.
    Given We wait for an action condition, with a short timeout.
    When The timeout expires before the condition is met.
    Then The wait fails with a timeout.
    And The condition is no longer checked on later dispatches.

  Scenario: A state condition with the timeout disabled starts no timer.
    Given We wait for a state condition, with timeout 0.
    When The state changes so that the condition is met.
    Then No timer was ever started, and the wait resolves.

  Scenario: A state condition times out with a TimeoutException.
    Given We wait for a state condition, with a short timeout.
    When The timeout expires before the condition is met.
    Then The error is a TimeoutException, which the caller can catch.
