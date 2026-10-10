Feature: Clear internal action props

  Scenario: After clearing the internal action props, fresh actions run again.
    Given An action with fresh, that was dispatched, and whose data is still fresh.
    When A logout action calls clearInternalActionProps.
    And The action with fresh is dispatched again.
    Then It runs again, even though its fresh period has not ended.

  Scenario: After clearing the internal action props, throttled actions run again.
    Given An action with throttle, that was dispatched, and whose throttle period has not ended.
    When clearInternalActionProps is called.
    And The action with throttle is dispatched again.
    Then It runs again.

  Scenario: Clearing the internal action props stops the debounced actions that are waiting.
    Given An action with debounce, that was dispatched, and is waiting for its debounce period.
    When clearInternalActionProps is called.
    Then The action finishes right away, without running its reducer.
    And It does not fail.

  Scenario: Clearing the internal action props stops all polling.
    Given An action that is polling.
    When clearInternalActionProps is called.
    Then No more polling ticks are dispatched.

  Scenario: Clearing the internal action props discards the actions waiting in sequential queues.
    Given A sequential action that is running, and two sequential actions waiting behind it.
    When clearInternalActionProps is called.
    Then The waiting actions are discarded, without running.
    And The running action keeps running, and changes the state when it finishes.
    And A sequential action dispatched after that runs right away, without waiting for the running action.

  Scenario: Clearing the internal action props does not affect running nonReentrant actions.
    Given A nonReentrant action that is running.
    When clearInternalActionProps is called.
    And The same action is dispatched again, while the first is still running.
    Then The second dispatch is still aborted.

  Scenario: Shutting down the store clears the internal action props.
    Given An action with fresh, that was dispatched, and whose data is still fresh.
    When The store is shut down, and then turned back on.
    And The action with fresh is dispatched again.
    Then It runs again, even though its fresh period has not ended.

  Scenario Outline: Clearing the internal action props aborts an action that is waiting to retry.
    Given An action that keeps retrying, with {Feature}.
    And It is waiting to retry, because {Reason}.
    When clearInternalActionProps is called.
    Then The action stops retrying right away, without waiting for the retry delay.
    And It is aborted: it does not count as failed, and its dispatchAndWait resolves.
    And It is no longer in progress.
    Examples: 
      | Feature                            | Reason               |
      | retry = { maxRetries: -1 }         | it failed            |
      | retry = { maxRetries: 3 }          | it failed            |
      | unlimitedRetryCheckInternet = true | it failed            |
      | unlimitedRetryCheckInternet = true | there is no internet |

  Scenario: An attempt that is running when the internal action props are cleared is not retried if it fails.
    Given An action with "retry = { maxRetries: -1 }", that fails after 1000 millis.
    And It is running an attempt.
    When clearInternalActionProps is called, and then the attempt fails.
    Then The action is aborted, without retrying.

  Scenario Outline: The last attempt, if running when the internal action props are cleared, is aborted if it fails.
    Given An action with "retry = { initialDelay: 100, maxRetries: {Max retries} }", whose attempts fail after 1000 millis.
    And It is running its last attempt.
    When clearInternalActionProps is called, and then the attempt fails.
    Then The action is aborted: it does not count as failed, and its dispatchAndWait resolves.
    Examples: 
      | Max retries |
      | 0           |
      | 1           |

  Scenario: An attempt that is running when the internal action props are cleared still changes the state if it succeeds.
    Given An action with "retry = { maxRetries: -1 }", that takes 1000 millis to succeed.
    And It is running an attempt.
    When clearInternalActionProps is called, and then the attempt succeeds.
    Then The action completes normally, and changes the state.

  Scenario: After clearing the internal action props, an action that was blocked by a retrying action runs, and retries as usual.
    Given An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.
    And While it retries, another dispatch of the same action is aborted, since it is non-reentrant.
    When clearInternalActionProps is called.
    And The same action is dispatched again.
    Then The new action runs, and retries as usual until there is internet.
    And The old action does not run anymore.

  Scenario: Clearing the internal action props aborts an optimistic command that is waiting to retry.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: 3 }".
    And Its server call failed, and it is waiting to retry.
    When clearInternalActionProps is called.
    Then The command stops retrying right away, without waiting for the retry delay.
    And It is aborted: it does not count as failed, and its dispatchAndWait resolves.
    And It does not roll back the optimistic value, and does not reload.
    And The server call does not run again.

  Scenario: An optimistic command whose server call is running when the internal action props are cleared is not retried if it fails.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: 3 }".
    And Its server call is running, and will fail after 1000 millis.
    When clearInternalActionProps is called, and then the server call fails.
    Then The command is aborted, without retrying.
    And It does not roll back the optimistic value, and does not reload.

  Scenario: An optimistic command whose server call is running when the internal action props are cleared still applies the server response if it succeeds.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: 3 }".
    And Its server call is running, and will succeed after 1000 millis, with a response.
    When clearInternalActionProps is called, and then the server call succeeds.
    Then The command completes normally, and applies the server response.

  Scenario Outline: An optimistic command whose last server call is running when the internal action props are cleared is aborted if it fails.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: {Max retries} }".
    And Its last server call is running, and will fail after 1000 millis.
    When clearInternalActionProps is called, and then the server call fails.
    Then The command is aborted: it does not count as failed.
    And It does not roll back the optimistic value, and does not reload.
    Examples: 
      | Max retries |
      | 0           |
      | 1           |

  Scenario: Shutting down the store aborts an optimistic command that is waiting to retry.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: 3 }".
    And Its server call failed, and it is waiting to retry.
    When The store is shut down.
    Then The command is aborted right away, without retrying.
    And It does not roll back the optimistic value.

  Scenario: An optimistic command dispatched after the internal action props were cleared retries as usual.
    Given An optimistic command with "retry = { initialDelay: 1000, maxRetries: 3 }", waiting to retry.
    And clearInternalActionProps was called, which aborted it.
    When The same command is dispatched again, and its server call always fails.
    Then The new command is not aborted, since the old one released its key.
    And It retries 3 times, and then fails, rolling back the optimistic value.

  Scenario: An action dispatched after the internal action props were cleared still fails normally on its last attempt.
    Given clearInternalActionProps was called.
    And Then, an action with "retry = { initialDelay: 100, maxRetries: 1 }", whose attempts always fail, is dispatched.
    When Its last attempt fails.
    Then The action fails, and is not aborted.
