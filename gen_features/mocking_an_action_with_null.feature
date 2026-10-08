Feature: Mocking an action with null

  Scenario: Mocking an action with null aborts its dispatch.
    Given An action is mocked with null.
    When The action is dispatched.
    Then No error is thrown.
    And The state does not change.

  Scenario: Mocking an action with null aborts its dispatchSync.
    Given A sync action is mocked with null.
    When The action is dispatched with dispatchSync.
    Then No error is thrown.
    And The state does not change.

  Scenario: Mocking an async action with null aborts its dispatchAndWait.
    Given An async action is mocked with null.
    When The action is dispatched with dispatchAndWait.
    Then The returned promise resolves.
    And The state does not change.

  Scenario: Removing a null mock makes the action work again.
    Given An action is mocked with null.
    And The mock is removed.
    When The action is dispatched.
    Then The action changes the state.
