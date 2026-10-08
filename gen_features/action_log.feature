Feature: Action log

  Scenario: The state observer can read what the action logged.
    Given A store with a state observer.
    And An action that logs two values while it runs.
    When The action is dispatched.
    Then The state observer gets the logged values, in order, by calling getLog().
