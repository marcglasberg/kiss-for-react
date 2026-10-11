Feature: StateObserver that throws

  Scenario Outline: An action completes normally when the stateObserver throws.
    Given A stateObserver that throws.
    And A [Kind] action.
    When The action is dispatched with dispatchAndWait.
    Then The promise resolves with the action status "completed OK".
    And The state is the one returned by the action.
    And The error of the stateObserver is not given to the errorObserver.
    And The action is no longer in progress.
    Examples: 
      | Kind           | Expected n |
      | SYNC           | 5          |
      | ASYNC          | 5          |
      | SYNC unchanged | 0          |

  Scenario: dispatch does not throw when the stateObserver throws for a SYNC action.
    Given A stateObserver that throws.
    And A SYNC action that changes the state.
    When The action is dispatched with dispatch.
    Then The dispatch does not throw.
    And The state is changed.
    And The action does not count as failed.

  Scenario Outline: A failing action still goes through wrapError and fails with its own error when the stateObserver throws.
    Given A stateObserver that throws.
    And A [Kind] action that fails, and whose wrapError wraps the error.
    When The action is dispatched with dispatchAndWait.
    Then The wrapError of the action is called once.
    And The errorObserver gets the wrapped error.
    And The promise rejects with the wrapped error, not with the error of the stateObserver.
    Examples: 
      | Kind          |
      | failing SYNC  |
      | failing ASYNC |

  Scenario Outline: The state is persisted when the stateObserver throws.
    Given A stateObserver that throws.
    And A persistor with no throttle.
    When A [Kind] action changes the state.
    Then The persistor saves the new state.
    Examples: 
      | Kind  |
      | SYNC  |
      | ASYNC |

  Scenario: persistAndPausePersistor saves a state that was applied while the stateObserver threw.
    Given A stateObserver that throws.
    And A persistor with a long throttle, so the state is not saved right away.
    And A SYNC action changed the state.
    When persistAndPausePersistor is called.
    Then The persistor saves the new state.

  Scenario Outline: waitCondition sees a state change made while the stateObserver threw.
    Given A stateObserver that throws.
    And A waitCondition for the state n === 5.
    When A [Kind] action changes the state to n = 5.
    Then The waitCondition resolves.
    Examples: 
      | Kind  |
      | SYNC  |
      | ASYNC |

  Scenario Outline: dispatchWhen dispatches its action when the stateObserver throws.
    Given A stateObserver that throws.
    And A dispatchWhen action, waiting for the state n === 5.
    When A [Kind] action changes the state to n = 5.
    Then The dispatchWhen action is dispatched.
    Examples: 
      | Kind  |
      | SYNC  |
      | ASYNC |
