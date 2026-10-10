Feature: Internet on/off simulation

  Scenario: The store can simulate that there is no internet, for all actions that check it.
    Given An action with checkInternet, and the real internet is on.
    And The store simulates that there is no internet.
    When The action is dispatched.
    Then The action fails with a "No Internet" UserException.

  Scenario: The store can simulate that there is internet, even if the real internet is off.
    Given An action with checkInternet, and the real internet is off.
    And The store simulates that there is internet.
    When The action is dispatched.
    Then The action runs, and changes the state.

  Scenario Outline: By default, the real internet connection is used.
    Given A new store, which does not simulate the internet.
    And An action with checkInternet, and the real internet is {Online}.
    When The action is dispatched.
    Then The action runs: {Runs}.
    Examples: 
      | Online | Runs  |
      | true   | true  |
      | false  | false |

  Scenario: With checkInternet abort, simulating no internet aborts the action.
    Given An action with checkInternet set to abort, and the real internet is on.
    And The store simulates that there is no internet.
    When The action is dispatched.
    Then The dispatch is aborted.

  Scenario: An action can simulate the internet itself, taking precedence over the store.
    Given The store simulates that there is no internet.
    And An action with checkInternet, that simulates that there is internet.
    When The action is dispatched.
    Then The action runs, and changes the state.

  Scenario: Actions without checkInternet ignore the simulation.
    Given An action without checkInternet.
    And The store simulates that there is no internet.
    When The action is dispatched.
    Then The action runs, and changes the state.

  Scenario: The simulation also applies to actions with unlimitedRetryCheckInternet.
    Given An action with unlimitedRetryCheckInternet, and the real internet is on.
    And The store simulates that there is no internet.
    When The action is dispatched.
    Then The action waits for the internet, without running its reducer.
    And When the store simulates that there is internet, the action runs.
