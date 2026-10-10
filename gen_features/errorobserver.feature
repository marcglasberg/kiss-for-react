Feature: ErrorObserver

  Scenario Outline: The errorObserver gets the error, the original error, the action, and the store.
    Given A <Action> action that throws an error, and has a wrapError that wraps it.
    And A store with an errorObserver.
    When The action is dispatched.
    Then The errorObserver gets the error returned by the wrapError.
    And It gets the error before the wrapError, as the originalError.
    And It gets the action and the store.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: The error the errorObserver returns is the one dispatch throws.
    Given A <Action> action that throws an error which is not a UserException.
    And An errorObserver that <Observer>.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait rejects with <Thrown>.
    And The action status has <Thrown> as its wrapped error.
    Examples: 
      | Action | Observer              | Thrown   |
      | sync   | returns the error     | original |
      | async  | returns the error     | original |
      | sync   | returns another error | other    |
      | async  | returns another error | other    |
      | sync   | throws another error  | other    |
      | async  | throws another error  | other    |

  Scenario Outline: The errorObserver can swallow an error by returning null, or nothing.
    Given A <Action> action that throws an error which is not a UserException.
    And An errorObserver that returns <Returns>.
    When The action is dispatched.
    Then dispatch does not throw, and dispatchAndWait resolves with the action status.
    And The action does not count as failed.
    Examples: 
      | Action | Returns   |
      | sync   | null      |
      | async  | null      |
      | sync   | undefined |
      | async  | undefined |

  Scenario Outline: A UserException returned by the errorObserver is shown to the user, and is not thrown.
    Given A <Action> action that throws <Error>.
    And An errorObserver that <Observer>.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves with the action status.
    And The UserException is shown to the user.
    And The action counts as failed, with that UserException.
    Examples: 
      | Action | Error           | Observer                      |
      | sync   | a UserException | returns the error             |
      | async  | a UserException | returns the error             |
      | sync   | an Error        | turns it into a UserException |
      | async  | an Error        | turns it into a UserException |

  Scenario Outline: The errorObserver can swallow a UserException.
    Given A <Action> action that throws a UserException.
    And An errorObserver that returns null.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves with the action status.
    And The UserException is not shown to the user.
    And The action does not count as failed.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: The errorObserver is not called when the action wrapError returns null.
    Given A <Action> action that throws an error, and has a wrapError that returns null.
    And A store with an errorObserver.
    When The action is dispatched with dispatchAndWait.
    Then The errorObserver is not called.
    And dispatchAndWait resolves with the action status.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario: The errorObserver is not called for actions that succeed.
    Given A store with an errorObserver.
    When Sync and async actions that succeed are dispatched.
    Then The errorObserver is not called.

  Scenario Outline: An error thrown in the before method also goes to the errorObserver.
    Given An action whose <Before> before method throws an error.
    And A store with an errorObserver.
    When The action is dispatched.
    Then The errorObserver gets the error, the original error, and the action.
    And The reducer does not run.
    Examples: 
      | Before |
      | sync   |
      | async  |

  Scenario Outline: If the action wrapError throws, the errorObserver gets the thrown error.
    Given A <Action> action that throws an error, and has a wrapError that throws another error.
    And A store with an errorObserver.
    When The action is dispatched.
    Then The errorObserver gets the error thrown by the wrapError.
    And It gets the error thrown by the action, as the originalError.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: dispatch of a sync action throws the error the errorObserver returns.
    Given A sync action that throws an error which is not a UserException.
    And An errorObserver that <Observer>.
    When The action is dispatched with dispatch.
    Then dispatch <Result>.
    Examples: 
      | Observer              | Result                 |
      | returns the error     | throws the error       |
      | returns another error | throws the other error |
      | throws another error  | throws the other error |
      | returns null          | does not throw         |

  Scenario Outline: dispatch of an async action does not throw, and its result is in the action status.
    Given An async action that throws an error which is not a UserException.
    And An errorObserver that <Observer>.
    When The action is dispatched with dispatch.
    Then dispatch does not throw.
    And After the action finishes, its status has <Wrapped error> as the wrapped error.
    And There is no unhandled promise rejection.
    Examples: 
      | Observer                      | Wrapped error     |
      | returns null                  | no error          |
      | turns it into a UserException | the UserException |

  Scenario: With retry, the errorObserver is called once, after the last attempt.
    Given An async action with retry, that fails in all attempts.
    And A store with an errorObserver.
    When The action is dispatched.
    Then The errorObserver is called only once, after all attempts failed.
    And It gets the error of the last attempt.

  Scenario Outline: A UserException thrown by the errorObserver is shown to the user, and is not thrown.
    Given A <Action> action that throws an error which is not a UserException.
    And An errorObserver that throws a UserException.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves with the action status.
    And The UserException is shown to the user.
    And The action counts as failed, with that UserException.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: A UserException without a dialog, returned by the errorObserver, is not shown, but the action counts as failed.
    Given A <Action> action that throws an error which is not a UserException.
    And An errorObserver that turns it into a UserException without a dialog.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves with the action status.
    And The UserException is not shown to the user.
    And The action counts as failed, with that UserException.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: The stateObserver, the wrapError, the errorObserver, and the after method run in this order.
    Given A <Action> action that throws an error, and has a wrapError and an after method.
    And A store with a stateObserver and an errorObserver.
    When The action is dispatched.
    Then The stateObserver runs first, with the original error.
    And Then the wrapError, then the errorObserver, and then the after method.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario: An errorObserver typed with a non-null action can be used.
    Given An errorObserver whose parameter is typed with a non-null action.
    When It is given to the store, and an action fails.
    Then It compiles, and is called with the action.
