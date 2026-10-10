Feature: Persistor errors

  Scenario Outline: A save error that is not swallowed is thrown as an unhandled rejection.
    Given A store with a persistor whose persistDifference throws.
    And The store has <Observer>.
    When An action changes the state, and the save fails.
    Then <Thrown> is thrown as an unhandled promise rejection.
    And The store keeps working.
    Examples: 
      | Observer              | Thrown    |
      | no errorObserver      | disk full |
      | returns the error     | disk full |
      | returns another error | other     |
      | throws another error  | other     |

  Scenario Outline: A save error swallowed by the errorObserver does not cause an unhandled rejection.
    Given A store with a persistor whose persistDifference throws.
    And An errorObserver that returns <Returns>.
    When An action changes the state, and the save fails.
    Then There is no unhandled promise rejection.
    And The store keeps working.
    Examples: 
      | Returns   |
      | null      |
      | undefined |

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

  Scenario: A save error is given to the errorObserver, with a null action.
    Given A store with a persistor, and an errorObserver.
    And The persistor wrapError wraps the errors.
    When A save fails.
    Then The errorObserver is called with the wrapped error, a null action, and the store.
    And Its originalError is the error before the persistor wrapError.

  Scenario: The persistor wrapError can turn a save error into a UserException that is shown to the user.
    Given A persistor whose wrapError turns errors into UserExceptions.
    And There is no errorObserver.
    When A save fails.
    Then The UserException is shown to the user.
    And There is no unhandled promise rejection.

  Scenario: The errorObserver can turn a save error into a UserException that is shown to the user.
    Given A store with a persistor.
    And An errorObserver that turns the errors without an action into UserExceptions.
    When A save fails.
    Then The UserException is shown to the user.
    And There is no unhandled promise rejection.

  Scenario: The errorObserver can swallow a save error that is a UserException.
    Given A persistor whose wrapError turns errors into UserExceptions.
    And An errorObserver that returns null.
    When A save fails.
    Then The UserException is not shown to the user.

  Scenario: The persistor wrapError can swallow a save error by returning null.
    Given A persistor whose wrapError returns null.
    And A store with an errorObserver.
    When A save fails.
    Then The errorObserver is not called, and there is no unhandled promise rejection.
    And The failed state is still not considered saved.

  Scenario: If the persistor wrapError throws, the thrown error is used instead.
    Given A persistor whose wrapError throws a different error.
    And A store with an errorObserver.
    When A save fails.
    Then The errorObserver gets the error thrown by wrapError.
    And Its originalError is the error thrown by persistDifference.

  Scenario: A persistor can report errors with addError, without throwing.
    Given A persistor whose readState finds corrupted data.
    And It deletes it, reports a UserException with addError, and returns null.
    When The store is created.
    Then The UserException is shown to the user.
    And The initial-state is saved.

  Scenario: An error added with addError is given to the errorObserver, but not to the persistor wrapError.
    Given A persistor whose readState finds corrupted data, and reports it with addError.
    And The persistor has a wrapError.
    And A store with an errorObserver.
    When The store is created.
    Then The errorObserver gets the error, with a null action.
    And Its originalError is the same error.
    And The persistor wrapError is not called.

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
    Then It resolves.
    And The error was given to the errorObserver before it resolved.

  Scenario: By default, saveInitialState saves the state with persistDifference.
    Given A persistor that does not override saveInitialState.
    When saveInitialState is called.
    Then persistDifference is called with a null last persisted state.

  Scenario: The PersistorPrinterDecorator keeps the wrapError and addError of the persistor it decorates.
    Given A persistor with a wrapError and errors added with addError.
    When It is decorated with PersistorPrinterDecorator.
    Then The decorator uses the same wrapError, and returns the same added errors.
