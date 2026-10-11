Feature: LogOut failures

  Scenario Outline: If deleting the persisted state fails, logOut still resets the state, and then rejects.
    Given A store with a persistor, and a saved state.
    And The persistor fails to delete the saved state.
    And The store has <Observer>.
    When We call logOut with a new initial-state.
    Then The store state is the initial-state.
    And The initial-state is saved, and the old state is not saved again.
    And The errorObserver got the delete error, with a null action, before logOut rejected.
    And logOut rejects with the delete error.
    And There is no unhandled promise rejection.
    Examples: 
      | Observer              |
      | no errorObserver      |
      | returns null          |
      | returns the error     |
      | returns another error |

  Scenario Outline: If saving the initial-state fails, logOut still resets the state, and then rejects.
    Given A store with a persistor, and a saved state.
    And The persistor deletes the saved state, but fails to save the initial-state.
    And The store has <Observer>.
    When We call logOut with a new initial-state.
    Then The store state is the initial-state.
    And The errorObserver got the save error, with a null action, before logOut rejected.
    And logOut rejects with the save error.
    And There is no unhandled promise rejection.
    And When persistence resumes after logOut, it tries again, and saves the initial-state.
    Examples: 
      | Observer              |
      | no errorObserver      |
      | returns null          |
      | returns the error     |
      | returns another error |

  Scenario: If deleting the state and saving the initial-state both fail, logOut rejects with the delete error.
    Given A store with a persistor, and a saved state.
    And The persistor fails to delete the saved state, and fails to save the initial-state.
    And The store has an errorObserver.
    When We call logOut with a new initial-state.
    Then The store state is the initial-state.
    And The errorObserver got the delete error and then the save error, before logOut rejected.
    And logOut rejects with the delete error.

  Scenario: logOut rejects with the save error as processed by the persistor wrapError.
    Given A store with a persistor that fails to save the initial-state.
    And The persistor wrapError wraps the save error in another error.
    When We call logOut.
    Then logOut rejects with the wrapped error.

  Scenario: logOut does not reject when the persistor wrapError swallows the save error.
    Given A store with a persistor that fails to save the initial-state.
    And The persistor wrapError returns null.
    When We call logOut.
    Then logOut resolves, and the store state is the initial-state.
    And The errorObserver gets no error.

  Scenario: logOut does not reject when deleteState reports an error with addError instead of throwing.
    Given A store with a persistor whose deleteState adds an error with addError, and does not throw.
    When We call logOut.
    Then logOut resolves, and the store state is the initial-state.
    And The errorObserver got the added error.
