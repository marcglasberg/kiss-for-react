Feature: persistAndPausePersistor during logOut

  Scenario Outline: persistAndPausePersistor during logOut does not save the state of the previous user.
    Given A store with a persistor, and a state of the previous user that is not saved yet.
    And A save of the previous user's state would take [Old save] ms, and a save of the initial-state 0 ms.
    When logOut is called, and while it waits for its throttle, persistAndPausePersistor is called.
    Then The state of the previous user is never saved.
    And The saved state, and the last persisted state, are the initial-state of logOut.
    And When persistAndPausePersistor finishes, the initial-state of logOut is already saved.
    Examples: 
      | Old save |
      | 60       |
      | 0        |

  Scenario: After persistAndPausePersistor is called during logOut, the persistor stays paused after logOut.
    Given A store with a persistor.
    And persistAndPausePersistor was called while logOut was running.
    When logOut finishes, and then the state changes.
    Then The new state is not saved, since the persistor is paused.
    And When persistAndPausePersistor is called again, the new state is saved.

  Scenario: A logOut waits for the save of another logOut, before deleting and saving its initial-state.
    Given A store with a persistor.
    And A 1st logOut, whose save of its initial-state {n: 1} takes 60 ms.
    When A 2nd logOut, with initial-state {n: 2}, runs at the same time, and its save takes 0 ms.
    Then The 2nd logOut deletes and saves only after the save of the 1st one finishes.
    And The saved state is the initial-state of the 2nd logOut, which is also the store state.
