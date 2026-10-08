Feature: Wait timeout defaults

  Scenario Outline: The wait methods meant for tests time out after 3 seconds by default.
    Given An action that takes a long time is in progress.
    When We wait for it with a test-only wait method, without giving a timeout.
    Then The wait does not time out before 3 seconds.
    And The wait fails with a TimeoutException at 3 seconds.
    Examples: 
      | Method                    |
      | waitActionCondition       |
      | waitAllActions            |
      | waitActionType            |
      | waitAllActionTypes        |
      | waitAnyActionTypeFinishes |

  Scenario: waitCondition and dispatchWhen require a timeout.
    Given The wait methods that may be used in production: waitCondition and dispatchWhen.
    When We call them without a timeout.
    Then The code does not compile.

  Scenario: waitCondition with timeout 0 never times out.
    Given We wait for a state condition, with timeoutMillis 0.
    When A long time passes, more than the default timeout.
    Then The wait has not failed.
