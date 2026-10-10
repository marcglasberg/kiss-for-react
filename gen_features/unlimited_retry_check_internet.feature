Feature: Unlimited retry check internet

  Scenario: When there is no internet, the action waits and retries until there is internet.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet.
    When The action is dispatched.
    Then The reducer does not run while there is no internet.
    And The action keeps checking the internet, and is still in progress.
    And When the internet comes back, the reducer runs, and the action succeeds.

  Scenario: When there is internet but the action fails, it retries unlimited times until it succeeds.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is internet, but the action fails the first 10 times.
    When The action is dispatched.
    Then It keeps retrying, and succeeds on the 11th attempt.
    # A plain retry would give up after 3 retries.

  Scenario: When there is no internet, the delay between retries is at most 1 second, by default.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet for the first 4 checks.
    When The action is dispatched.
    Then It checks the internet again after 350, 700, 1000 and 1000 millis.
    And Then the reducer runs once, and the action succeeds.

  Scenario: When there is internet but the action fails, the delay between retries is at most 5 seconds, by default.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is internet, but the action fails the first 6 times.
    When The action is dispatched.
    Then It retries after 350, 700, 1400, 2800, 5000 and 5000 millis.

  Scenario: The delay keeps growing across attempts with and without internet.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet for the first 3 checks.
    And Then there is internet, but the action fails the first time it runs.
    When The action is dispatched.
    Then It checks the internet again after 350, 700 and 1000 millis (capped by the no-internet maximum).
    And Then it retries after 2000 millis (the delay doubled, capped by the maximum delay).

  Scenario: The retry delays can be configured.
    Given An action with these "unlimitedRetryCheckInternet" options:
      | initialDelay | multiplier | maxDelay | maxDelayNoInternet |
      | 100          | 3          | 2000     | 500                |
    And There is no internet for the first 3 checks.
    And Then there is internet, but the action fails the first 3 times it runs.
    When The action is dispatched.
    Then Without internet, it waits 100, 300 and 500 millis.
    And With internet, it waits 1500, 2000 and 2000 millis.

  Scenario: The action is non-reentrant for the whole time until it succeeds.
    Given An action with "unlimitedRetryCheckInternet = true", dispatched while there is no internet.
    When Another action of the same class is dispatched while the first one is waiting to retry.
    Then The second action is aborted silently.
    And After the first action succeeds, a new action of the same class runs normally.

  Scenario: Actions of the same class with different non-reentrant key params do not block each other.
    Given An action with "unlimitedRetryCheckInternet = true" that overrides "nonReentrantKeyParams()".
    And There is no internet.
    When Two actions with different params are dispatched, and then one with the same params as the first.
    Then The actions with different params both run when the internet comes back.
    And The action with the same params as the first is aborted.

  Scenario: The non-reentrant key is shared with "nonReentrant" actions.
    Given An action with "unlimitedRetryCheckInternet = true", waiting to retry because there is no internet.
    And A "nonReentrant" action of another class, with the same "computeNonReentrantKey()".
    When The "nonReentrant" action is dispatched.
    Then It is aborted.

  Scenario: The attempts count both the attempts without internet and the failed ones.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet for the first 2 checks.
    And Then there is internet, but the action fails the first 3 times it runs.
    When The action is dispatched.
    Then The action succeeds with 5 attempts.

  Scenario: If checking the internet throws an error, it counts as a failed attempt, and it retries.
    Given An action with "unlimitedRetryCheckInternet = true".
    And Its internet check throws an error the first 2 times.
    When The action is dispatched.
    Then It retries, and the action succeeds when the internet check works.

  Scenario: An action that aborts itself is not retried.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is internet, but its reducer throws an AbortDispatchException.
    When The action is dispatched.
    Then It is not retried, and the dispatch is aborted.

  Scenario: If the "before" method throws an error, the action is not retried.
    Given An action with "unlimitedRetryCheckInternet = true", whose "before" method throws an error.
    When The action is dispatched.
    Then It fails without checking the internet, and without running the reducer.

  Scenario: It can be turned off with "false".
    Given An action with "unlimitedRetryCheckInternet = false", that always fails.
    When The action is dispatched.
    Then It runs once, without checking the internet, and fails without retrying.
    # This lets a subclass turn off what a base class turned on.

  Scenario: The retries are logged.
    Given An action with "unlimitedRetryCheckInternet = true".
    And There is no internet for the first check, and then the action fails once.
    When The action is dispatched.
    Then Each attempt is logged, saying if it was aborted because of no internet.

  Scenario: It needs an ASYNC reducer.
    Given An action with "unlimitedRetryCheckInternet = true", with a SYNC reducer.
    When The action is dispatched.
    Then The action fails with a StoreException that explains the problem.

  Scenario Outline: It can not be combined with some other features.
    Given An action with "unlimitedRetryCheckInternet = true".
    And The action also uses another feature that can not be combined with it.
    When The action is dispatched.
    Then The dispatch throws a StoreException that names both features.
    And The reducer does not run.
    Examples: 
      | Feature       |
      | retry         |
      | checkInternet |
      | nonReentrant  |
      | debounce      |
      | throttle      |
      | fresh         |
      | sequential    |
      | polling       |

  Scenario: It can not be used in an OptimisticCommand.
    Given An OptimisticCommand with "unlimitedRetryCheckInternet = true".
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario Outline: An invalid value makes the dispatch throw a descriptive error.
    Given An action with an invalid "unlimitedRetryCheckInternet" value.
    When The action is dispatched.
    Then The dispatch throws a StoreException that names the action, the problem and the value.
    And The reducer does not run.
    Examples: 
      | Value           | Message                                                              |
      | yes             | it must be a boolean, or an object                                   |
      | 1               | it must be a boolean, or an object                                   |
      | [object Object] | unlimitedRetryCheckInternet.multiplier must be a number >= 1         |
      | [object Object] | unlimitedRetryCheckInternet.initialDelay must be a number >= 0       |
      | [object Object] | unlimitedRetryCheckInternet.maxDelay must be a number >= 0           |
      | [object Object] | unlimitedRetryCheckInternet.maxDelayNoInternet must be a number >= 0 |
