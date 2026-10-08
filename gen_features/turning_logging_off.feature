Feature: Turning logging off

  Scenario: With the logger set to null, nothing is logged.
    Given A store created with the logger set to null.
    When An action is dispatched.
    Then The action runs and changes the state.
    And Nothing is printed to the console.

  Scenario: With the logger set to null, log messages are not even built.
    Given A store created with the logger set to null.
    When An action is dispatched.
    Then The description of the action is never built.

  Scenario: With the logger set to null, state changes are not described.
    Given A store created with the logger set to null.
    And Logging of state changes is turned on.
    When An action changes the state.
    Then The description of the state change is never built.

  Scenario: With a logger, log messages are still built and logged.
    Given A store created with a logger.
    When An action is dispatched.
    Then The action is logged with its description.

  Scenario: An empty logger function still turns logging off.
    Given A store created with a logger that does nothing.
    When An action is dispatched.
    Then The action runs and changes the state.
    And Nothing is printed to the console.

  Scenario: Without a logger, messages are printed to the console.
    Given A store created without a logger.
    When An action is dispatched.
    Then The action is printed to the console.
