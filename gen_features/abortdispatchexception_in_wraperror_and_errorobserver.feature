Feature: AbortDispatchException in wrapError and errorObserver

  Scenario Outline: A wrapError can turn an AbortDispatchException thrown by the action into another error.
    Given A <Action> action that throws an AbortDispatchException.
    And Its wrapError turns it into a UserException.
    When The action is dispatched with dispatchAndWait.
    Then The action is not aborted. It fails with the UserException instead.
    And The UserException is shown to the user.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: A wrapError that returns an AbortDispatchException aborts the action silently.
    Given A <Action> action that throws an error.
    And Its wrapError returns an AbortDispatchException.
    And A store with an errorObserver that returns the error it gets.
    When The action is dispatched with dispatchAndWait.
    Then The errorObserver gets the AbortDispatchException.
    And dispatchAndWait resolves, and the status says the dispatch was aborted.
    And The action does not count as failed, and no error is shown to the user.
    And The state is not changed.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: An errorObserver that returns an AbortDispatchException aborts the action silently.
    Given A <Action> action that throws an error, and has a wrapError that returns it unaltered.
    And A store with an errorObserver that returns an AbortDispatchException.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves, and the status says the dispatch was aborted.
    And The action does not count as failed, and no error is shown to the user.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: An action whose wrapError returns an AbortDispatchException does not throw when dispatched with dispatch.
    Given A <Action> action that throws an error.
    And Its wrapError returns an AbortDispatchException.
    When The action is dispatched with dispatch, and nobody waits for it.
    Then dispatch does not throw, and there is no unhandled rejection.
    And The status says the dispatch was aborted.
    Examples: 
      | Action |
      | sync   |
      | async  |

  Scenario Outline: The AbortDispatchExceptions created by Kiss itself are not given to wrapError or the errorObserver.
    Given An action that Kiss aborts, because <Reason>.
    And Its wrapError turns all errors into a UserException.
    And A store with an errorObserver.
    When The action is dispatched.
    Then The wrapError and the errorObserver are not called.
    And The action is aborted silently, and no error is shown to the user.
    Examples: 
      | Reason                                                            |
      | there is no internet, with checkInternet abort                    |
      | it was discarded from its sequential queue                        |
      | it is ignoreOld, became old, and returns a result                 |
      | it is ignoreOld, became old, and throws an error                  |
      | it is ignoreOld, became old, and throws an AbortDispatchException |
