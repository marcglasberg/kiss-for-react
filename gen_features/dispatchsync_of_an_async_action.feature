Feature: dispatchSync of an async action

  Scenario: dispatchSync of an action with an async reducer that fails throws, and the error does not go unhandled.
    Given An action whose async reducer fails.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And There is no unhandled rejection.
    And The reducer error is logged.

  Scenario: dispatchSync of an action with an async before that fails throws, and the error does not go unhandled.
    Given An action whose async before method fails.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And There is no unhandled rejection.
    And The before error is logged.

  Scenario: dispatchSync of an action with an async reducer that succeeds does not change the state.
    Given An action whose async reducer finishes and returns a new state.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The state stays the same, even after the async reducer finishes.

  Scenario: dispatchSync of an action with an async before that succeeds does not run the reducer.
    Given An action whose async before method finishes successfully.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The reducer never runs, and the state stays the same.
