Feature: Delays larger than about 24.8 days are capped

  Scenario Outline: A retry delay larger than about 24.8 days is capped at about 24.8 days.
    Given An action that always fails, and retries once, with a retry delay of <Delay>.
    When The action is dispatched.
    Then It doesn't retry within one second.
    And It retries when about 24.8 days have passed.
    Examples: 
      | Delay                   |
      | 30 days                 |
      | Number.MAX_SAFE_INTEGER |

  Scenario: A retry delay that grows past about 24.8 days stays at about 24.8 days.
    Given An action that always fails, and retries forever.
    And Its retry delay starts at 1 day, doubles each time, and has a maximum of 1000 days.
    When The action is dispatched, and retried until its delay is larger than about 24.8 days.
    Then It doesn't retry within one second.
    And It retries when about 24.8 days have passed.

  Scenario: A debounce larger than about 24.8 days is capped at about 24.8 days.
    Given An action with a debounce of 30 days.
    When The action is dispatched.
    Then Its reducer doesn't run within one second.
    And Its reducer runs when about 24.8 days have passed.

  Scenario: A poll interval larger than about 24.8 days is capped at about 24.8 days.
    Given An action that polls every 30 days.
    When The action is dispatched with Poll.start.
    Then It runs right away.
    And It doesn't run again within one second.
    And It runs again when about 24.8 days have passed.

  Scenario: A persistor throttle larger than about 24.8 days is respected.
    Given A store with a persistor with a throttle of 30 days.
    And The initial state was just saved.
    When The state changes.
    Then The new state is not saved within one second.
    And The new state is not saved when about 24.8 days have passed.
    And The new state is saved when the 30 days have passed.

  Scenario: A logOut throttle larger than about 24.8 days is capped at about 24.8 days.
    Given A store.
    When We log out with a throttle of 30 days.
    Then The logOut doesn't finish within one second.
    And The logOut finishes when about 24.8 days have passed.
