Feature: TimeoutException

  Scenario: TimeoutException is exported, so its default timeout can be changed.
    Given The library is imported.
    When The default timeout of TimeoutException is changed.
    Then The new default timeout is used.

  Scenario: TimeoutException has a stack trace showing where it was created.
    Given A function that creates a TimeoutException.
    When The exception is created.
    Then Its stack trace includes the function that created it.
