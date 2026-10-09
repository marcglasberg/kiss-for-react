Feature: waitActionType inside an action

  Scenario: Inside an action, waitActionType resolves right away when no action of that type is running.
    Given No action of type Other is running.
    When An action calls waitActionType(Other), without passing completeImmediately.
    Then The action completes ok, and waitActionType returns null.

  Scenario: Inside an action, waitActionType waits for a running action of that type to finish.
    Given An action of type Other is running.
    When An action calls waitActionType(Other).
    Then It waits until Other finishes, and returns it.

  Scenario: Inside an action, waitActionType still throws when no action is running, if completeImmediately is false.
    Given No action of type Other is running.
    When An action calls waitActionType(Other, { completeImmediately: false }).
    Then The action fails.

  Scenario: Inside an action, waitAllActionTypes resolves right away when no action of those types is running.
    Given No action of type Other is running.
    When An action calls waitAllActionTypes([Other]), without passing completeImmediately.
    Then The action completes ok.

  Scenario: Inside an action, waitAllActionTypes waits for running actions of those types to finish.
    Given An action of type Other is running.
    When An action calls waitAllActionTypes([Other]).
    Then It waits until Other finishes.
