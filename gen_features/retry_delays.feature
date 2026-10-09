Feature: Retry delays

  Scenario: Retries wait for the default delays between attempts.
    Given An action with retry turned on, using the default retry options.
    And The action always fails.
    When The action is dispatched.
    Then It waits 350 millis before the first retry.
    And It waits 700 millis before the second retry.
    And It waits 1400 millis before the third retry.

  Scenario: Retries use the configured initial delay and multiplier.
    Given An action that always fails, with retry options:
      | initialDelay | multiplier | maxRetries |
      | 50           | 3          | 3          |
    When The action is dispatched.
    Then It waits 50, 150 and 450 millis between attempts.

  Scenario: Retry delays never go above the maximum delay.
    Given An action that always fails, with retry options:
      | initialDelay | multiplier | maxRetries | maxDelay |
      | 100          | 2          | 4          | 250      |
    When The action is dispatched.
    Then It waits 100, 200, 250 and 250 millis between attempts.

  Scenario: Retry can be turned off with "on: false".
    Given An action that always fails, with retry options "on: false".
    When The action is dispatched.
    Then It runs only once, and fails without retrying.
    # This lets a subclass turn off the retry that a base class turned on.

  Scenario: Retry with "unlimitedRetries" does not stop after the maximum retries.
    Given An action with retry options "unlimitedRetries: true" and "maxRetries: 3".
    And The action fails the first 6 times.
    When The action is dispatched.
    Then It keeps retrying, and succeeds on the 7th attempt.

  Scenario: A multiplier of 1 keeps the retry delay constant.
    Given An action that always fails, with retry options:
      | initialDelay | multiplier | maxRetries |
      | 100          | 1          | 3          |
    When The action is dispatched.
    Then It waits 100 millis between every attempt.

  Scenario Outline: An invalid retry option makes the dispatch throw a descriptive error.
    Given An action with an invalid retry option.
    When The action is dispatched.
    Then The dispatch throws a StoreException that names the action, the option and its value.
    And The reducer does not run.
    Examples: 
      | Option           | Value    | Message                  |
      | multiplier       | 0.5      | must be a number >= 1    |
      | multiplier       | NaN      | must be a number >= 1    |
      | initialDelay     | -1       | must be a number >= 0    |
      | initialDelay     | Infinity | must be a number >= 0    |
      | maxDelay         | -10      | must be a number >= 0    |
      | maxRetries       | 1.5      | must be an integer >= -1 |
      | maxRetries       | -2       | must be an integer >= -1 |
      | on               | yes      | must be a boolean        |
      | unlimitedRetries | 1        | must be a boolean        |

  Scenario: Valid edge values of the retry options are accepted.
    Given An action that always fails, with retry options "initialDelay: 0", "maxDelay: 0" and "maxRetries: 0".
    When The action is dispatched.
    Then It runs once, does not retry, and fails with its own error.

  Scenario: The retry delay only starts after the failed reducer finishes.
    Given An action with retry options "initialDelay: 350" and "maxRetries: 1".
    And Its reducer takes 1000 millis to fail.
    When The action is dispatched.
    Then The second attempt starts 1350 millis after the first one started.

  Scenario: While it waits to retry, the action is still in progress.
    Given An action with retry options "initialDelay: 100", "multiplier: 2" and "maxRetries: 2".
    And The action always fails.
    When The action is dispatched.
    Then It runs again only when each delay ends.
    And While it waits, the action is in progress, and has not failed yet.
    And After the last attempt, the action is not in progress anymore, and has failed.
