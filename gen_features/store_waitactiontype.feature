Feature: Store waitActionType

  Scenario: The store waits until no action of a given type is in progress.
    Given An async action of type ChangeName was dispatched and is in progress.
    When We wait for the ChangeName type.
    Then The wait resolves with that action, after it finishes and changes the state.

  Scenario: To wait for an action that is dispatched later, the store waits for any action of that type to finish.
    Given An action that later dispatches a ChangeName action.
    When We dispatch it, and wait for any ChangeName action to finish.
    Then The wait resolves with the ChangeName action, and its state change is applied.
