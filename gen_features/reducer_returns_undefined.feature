Feature: Reducer returns undefined

  Scenario: A SYNC reducer that returns undefined does not change the state.
    Given A SYNC action whose reducer returns undefined.
    When The action is dispatched with dispatch, dispatchSync, or dispatchAndWait.
    Then The state is not changed.

  Scenario: An ASYNC reducer that resolves to undefined does not change the state.
    Given An ASYNC action whose reducer resolves to undefined, or to a function that returns undefined.
    When The action is dispatched.
    Then The state is not changed.

  Scenario: A SYNC reducer that returns undefined after an ASYNC "before" does not change the state.
    Given An action with an ASYNC "before" method, whose SYNC reducer returns undefined.
    When The action is dispatched.
    Then The state is not changed.

  Scenario: The reducer type allows returning null, but not undefined.
    Given Actions whose reducers return null, or undefined.
    When The code is type-checked.
    Then Returning null compiles.
    And Returning undefined does not compile.
