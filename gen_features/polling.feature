Feature: Polling

  Scenario: Poll.start runs the action immediately, and starts polling.
    Given An action that polls every 100 millis.
    When The action is dispatched with Poll.start.
    Then It runs right away.
    And It runs again every 100 millis.

  Scenario: Poll.start does nothing when polling is already active.
    Given An action that polls every 100 millis, and is already polling.
    When The action is dispatched with Poll.start again.
    Then It does not run, and the timer is not restarted.

  Scenario: Poll.stop cancels the polling, and does not run the action.
    Given An action that is polling.
    When The action is dispatched with Poll.stop.
    Then It does not run.
    And There are no more ticks.

  Scenario: Poll.stop when not polling does nothing.
    Given An action that is not polling.
    When The action is dispatched with Poll.stop.
    Then It does not run, and does not fail.

  Scenario: The action still runs its before and after methods when the reducer is skipped.
    Given An action with before and after methods, that is polling.
    When The action is dispatched with Poll.start again, and then with Poll.stop.
    Then Their before and after methods run, but their reducers do not.

  Scenario: Poll.runNowAndRestart runs the action immediately, and restarts the polling.
    Given An action that polls every 100 millis, and is polling.
    When The action is dispatched with Poll.runNowAndRestart, between two ticks.
    Then It runs right away.
    And The next tick is 100 millis after that.

  Scenario: Poll.runNowAndRestart when not polling works like Poll.start.
    Given An action that polls every 100 millis, and is not polling.
    When The action is dispatched with Poll.runNowAndRestart.
    Then It runs right away, and starts polling.

  Scenario: Poll.once runs the action, without affecting the polling.
    Given An action that polls every 100 millis, and is polling.
    When The action is dispatched with Poll.once, between two ticks.
    Then It runs right away.
    And The ticks continue as before.

  Scenario: Poll.once never starts the polling.
    Given An action that polls every 100 millis, and is not polling.
    When The action is dispatched with Poll.once, 3 times.
    Then It runs 3 times.
    And There are no ticks.

  Scenario: Poll.start after Poll.stop starts polling again.
    Given An action that was polling, and was stopped.
    When The action is dispatched with Poll.start.
    Then It runs right away, and starts polling again.

  Scenario: The ticks dispatch the action returned by createPollingAction.
    Given A polling controller action, whose createPollingAction returns a different worker action.
    When The controller is dispatched with Poll.start.
    Then Each tick dispatches the worker action.
    And The worker action is in progress while it runs.

  Scenario: A single action class can both control the polling and do the work.
    Given An action whose createPollingAction returns the same action class, with Poll.once.
    When The action is dispatched with Poll.start.
    Then The ticks run the action, without restarting the polling.

  Scenario: Different action classes have independent polling.
    Given Two different action classes that poll.
    When Both are started, and then one of them is stopped.
    Then The other one keeps polling.

  Scenario: pollingKeyParams gives each value its own polling.
    Given An action that polls, and whose pollingKeyParams is its id.
    When It is started for ids A and B, and then stopped for id A.
    Then Id B keeps polling.
    And Starting id B again does nothing, since it is already polling.

  Scenario: pollingKeyParams can return an array, compared by its contents.
    Given An action that polls, and whose pollingKeyParams is an array with a user and a wallet.
    When It is started for 2 different pairs, and then for the first pair again.
    Then There are 2 independent pollings, one for each pair.

  Scenario: computePollingKey can make different action classes share the same polling.
    Given Two different action classes that poll, with the same computePollingKey.
    When The first is started, and then the second is started.
    Then Starting the second does nothing, since the key is already polling.
    And Stopping the second stops the shared polling.

  Scenario: By default, the next tick waits for the previous run to finish.
    Given An action that polls every 100 millis, and takes 250 millis to run.
    When The action is dispatched with Poll.start.
    Then The interval is counted from the END of each run.
    And The runs never overlap.

  Scenario: With pollWaitsForRun false, the ticks happen at a fixed rate.
    Given An action that polls every 100 millis, takes 250 millis to run, and has pollWaitsForRun false.
    When The action is dispatched with Poll.start.
    Then The interval is counted from the START of each run.
    And The runs overlap.

  Scenario: Poll.start does nothing while the first run is still in progress.
    Given An action that polls, whose first run has not finished yet.
    When The action is dispatched with Poll.start again.
    Then It does nothing, since polling is already active.

  Scenario: Poll.stop during a run prevents the next tick.
    Given An action that polls, whose first run has not finished yet.
    When The action is dispatched with Poll.stop.
    Then The run in progress still finishes.
    And There are no more ticks.

  Scenario: Poll.runNowAndRestart during a run does not duplicate the polling.
    Given An action that polls, whose first run has not finished yet.
    When The action is dispatched with Poll.runNowAndRestart.
    Then Both runs finish.
    And Only the new polling keeps ticking.

  Scenario: With pollWaitsForRun false, Poll.stop prevents new ticks.
    Given An action that polls at a fixed rate, with runs overlapping.
    When The action is dispatched with Poll.stop, while runs are in progress.
    Then The runs in progress still finish.
    And No new runs start.

  Scenario Outline: Failed runs do not stop the polling.
    Given An action that polls every 100 millis, and fails.
    When The ticks keep failing, and then start succeeding.
    Then The polling keeps going, and the state changes once the runs succeed.
    Examples: 
      | Wait for run |
      | true         |
      | false        |

  Scenario: If the immediate run of Poll.start fails, the polling is started anyway.
    Given An action that polls every 100 millis, and fails.
    When The action is dispatched with Poll.start, and its run fails.
    Then The polling is active, so Poll.start does nothing.
    And The next ticks run.

  Scenario: stopAllPolling stops all the polling at once.
    Given Two different action classes that are polling.
    When Some action calls stopAllPolling.
    Then There are no more ticks.

  Scenario: Shutting down the store stops all the polling.
    Given An action that is polling.
    When The store is shut down, and then turned on again.
    Then There are no more ticks.

  Scenario: The custom wrapReduce of a polling action wraps its reducer.
    Given An action that polls, and has a custom wrapReduce.
    When The action is dispatched with Poll.start, and then with Poll.stop.
    Then The wrapReduce wraps the reducer when it runs.

  Scenario: Throttling the polling controller may prevent stopping the polling.
    Given An action that polls, and also uses throttle.
    When The action is dispatched with Poll.stop, inside the throttle period.
    Then The dispatch is aborted, and the polling keeps going.
    # That is why throttle, nonReentrant, fresh, sequential and checkInternet should be added to the tick action instead.

  Scenario: A polling action must override createPollingAction.
    Given An action that uses polling, but does not override createPollingAction.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario Outline: An invalid poll or pollInterval value makes the dispatch throw.
    Given An action that uses polling, with an invalid value.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Poll  | Interval |
      | begin | 100      |
      | NULL  | 100      |
      | start | -1       |
      | start | NaN      |
      | start | 100      |

  Scenario Outline: Polling can not be combined with retry or debounce.
    Given An action that uses polling, and also uses retry or debounce.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Feature  |
      | retry    |
      | debounce |

  Scenario: An OptimisticCommand can not use polling.
    Given An OptimisticCommand that uses polling.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
