Feature: Shutting down the store stops retries

  Scenario Outline: Shutting down the store aborts an action that is waiting to retry.
    Given An action that keeps retrying, with {Feature}.
    And It is waiting to retry, because {Reason}.
    When The store is shut down.
    Then The action stops retrying right away, without waiting for the retry delay.
    And It is aborted: it does not count as failed, and its dispatchAndWait resolves.
    And It is no longer in progress.
    Examples: 
      | Feature                            | Reason               |
      | retry = { maxRetries: -1 }         | it failed            |
      | unlimitedRetryCheckInternet = true | it failed            |
      | unlimitedRetryCheckInternet = true | there is no internet |

  Scenario: An attempt that is running when the store is shut down is not retried if it fails.
    Given An action with "retry = { maxRetries: -1 }", that fails after 1000 millis.
    And It is running an attempt.
    When The store is shut down, and then the attempt fails.
    Then The action is aborted, without retrying.

  Scenario: An attempt that is running when the store is shut down still changes the state if it succeeds.
    Given An action with "retry = { maxRetries: -1 }", that takes 1000 millis to succeed.
    And It is running an attempt.
    When The store is shut down, and then the attempt succeeds.
    Then The action completes normally, and changes the state.

  Scenario: Turning the store back on does not resume the stopped retries.
    Given An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.
    When The store is shut down, and right away turned back on.
    Then The action is still aborted, and does not retry anymore.
    And New actions can be dispatched, and retry as usual.

  Scenario: An action with limited retries that fails after the store is shut down is aborted.
    Given An action with "retry = { maxRetries: 3 }", that always fails.
    And It is waiting to retry.
    When The store is shut down.
    Then The action is aborted, instead of failing with its error.
