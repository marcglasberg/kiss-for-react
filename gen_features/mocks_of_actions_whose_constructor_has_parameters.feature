Feature: Mocks of actions whose constructor has parameters

  Scenario: The mock of an action whose constructor has a parameter can be removed.
    Given An action whose constructor has a parameter.
    And The action is mocked.
    When The mock is removed, using the action type.
    Then Dispatching the action runs the original action again.

  Scenario: The mock of an action whose constructor has several parameters can be removed.
    Given An action whose constructor has several parameters, of different types.
    And The action is mocked.
    When The mock is removed, using the action type.
    Then Dispatching the action runs the original action again.

  Scenario: Removing the mock of an action with parameters keeps the mocks of other actions.
    Given An action whose constructor has a parameter, and an action without parameters.
    And Both actions are mocked.
    When The mock of the action with a parameter is removed.
    Then Dispatching the action with a parameter runs the original action.
    And Dispatching the action without parameters still runs its mock.

  Scenario: Removing the mock of an action with parameters that was not mocked does nothing.
    Given An action whose constructor has a parameter, which is not mocked.
    And Another action is mocked.
    When The mock of the action with a parameter is removed.
    Then Dispatching the action with a parameter runs the original action.
    And The other action is still mocked.

  Scenario: The mock of an action whose constructor has parameters can be read.
    Given An action whose constructor has a parameter.
    And The action is mocked.
    When The mock is read, using the action type.
    Then We get the mock function, which accepts that action and returns the mock action.

  Scenario: After the mock of an action with parameters is removed, reading it gives nothing.
    Given An action whose constructor has a parameter.
    And The action is mocked.
    When The mock is removed.
    Then Reading the mock of that action type gives undefined.
