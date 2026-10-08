Feature: Persistor errors

  Scenario: A failed save does not cause an unhandled rejection.
    Given A store with a persistor whose persistDifference throws.
    When An action changes the state.
    Then There is no unhandled promise rejection.
    And The store keeps working.

  Scenario: A state that failed to save is not considered saved.
    Given A store with a persistor.
    And A save that failed.
    When The state changes again, and is saved successfully.
    Then The persistor receives, as the last persisted state, the last state that was really saved.

  Scenario: A failed save is not retried with a timer.
    Given A store with a persistor with a throttle.
    And A save that failed.
    When Time passes, and the state does not change.
    Then The persistor is not called again.

  Scenario: After a failed save, the next state change saves the newest state.
    Given A store with a persistor.
    And A save that failed.
    When The state changes again.
    Then The newest state is saved.

  Scenario: Without an errorObserver, a save error is logged.
    Given A store with a persistor, and no errorObserver.
    When A save fails.
    Then The error is logged with Store.log.

  Scenario: A save error is given to the errorObserver, with a null action.
    Given A store with a persistor, and an errorObserver.
    When A save fails.
    Then The errorObserver is called with the error, a null action, and the store.

  Scenario: The persistor wrapError can turn a save error into a UserException that is shown to the user.
    Given A persistor whose wrapError turns errors into UserExceptions.
    When A save fails.
    Then The UserException is shown to the user.

  Scenario: The persistor wrapError can swallow a save error by returning null.
    Given A persistor whose wrapError returns null.
    And A store with an errorObserver.
    When A save fails.
    Then The errorObserver is not called, and nothing is logged.
    And The failed state is still not considered saved.

  Scenario: If the persistor wrapError throws, the thrown error is used instead.
    Given A persistor whose wrapError throws a different error.
    And A store with an errorObserver.
    When A save fails.
    Then The errorObserver gets the error thrown by wrapError.

  Scenario: A persistor can report errors with addError, without throwing.
    Given A persistor whose readState finds corrupted data.
    And It deletes it, reports a UserException with addError, and returns null.
    When The store is created.
    Then The UserException is shown to the user.
    And The initial-state is saved.

  Scenario: An error thrown by readState is given to the errorObserver.
    Given A persistor whose readState throws.
    And A store with an errorObserver.
    When The store is created.
    Then The errorObserver gets the error, with a null action.
    And The initial-state is saved.

  Scenario: persistAndPausePersistor does not reject when the save fails.
    Given A store with a persistor whose persistDifference throws.
    And A state that is not yet saved.
    When We await persistAndPausePersistor.
    Then It resolves, and the error is given to the errorObserver.

  Scenario: By default, saveInitialState saves the state with persistDifference.
    Given A persistor that does not override saveInitialState.
    When saveInitialState is called.
    Then persistDifference is called with a null last persisted state.

  Scenario: The PersistorPrinterDecorator keeps the wrapError and addError of the persistor it decorates.
    Given A persistor with a wrapError and errors added with addError.
    When It is decorated with PersistorPrinterDecorator.
    Then The decorator uses the same wrapError, and returns the same added errors.
