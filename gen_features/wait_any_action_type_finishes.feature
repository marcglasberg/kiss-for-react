Feature: Wait any action type finishes

  Scenario: Waiting for an action type to finish, without passing options.
    Given No actions are in progress.
    And We wait for any action of a type to finish, passing only the action types.
    When An action of that type is dispatched and finishes.
    Then The wait resolves with the action that finished.
    And The state was changed by that action.

  Scenario: Waiting without options ignores actions of other types.
    Given We wait for any action of a type to finish, passing only the action types.
    When An action of another type finishes first.
    And Then an action of the awaited type finishes.
    Then The wait resolves only with the action of the awaited type.

  Scenario: Waiting for an action type to finish, passing a timeout.
    Given We wait for any action of a type to finish, with a short timeout.
    When No action of that type is dispatched.
    Then The wait fails with a timeout.
