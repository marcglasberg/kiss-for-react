Feature: Persistor that throws synchronously

  Scenario Outline: persistAndPausePersistor completes after a save failed.
    Given A store with a persistor that saves to a synchronous storage.
    And The storage is full, so a save fails, and the persistor <Failure>.
    And The save was started by <Save started by>.
    When The storage is no longer full, and we await persistAndPausePersistor.
    Then It completes, and the app does not freeze.
    And The current state is saved.
    And The error of the save that failed is given to the errorObserver.
    Examples: 
      | Failure | Save started by    |
      | throws  | a state change     |
      | throws  | the throttle timer |
      | throws  | a PersistAction    |
      | rejects | a state change     |
      | rejects | the throttle timer |
      | rejects | a PersistAction    |

  Scenario Outline: persistAndPausePersistor can be called again, after its own save failed.
    Given A store with a persistor that saves to a synchronous storage.
    And A state change that is not yet saved, because of the throttle.
    And The storage is full.
    And We awaited persistAndPausePersistor, and its save failed, because the persistor <Failure>.
    When The storage is no longer full, and we await persistAndPausePersistor again.
    Then It completes, and the app does not freeze.
    And The current state is saved.
    Examples: 
      | Failure |
      | throws  |
      | rejects |

  Scenario Outline: persistAndPausePersistor completes after logOut failed to save the initial state.
    Given A store with a persistor that saves to a synchronous storage.
    And The storage is full.
    And We logged out, and saving the initial state failed, because the persistor <Failure>.
    When The storage is no longer full, and we await persistAndPausePersistor.
    Then It completes, and the app does not freeze.
    And The initial state is saved.
    Examples: 
      | Failure |
      | throws  |
      | rejects |

  Scenario Outline: After a save failed, the next state change is saved.
    Given A store with a persistor that saves to a synchronous storage.
    And The storage is full, so a save fails, and the persistor <Failure>.
    When The storage is no longer full, and the state changes again.
    Then The newest state is saved.
    And The persistor receives, as the last persisted state, the last state that was really saved.
    Examples: 
      | Failure |
      | throws  |
      | rejects |
