Feature: A failed saveInitialState is not considered persisted

  Scenario: At startup, if saving the initial-state fails, nothing is considered persisted.
    Given A persistor with no saved state, whose saveInitialState fails.
    When The store starts.
    Then The last persisted state is null.
    And The next state change is saved in full (the persistor receives a null last persisted state).

  Scenario: If saveInitialStateInPersistence fails, nothing is considered persisted.
    Given A store whose initial-state was saved.
    And A persistor whose saveInitialState fails.
    When saveInitialStateInPersistence is called.
    Then It rejects.
    And The last persisted state is null.
    And The next state change is saved in full (the persistor receives a null last persisted state).

  Scenario: If saveInitialStateInPersistence succeeds, the saved state is considered persisted.
    Given A store whose initial-state was saved.
    When saveInitialStateInPersistence is called with another state, and succeeds.
    Then The last persisted state is that state.
    And The next state change is saved as a difference from that state.
