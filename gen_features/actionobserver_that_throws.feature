Feature: ActionObserver that throws

  Scenario Outline: dispatchAndWait settles when the actionObserver throws as the action finishes.
    Given An actionObserver that throws when the action finishes (ini false).
    And A [Kind] action that changes the state.
    When The action is dispatched with dispatchAndWait.
    Then The promise resolves with the action status "completed OK".
    And The state is changed.
    And The action is no longer in progress.
    Examples: 
      | Kind  |
      | SYNC  |
      | ASYNC |

  Scenario Outline: A failing action still rejects with its own error when the actionObserver throws as it finishes.
    Given An actionObserver that throws when the action finishes (ini false).
    And A [Kind] action that fails with an error.
    When The action is dispatched with dispatchAndWait.
    Then The promise rejects with the error of the action, not the error of the actionObserver.
    And The action is no longer in progress.
    Examples: 
      | Kind          |
      | failing SYNC  |
      | failing ASYNC |

  Scenario: dispatch does not throw when the actionObserver throws as a SYNC action finishes.
    Given An actionObserver that throws when the action finishes (ini false).
    And A SYNC action that changes the state.
    When The action is dispatched with dispatch.
    Then The dispatch does not throw.
    And The state is changed.

  Scenario Outline: The action still runs when the actionObserver throws as the action starts.
    Given An actionObserver that throws when the action starts (ini true).
    And A [Kind] action that changes the state.
    When The action is dispatched with dispatchAndWait.
    Then The promise resolves with the action status "completed OK".
    And The state is changed.
    And The actionObserver is also called when the action finishes.
    Examples: 
      | Kind  |
      | SYNC  |
      | ASYNC |
