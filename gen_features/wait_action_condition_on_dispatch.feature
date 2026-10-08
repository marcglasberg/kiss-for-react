Feature: Wait action condition on dispatch

  Scenario: The condition is checked when an async action is dispatched.
    Given No actions are in progress.
    And We wait for the condition "some action is in progress".
    When An async action is dispatched.
    Then The wait resolves while the action is still in progress.
    And The trigger action is the dispatched action.

  Scenario: The condition is checked when a sync action is dispatched.
    Given No actions are in progress.
    And We wait for the condition "a sync action is in progress".
    When A sync action is dispatched.
    Then The wait resolves, with the sync action as the trigger action.

  Scenario: The condition is checked again when a second action is dispatched.
    Given An async action is in progress.
    And We wait for the condition "two actions are in progress".
    When Another async action is dispatched.
    Then The wait resolves, with the second action as the trigger action.

  Scenario: Waiting for an action type to finish still ignores its dispatch.
    Given We wait for any action of a given type to finish.
    When An action of that type is dispatched.
    Then The wait only resolves after the action finishes.
