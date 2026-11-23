Feature: Debounce combined with nonReentrant, throttle and fresh

  Scenario Outline: Only the last of several quick dispatches runs its reducer, when debounce is combined with another feature.
    Given An action with debounce, combined with nonReentrant, throttle or fresh.
    When The action is dispatched 3 times in quick succession.
    Then Only the last action runs its reducer, after the debounce period.
    And No dispatch is aborted.
    And The first two actions finish without running their reducers, and without failing.
    Examples: 
      | Feature      |
      | nonReentrant |
      | throttle     |
      | fresh        |

  Scenario Outline: Each dispatch resets the debounce period, when debounce is combined with another feature.
    Given An action with debounce, combined with nonReentrant, throttle or fresh.
    When The action is dispatched several times, each one before the debounce period of the previous ends.
    Then No action runs until the dispatches stop for the debounce period.
    And Then only the last action runs its reducer.
    Examples: 
      | Feature      |
      | nonReentrant |
      | throttle     |
      | fresh        |

  Scenario: A debounced nonReentrant action is aborted if, when its debounce period ends, another one with the same key is running its reducer.
    Given An action with debounce and nonReentrant.
    And The action was dispatched, and is running its slow reducer.
    When The action is dispatched again.
    And Its debounce period ends while the first reducer is still running.
    Then The second action is aborted, without running its reducer.
    And Its before and after methods still run.
    And The first action is not affected.

  Scenario: A debounced nonReentrant action dispatched while another one runs its reducer still runs, if the other one finished before its debounce period ends.
    Given An action with debounce and nonReentrant.
    And The action was dispatched, and is running its reducer.
    When The action is dispatched again.
    And The first reducer finishes before the debounce period of the second action ends.
    Then The second action is not aborted, and runs its reducer.

  Scenario: The throttle period of a debounced action starts when its debounce period ends.
    Given An action with a 30 millis debounce and a 300 millis throttle.
    And The action was dispatched, and ran its reducer after its debounce period.
    When The action is dispatched a 2nd time, and its debounce period ends inside the throttle period.
    And The action is dispatched a 3rd time, and its debounce period ends after the throttle period.
    Then The second action is aborted when its debounce period ends, without running its reducer.
    And Its before and after methods still run.
    And The third action runs its reducer.

  Scenario: The fresh period of a debounced action starts when its debounce period ends.
    Given An action with a 30 millis debounce and a 300 millis fresh period.
    And The action was dispatched, and ran its reducer after its debounce period.
    When The action is dispatched a 2nd time, and its debounce period ends inside the fresh period.
    And The action is dispatched a 3rd time, and its debounce period ends after the fresh period.
    Then The second action is aborted when its debounce period ends, without running its reducer.
    And Its before and after methods still run.
    And The third action runs its reducer.

  Scenario Outline: A debounced action that did not run its reducer does not take its throttle lock or make its key fresh.
    Given An action with debounce, combined with throttle or fresh.
    And The throttle lock or the fresh-key is the text being searched.
    And The action was dispatched to search "a", and then to search "ab", in quick succession.
    And So only "ab" was searched.
    When The action is dispatched again, to search "a".
    Then It runs its reducer, since "a" was never searched.
    Examples: 
      | Feature  |
      | throttle |
      | fresh    |

  Scenario Outline: abortDispatch is still checked when a debounced action is dispatched.
    Given An action with debounce, combined with nonReentrant, throttle or fresh.
    And Its abortDispatch returns true when the text is empty.
    And The action was dispatched to search "a".
    When The action is dispatched with an empty text, during the debounce period.
    Then The second action is aborted right away, and its before and after methods do not run.
    And It does not reset the debounce period, so the first action runs its reducer.
    Examples: 
      | Feature      |
      | nonReentrant |
      | throttle     |
      | fresh        |

  Scenario Outline: A debounced action is aborted if computing its key throws when its debounce period ends.
    Given An action with debounce, combined with nonReentrant, throttle or fresh.
    And Computing its non-reentrant key, throttle lock or fresh-key throws an error.
    When The action is dispatched.
    Then The action is aborted when its debounce period ends, without running its reducer.
    And The error is not thrown.
    Examples: 
      | Feature      |
      | nonReentrant |
      | throttle     |
      | fresh        |
