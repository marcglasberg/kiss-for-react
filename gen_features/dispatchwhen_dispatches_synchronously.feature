Feature: dispatchWhen dispatches synchronously

  Scenario: If the condition is already true, the action is dispatched before dispatchWhen returns.
    Given The state already meets the condition.
    When We call dispatchWhen with a sync action.
    Then The state was already changed by the action when dispatchWhen returns.

  Scenario: When an action makes the condition true, the action is dispatched before that dispatch returns.
    Given A dispatchWhen waiting for n to be 1.
    When A sync action changes n to 1.
    Then The dispatchWhen action was already dispatched when that dispatch returns.

  Scenario: The action is dispatched in the state that met the condition, even if the next dispatch would change it.
    Given A dispatchWhen that sets n to 100 when n is 1.
    When Two sync actions increment n, one right after the other.
    Then The dispatchWhen action is dispatched right after the first one, when n is 1.
    And The second increment is applied after it.

  Scenario: When an async action makes the condition true, the action is dispatched as soon as the state changes.
    Given A dispatchWhen waiting for n to be 1.
    When An async action changes n to 1.
    Then The dispatchWhen action was already dispatched when the async action finishes.

  Scenario: Other waits for the same state still see the state that met their condition.
    Given A dispatchWhen that resets n to 0 when n is 1.
    And A waitCondition, created after it, that waits for n to be 1.
    When An action changes n to 1.
    Then The waitCondition resolves with that action.
    And The state is 0, because the dispatchWhen action was dispatched.

  Scenario: dispatchWhen does not throw, and does not dispatch, when the condition throws.
    Given A condition that throws.
    When We call dispatchWhen with it, or the state changes while it waits.
    Then dispatchWhen and the action that changed the state do not throw.
    And The dispatchWhen action is not dispatched.
    And The error is logged.

  Scenario: When the condition is met, the timeout no longer fires.
    Given A dispatchWhen with a short timeout and an onTimeout callback.
    When The condition is met before the timeout.
    Then The action is dispatched, and onTimeout is never called.
