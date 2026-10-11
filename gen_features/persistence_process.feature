Feature: Persistence process

  Scenario: The state read from the persistor is the last persisted state.
    Given A persistor with a saved state.
    When The store is created, and it is ready.
    Then Nothing is saved.
    And The saved state is the last persisted state.

  Scenario: Without throttle, a state change is saved right away.
    Given A persistor with no throttle.
    When The state changes twice, each time after the previous save finished.
    Then Each new state is saved right away.
    And Each save gets the difference from the last persisted state.

  Scenario: An action that does not change the state does not save it.
    Given A persistor with no throttle.
    When An action returns null.
    And An action returns the same state object.
    Then Nothing is saved.

  Scenario: A new state object equal to the persisted one is saved.
    Given A persistor with no throttle.
    When An action returns a new state object, equal to the persisted state.
    Then It is saved, since states are compared by identity, not by equality.

  Scenario: The state changed by an async action is saved when its reducer finishes.
    Given A persistor with no throttle.
    When An async action is dispatched.
    Then Nothing is saved while its reducer is running.
    And The new state is saved when the reducer finishes.

  Scenario: Saves never overlap, and only the newest state is saved next.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state changes two more times, while the save is still running.
    Then No other save starts while the first one is running.
    And When it finishes, only the newest state is saved,
    And with the difference from the state that was just saved.

  Scenario: A state that goes back to the one being saved is not saved again.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state changes to another state,
    And and then back to the state being saved, while the save is running.
    Then When the save finishes, nothing else is saved.

  Scenario: The state goes back to the last persisted state while a save is running.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state goes back to the last persisted state object (an undo).
    And The running save finishes.
    Then The last persisted state is saved again,
    And so that the saved state is the same as the state of the store.

  Scenario: An undo to a saved state while a save is running is saved.
    Given A persistor with no throttle.
    And The state changed to a state that was saved.
    And The state changed again, and its save is running.
    When The state goes back to the saved state object (an undo).
    And The running save finishes.
    Then The saved state is saved again.

  Scenario: The state goes back to the last persisted state while a save is running, with a throttle.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    When The state goes back to the last persisted state object (an undo).
    And The running save finishes.
    Then The last persisted state is saved again, when the throttle is over.

  Scenario: The state goes back to the last persisted state, and then changes again, while a save is running.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state goes back to the last persisted state object,
    And and then changes to another state, while the save is running.
    Then When the save finishes, the newest state is saved.

  Scenario: The state goes back to the last persisted state while a save is running, and that save fails.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state goes back to the last persisted state object.
    And The running save fails.
    Then Nothing else is saved, since the saved state is the state of the store.

  Scenario: The state changes while a save is running, and that save fails.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state changes again, while the save is running.
    And The running save fails.
    Then The newest state is saved,
    And with the difference from the last state that was actually persisted.

  Scenario: A state change that should not be persisted, made while a save is running, is not saved when it finishes.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When An UpdateStateAction with ifPersists false changes the state, while the save is running.
    And The running save finishes.
    Then Nothing else is saved.

  Scenario: A state change that should not be persisted goes back to the last persisted state while a save is running.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When An UpdateStateAction with ifPersists false changes the state back to the last persisted state object.
    And The running save finishes.
    Then Nothing else is saved.

  Scenario: The throttle starts counting when the store is created.
    Given A persistor with a throttle.
    When The state changes 3 times, right after the store is created.
    Then Nothing is saved before the throttle is over.
    And When the throttle is over, only the newest state is saved, once.

  Scenario: A state change after the throttle is over is saved right away.
    Given A persistor with a throttle.
    And The throttle is over.
    When The state changes.
    Then It is saved right away.

  Scenario: The throttle counts from the start of the last save.
    Given A persistor with a throttle.
    And The state changed after the throttle was over, so it was saved right away.
    When The state changes again, before the throttle is over.
    Then It is not saved right away.
    And It is saved when the throttle, counted from the start of the last save, is over.

  Scenario: A state that goes back to the persisted state before the throttle is over is not saved.
    Given A persistor with a throttle.
    When The state changes, and then goes back to the persisted state object,
    And before the throttle is over.
    Then Nothing is saved when the throttle is over.

  Scenario: A state waiting for a running save is saved when it finishes, if the throttle is over.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    And The state changed again, while the save is running.
    When The running save finishes after the throttle is over.
    Then The newest state is saved right away.

  Scenario: A state waiting for a running save is saved when the throttle is over, if the save finishes before that.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    And The state changed again, while the save is running.
    When The running save finishes before the throttle is over.
    Then The newest state is not saved right away.
    And It is saved when the throttle, counted from the start of the last save, is over.

  Scenario: PersistAction saves the state right away, ignoring the throttle.
    Given A persistor with a throttle.
    And The state changed, and is waiting for the throttle.
    When A PersistAction is dispatched.
    Then The state is saved right away.
    And It is not saved again when the throttle is over.

  Scenario: PersistAction while a save is running saves the newest state when the save finishes, ignoring the throttle.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    And The state changed again, while the save is running.
    When A PersistAction is dispatched.
    And The running save finishes before the throttle is over.
    Then The newest state is saved right away, ignoring the throttle.

  Scenario: PersistAction while a save is running does nothing else, if the state did not change after the save started.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    When A PersistAction is dispatched.
    And The running save finishes.
    Then Nothing else is saved, not even after the throttle is over.

  Scenario: PersistAction does nothing if the state is already persisted.
    Given A persistor with a throttle.
    And The state did not change.
    When A PersistAction is dispatched.
    Then Nothing is saved.

  Scenario: A paused persistor does not save, and saves the newest state when resumed.
    Given A persistor with no throttle.
    And The persistor is paused.
    When The state changes 3 times.
    Then Nothing is saved.
    And When the persistor is resumed, only the newest state is saved.

  Scenario: PersistAction does not save while the persistor is paused.
    Given A persistor with no throttle.
    And The persistor is paused, and the state changed.
    When A PersistAction is dispatched.
    Then Nothing is saved.

  Scenario: Resuming the persistor does nothing if the state is already persisted.
    Given A persistor with no throttle.
    When The persistor is paused and resumed, before any state change.
    And The persistor is paused, the state changes and goes back to the persisted state object, and the persistor is resumed.
    Then Nothing is saved.

  Scenario: Pausing the persistor does not affect the running save.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The persistor is paused, and the state changes again.
    Then The running save finishes, and the new state is not saved.
    And When the persistor is resumed, the new state is saved.

  Scenario: The state goes back to the last persisted state while a save is running, and the persistor is paused.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The persistor is paused,
    And and the state goes back to the last persisted state object.
    And The running save finishes.
    Then When the persistor is resumed, the last persisted state is saved again.

  Scenario: A paused persistor does not save when the throttle is over.
    Given A persistor with a throttle.
    And The state changed, and is waiting for the throttle.
    When The persistor is paused, and the throttle is over.
    Then Nothing is saved.
    And When the persistor is resumed, the state is saved.

  Scenario: persistAndPausePersistor saves the state right away, and then pauses.
    Given A persistor with a throttle.
    And The state changed, and is waiting for the throttle.
    When persistAndPausePersistor is called.
    Then The state is saved right away, ignoring the throttle.
    And Later state changes are not saved, even after the throttle is over.
    And When the persistor is resumed, the newest state is saved.

  Scenario: persistAndPausePersistor does not save if the state is already persisted.
    Given A persistor with no throttle.
    When persistAndPausePersistor is called before any state change.
    And persistAndPausePersistor is called after the state changed and was saved.
    Then Nothing else is saved.

  Scenario: persistAndPausePersistor while a save is running saves the newest state when the save finishes.
    Given A persistor with a throttle.
    And The throttle is over, the state changed, and its save is running.
    And The state changed again, while the save is running.
    When persistAndPausePersistor is called.
    Then No other save starts while the running save is running.
    And When it finishes, the newest state is saved right away, ignoring the throttle.
    And Then the persistor is paused, so later state changes are not saved.
    And When the persistor is resumed, the newest state is saved.

  Scenario: persistAndPausePersistor while a save is running does nothing else, if the state did not change after the save started.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When persistAndPausePersistor is called.
    And The running save finishes.
    Then Nothing else is saved.
    And The persistor is paused.

  Scenario: Reading the state through the store makes it the last persisted state.
    Given A persistor with a saved state.
    When The state is read with readStateFromPersistence.
    Then It returns the saved state.
    And The saved state becomes the last persisted state.

  Scenario: Reading the state while a save is running: it waits for the save, and reads the saved state.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state is read with readStateFromPersistence.
    Then The read waits for the running save to finish.
    And It returns the state that was just saved.
    And That state is the last persisted state.

  Scenario: A state change while the state is being read is saved after the read finishes.
    Given A persistor with no throttle, where reading the state takes some time.
    When The state is read with readStateFromPersistence.
    And The state changes while the read is running.
    Then Nothing is saved while the read is running.
    And When the read finishes, the new state is saved,
    And with the difference from the state that was read.

  Scenario: If reading the state fails, the error goes to the caller, and the state keeps being saved.
    Given A persistor with no throttle, where reading the state takes some time,
    And and then fails.
    When The state is read with readStateFromPersistence.
    And The state changes while the read is running.
    Then The read throws the error.
    And The last persisted state does not change.
    And When the read finishes, the new state is saved.

  Scenario: Saving the initial state through the store saves the whole state.
    Given A persistor.
    When A state is saved with saveInitialStateInPersistence.
    Then It is saved with no last persisted state (so the whole state is saved).
    And It becomes the last persisted state.

  Scenario: Saving the initial state while a save is running: the initial state stays saved.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When A state is saved with saveInitialStateInPersistence.
    Then It is saved after the running save finishes.
    And It stays saved, and is the last persisted state.

  Scenario: Deleting the state while a save is running: the state stays deleted.
    Given A persistor with no throttle.
    And The state changed, and its save is running.
    When The state is deleted with deleteStateFromPersistence.
    And The running save finishes.
    Then The state stays deleted.
    And There is no last persisted state.

  Scenario: A state change while the state is being deleted is saved after the delete finishes.
    Given A persistor with no throttle, where deleting the state takes some time.
    When The state is deleted with deleteStateFromPersistence.
    And The state changes while the delete is running.
    Then Nothing is saved while the delete is running.
    And When the delete finishes, the whole new state is saved.

  Scenario: After the state is deleted, the next state change saves the whole state.
    Given A persistor with no throttle.
    When The state is deleted with deleteStateFromPersistence.
    Then There is no last persisted state.
    And The next state change is saved with no last persisted state (so the whole state is saved).
