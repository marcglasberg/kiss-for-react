Feature: Stopping polling while a start is pending

  Scenario Outline: Stopping polling prevents an earlier pending start from creating new ticks.
    Given An action with [Start] is waiting for its asynchronous before method, and no polling tick has run.
    When Polling is stopped with [Stop], and the pending before method then finishes.
    And Three polling intervals pass.
    Then The pending action has finished as aborted, and no action remains in progress.
    And No polling tick has run, and the state has not changed.
    Examples: 
      | Start            | Stop             |
      | start            | Poll.stop        |
      | start            | stopAllPolling() |
      | runNowAndRestart | Poll.stop        |
      | runNowAndRestart | stopAllPolling() |

  Scenario Outline: Stopping polling while the immediate run of a start is in progress lets that run finish, but stops the ticks.
    Given An action with [Start] has started polling, and its immediate run is still in progress.
    When Polling is stopped with [Stop], and the immediate run then finishes.
    And Three polling intervals pass.
    Then The immediate run has changed the state, and the action has completed with no error.
    And No polling tick has run.
    Examples: 
      | Start            | Stop             |
      | start            | Poll.stop        |
      | start            | stopAllPolling() |
      | runNowAndRestart | Poll.stop        |
      | runNowAndRestart | stopAllPolling() |

  Scenario Outline: Stopping the polling of another key does not affect a pending start.
    Given An action with [Start] for the polling key "prices" is waiting for its asynchronous before method.
    When Polling is stopped with Poll.stop for the polling key "balance", and the pending before method then finishes.
    And One polling interval passes.
    Then The pending action has completed with no error, and polling for "prices" has started.
    And One polling tick has run, and the state has changed.
    Examples: 
      | Start            |
      | start            |
      | runNowAndRestart |

  Scenario Outline: A start dispatched after polling was stopped is not affected by that stop.
    Given Polling was stopped with [Stop].
    When An action with [Start] is dispatched, and waits for its asynchronous before method.
    And The before method finishes, and one polling interval passes.
    Then The action has completed with no error, and polling has started.
    And One polling tick has run, and the state has changed.
    Examples: 
      | Start            | Stop             |
      | start            | Poll.stop        |
      | start            | stopAllPolling() |
      | runNowAndRestart | Poll.stop        |
      | runNowAndRestart | stopAllPolling() |

  Scenario Outline: Active polling can be stopped and then started by a new action.
    Given Polling is active, and one tick has updated the state.
    When Polling is stopped with [Stop], and three polling intervals pass.
    And A new action starts polling, and one polling interval passes.
    And Polling is stopped again with [Stop], and three polling intervals pass.
    Then No tick runs during either stopped period, and the state stays unchanged during those periods.
    And The new start causes exactly one new tick to run and update the state.
    And No action remains in progress after polling is stopped again.
    Examples: 
      | Stop             |
      | Poll.stop        |
      | stopAllPolling() |
