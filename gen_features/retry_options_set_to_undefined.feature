Feature: Retry options set to undefined

  Scenario: A "maxRetries" set to undefined uses the default of 3 retries.
    Given An action that always fails, with retry options "initialDelay: 1" and "maxRetries: undefined".
    # For example, "maxRetries: config.maxRetries", where the config does not set it.
    When The action is dispatched.
    Then It runs 4 times, and then fails.

  Scenario Outline: A retry option set to undefined uses its default value.
    Given An action that always fails, with retry options where one option is set to undefined.
    When The action is dispatched.
    Then That option uses its default value, which gives the expected delays between attempts.
    And The action fails after the last retry.
    Examples: 
      | Undefined option | Other option       | Delays           |
      | initialDelay     | maxRetries: 3      | 350, 700, 1400   |
      | multiplier       | initialDelay: 100  | 100, 200, 400    |
      | maxDelay         | initialDelay: 2000 | 2000, 4000, 5000 |
      | maxRetries       | initialDelay: 100  | 100, 200, 400    |
      | on               | initialDelay: 100  | 100, 200, 400    |
      | unlimitedRetries | initialDelay: 100  | 100, 200, 400    |

  Scenario: All retry options set to undefined is the same as turning retry on with the defaults.
    Given An action that always fails, with all its retry options set to undefined.
    When The action is dispatched.
    Then It waits 350, 700 and 1400 millis between attempts, and then fails.

  Scenario: An optimistic command with "maxRetries" set to undefined stops retrying, and can be dispatched again.
    Given An optimistic command whose server call always fails.
    And Its retry options are "initialDelay: 1" and "maxRetries: undefined".
    When The command is dispatched.
    Then The server call runs 4 times, and then the command fails.
    And The optimistic value is rolled back.
    And A later dispatch of the same command is not aborted.
