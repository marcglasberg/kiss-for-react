Feature: ClassPersistor

  Scenario: When nothing is saved, the store saves its initial-state with the ClassPersistor.
    Given A ClassPersistor with nothing saved.
    When The store is created with it, and it is ready.
    Then The initial-state is saved.
    And It can be read back, with its classes.

  Scenario: When the store is created, the state saved by the ClassPersistor replaces the initial-state.
    Given A ClassPersistor with a saved state.
    When The store is created with it, and it is ready.
    Then The store state is the saved state, with its classes.

  Scenario: The ClassPersistor saves the whole new state each time.
    Given A ClassPersistor.
    When A state is saved, with some last persisted state.
    Then The whole new state is saved, no matter the last persisted state.

  Scenario: State changes are saved with the ClassPersistor, and are read back when the app restarts.
    Given A store with a ClassPersistor.
    When The state changes, and it is saved.
    And The app restarts, with a new store.
    Then The new store state is the changed state.

  Scenario: Deleting the state with the ClassPersistor deletes the saved state.
    Given A ClassPersistor with a saved state.
    When The state is deleted.
    Then Nothing is saved anymore.

  Scenario: If the saved state can not be read, the store saves its initial-state instead.
    Given A ClassPersistor whose saved state is corrupted.
    When The store is created with it, and it is ready.
    Then The error is given to the errorObserver.
    And The store state is the initial-state, and it is saved.
