Feature: Async after method

  Scenario: An async after method that throws does not cause an unhandled rejection.
    Given A sync action whose after method is async and throws an error.
    When The action is dispatched.
    Then The error does not become an unhandled promise rejection.
    And The error is logged.
    And The action completes OK.

  Scenario: An async after method that throws, in an async action, does not cause an unhandled rejection.
    Given An async action whose after method is async and throws an error.
    When The action is dispatched.
    Then The error does not become an unhandled promise rejection.
    And The error is logged.
    And The action completes OK.

  Scenario: An async after method that does not throw works normally.
    Given An action whose after method is async and does not throw.
    When The action is dispatched.
    Then The after method runs, and nothing is logged as an error.
