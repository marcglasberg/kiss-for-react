Feature: Pausing the persistor before the store is ready

  Scenario: Pausing the persistor before the store is ready keeps the state read from the persistor as the persisted state.
    Given There is some state already persisted.
    And The persistor only saves the parts of the state that changed.
    And The persistor is paused before the store is ready.
    When The store becomes ready.
    Then The last persisted state is the state read from the persistor.

  Scenario: A change made after the store is ready is saved when the persistor resumes, if it was paused before the store was ready.
    Given There is some state already persisted.
    And The persistor only saves the parts of the state that changed.
    And The persistor is paused before the store is ready.
    And The store becomes ready, and then the state changes.
    When The persistor is resumed.
    Then Only the change is saved, and the persisted state is the current state.

  Scenario: Resuming the persistor paused before the store was ready does not save the state read from the persistor again.
    Given There is some state already persisted.
    And The persistor is paused before the store is ready.
    And The store becomes ready.
    When The persistor is resumed.
    Then Nothing is saved.

  Scenario: persistAndPausePersistor called before the store is ready does not save the state read from the persistor again.
    Given There is some state already persisted.
    When persistAndPausePersistor is called before the store is ready.
    Then It waits for the store to be ready, and nothing is saved.
    And After the persistor resumes, a change is saved against the state read from the persistor.

  Scenario: Pausing the persistor before the store is ready, when nothing was persisted yet, keeps the saved initial-state as the persisted state.
    Given There is no state persisted yet.
    And The persistor is paused before the store is ready.
    And The store becomes ready, so the initial-state is saved.
    And Then the state changes.
    When The persistor is resumed.
    Then Only the change is saved, and the persisted state is the current state.
