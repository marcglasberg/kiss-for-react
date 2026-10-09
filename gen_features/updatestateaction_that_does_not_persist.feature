Feature: UpdateStateAction that does not persist

  Scenario: A state change that should not be persisted is not saved, when nothing else is waiting to be saved.
    Given A store with a persistor, and all state changes already saved.
    When An UpdateStateAction with ifPersists false changes the state.
    Then The new state is not saved.
    And A later change is saved normally.

  Scenario: A state change that should not be persisted does not cancel earlier changes waiting for the throttle.
    Given A store with a persistor with a throttle.
    And A state change waiting for the throttle period to end before being saved.
    When An UpdateStateAction with ifPersists false changes the state before the throttle period ends.
    Then When the throttle period ends, the current state is saved, including the earlier change.

  Scenario: A state change that should not be persisted does not cancel changes made while a save is running.
    Given A store with a slow persistor.
    And A save is running.
    And A state change happened while it was running, so it waits to be saved.
    When An UpdateStateAction with ifPersists false changes the state before the save finishes.
    Then When the running save finishes, the current state is saved, including the earlier change.
