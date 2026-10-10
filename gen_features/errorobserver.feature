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
