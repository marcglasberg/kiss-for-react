Feature: dispatchSync of an async action

  Scenario: dispatchSync of an action with an async reducer that fails throws, and the error does not go unhandled.
    Given An action whose async reducer fails.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And There is no unhandled rejection.
    And The reducer error is logged.

  Scenario: dispatchSync of an action with an async before that fails throws, and the error does not go unhandled.
    Given An action whose async before method fails.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And There is no unhandled rejection.
    And The before error is logged.

  Scenario: dispatchSync of an action with an async reducer that succeeds does not change the state.
    Given An action whose async reducer finishes and returns a new state.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The state stays the same, even after the async reducer finishes.

  Scenario: dispatchSync of an action with an async before that succeeds does not run the reducer.
    Given An action whose async before method finishes successfully.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The reducer never runs, and the state stays the same.

  Scenario Outline: dispatchSync of an async action throws, even if the errorObserver swallows errors.
    Given An errorObserver that swallows all errors.
    And An action that is ASYNC.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The errorObserver is not called.
    Examples: 
      | Async because            |
      | reduce returns a Promise |
      | before returns a Promise |
      | debounce                 |
      | sequential               |

  Scenario: dispatchSync of an async action throws, even if wrapError converts errors to UserException.
    Given An action with an async reducer.
    And Its wrapError converts all errors to UserException.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The action is not failed.
    And No UserException is shown to the user.

  Scenario Outline: dispatchSync of an async action throws its own error, even if the errorObserver converts errors.
    Given An errorObserver that converts all errors to another error.
    And An action with an async reducer.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws the StoreException, not the converted error.
    And No UserException is shown to the user.
    Examples: 
      | Converts to   |
      | UserException |
      | Error         |

  Scenario: When dispatchSync throws for an async action, the action still finishes.
    Given An errorObserver that swallows all errors.
    And An action with an async reducer.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The action's after method runs.
    And The action is completed, and failed with that StoreException.
    And The action is no longer in progress.
    And The actionObserver is told the action ended.

  Scenario: After dispatchSync throws for an action with retry, its reducer is not retried.
    Given An action with retry, whose async reducer always fails.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The reducer runs only once, and is not retried.
    And The reducer error is logged.
    And There is no unhandled rejection.

  Scenario Outline: After dispatchSync throws for an action with unlimitedRetryCheckInternet, its reducer never runs.
    Given An action with unlimitedRetryCheckInternet, which checks the internet before running its reducer.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The internet is checked only once, and the reducer never runs.
    And There is no unhandled rejection.
    Examples: 
      | Internet |
      | on       |
      | off      |

  Scenario: After dispatchSync throws for an optimistic command with retry, its server call is not retried.
    Given An optimistic command with retry, whose server call always fails.
    When The command is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The server call runs only once, and is not retried.
    And There is no unhandled rejection.

  Scenario Outline: dispatchSync of an async action throws, even if wrapError converts errors, whatever makes the action async.
    Given An action that is ASYNC.
    And Its wrapError converts all errors to UserException.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The action is not failed.
    And No UserException is shown to the user.
    Examples: 
      | Async because            |
      | reduce returns a Promise |
      | before returns a Promise |
      | debounce                 |
      | sequential               |

  Scenario Outline: dispatchSync of a SYNC action that fails still uses wrapError and the errorObserver.
    Given A SYNC action whose reducer fails.
    And {Who} the error.
    When The action is dispatched with dispatchSync.
    Then The error is {Result}.
    Examples: 
      | Who                                 | Result                                             |
      | The errorObserver swallows          | swallowed, and dispatchSync does not throw         |
      | wrapError converts to UserException | shown to the user, and dispatchSync does not throw |
      | Nobody changes                      | thrown by dispatchSync                             |

  Scenario Outline: A StoreException thrown by an action itself still goes to the errorObserver.
    Given An errorObserver that swallows all errors.
    And An action whose reducer throws a StoreException.
    When The action is dispatched with {Method}.
    Then The errorObserver gets the StoreException, and swallows it.
    # Only the StoreException that dispatchSync throws for an async action skips the errorObserver.
    Examples: 
      | Method       |
      | dispatch     |
      | dispatchSync |

  Scenario: When dispatchSync throws for an async action, the stateObserver still sees the StoreException.
    Given A stateObserver.
    And An action with an async reducer.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The stateObserver is called once, with that StoreException, and the state unchanged.

  Scenario Outline: After dispatchSync throws for an async action, the later result of the async reducer is ignored.
    Given An errorObserver.
    And An action whose async reducer {Result} after a delay.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException, and the action is already finished.
    And When the async reducer finishes, the state does not change, the errorObserver is not called, and the action is not failed.
    Examples: 
      | Result                     |
      | fails with a UserException |
      | fails with an Error        |
      | succeeds                   |

  Scenario: After dispatchSync throws for a non-reentrant async action, the same action can be dispatched again.
    Given A nonReentrant action with an async reducer that takes a while.
    And It was dispatched with dispatchSync, which threw a StoreException.
    When The same action is dispatched again with dispatchAndWait, while the first reducer is still running.
    Then The new action is not aborted, and changes the state.

  Scenario Outline: After dispatchSync throws for an action with retry, the action is already finished, and a later success is ignored.
    Given An action with retry, whose async reducer {Result}.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The action is already finished, its after method ran once, and it is no longer in progress.
    And The reducer runs only once, and the state does not change.
    Examples: 
      | Result                 |
      | fails after a delay    |
      | succeeds after a delay |

  Scenario: After dispatchSync throws for an action with unlimitedRetryCheckInternet whose internet check fails, it does not check again.
    Given An action with unlimitedRetryCheckInternet, whose internet check fails with an error.
    When The action is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The internet is checked only once, and the reducer never runs.
    And The internet check error is logged, and there is no unhandled rejection.

  Scenario: After dispatchSync throws for an optimistic command with retry, a failed server call still rolls back the optimistic value.
    Given An optimistic command with retry, whose server call fails.
    When The command is dispatched with dispatchSync.
    Then dispatchSync throws a StoreException.
    And The optimistic value was applied, since that is done before the reducer awaits.
    And When the server call fails, it is not retried, and the optimistic value is rolled back.
    And The command is not failed.
