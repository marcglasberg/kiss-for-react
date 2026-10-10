Feature: Fresh

  Scenario: A sync action is not run again while its data is fresh.
    Given A SYNC action with fresh.
    When The action is dispatched 3 times in quick succession.
    Then Only the first action runs, right away.
    And The other dispatches are aborted.

  Scenario: An async action is not run again while its data is fresh.
    Given An ASYNC action with fresh.
    When The action is dispatched 3 times, each after the previous one finished.
    Then Only the first action runs.
    And The aborted dispatches complete without running.

  Scenario: An action runs again when its data is stale.
    Given An action with fresh, that was dispatched.
    When The action is dispatched again, after the fresh period.
    Then It runs again.
    And It starts a new fresh period.

  Scenario: The fresh period starts when the action is dispatched, not when it finishes.
    Given An ASYNC action with fresh, that takes longer than its fresh period to finish.
    When The action is dispatched again while the first is still running, but after the fresh period.
    Then Both actions run.

  Scenario: Setting fresh to true uses the default fresh period of 1000 milliseconds.
    Given An action with fresh = true.
    When The action is dispatched, and then again after a while, but before 1000 milliseconds.
    Then The second dispatch is aborted.
    And The fresh period is 1000 milliseconds.

  Scenario: Setting fresh to false turns off the fresh period a base class turned on.
    Given An action with fresh = false, that extends an action with fresh.
    When The action is dispatched several times in quick succession.
    Then All dispatches run.

  Scenario: An action can ignore the fresh period.
    Given An action with fresh, that ignores the fresh period when it is dispatched with force.
    And The action was dispatched, and its data is still fresh.
    When The action is dispatched with force.
    Then It runs.
    And It starts a new fresh period, so a later dispatch without force is aborted.

  Scenario: When the action fails, its data does not stay fresh.
    Given An action with fresh, that fails.
    When The action is dispatched again, within the fresh period.
    Then It runs again.

  Scenario: When a sync action fails, its data does not stay fresh.
    Given A SYNC action with fresh, that fails.
    When The action is dispatched again, within the fresh period.
    Then It runs again.

  Scenario: When a forced run fails, the data becomes stale, even if it was fresh before.
    Given An action with fresh, that ignores the fresh period when it is dispatched with force.
    And The action was dispatched, and its data is still fresh.
    When The action is dispatched with force, and fails.
    Then The data is stale, so a later dispatch without force runs.

  Scenario: A failed action does not cancel the fresh period started by a newer action.
    Given An action with fresh, that takes a while to finish, and fails.
    And While it runs, the action is dispatched again with force, starts a new fresh period, and succeeds.
    When The first action fails.
    Then The new fresh period is kept, so a dispatch within the new fresh period is aborted.

  Scenario: With retry, the data stays fresh while the action retries, and becomes stale if the last attempt fails.
    Given An action with fresh and retry, that fails on every attempt.
    When The action is dispatched again while it is retrying, and again after it fails.
    Then The dispatch while it is retrying is aborted.
    And The dispatch after it fails runs.

  Scenario: By default, actions of different classes do not share the fresh period.
    Given Two different action classes with fresh.
    And One of them is a subclass of the other.
    When Both actions are dispatched in quick succession.
    Then Both actions run.

  Scenario: Actions of the same class with different freshKeyParams have separate fresh periods.
    Given An action with fresh, whose freshKeyParams returns one of its fields.
    When Actions with different values of that field are dispatched in quick succession.
    Then The actions with different values have separate fresh periods.

  Scenario: Array freshKeyParams are compared by their contents.
    Given An action with fresh, whose freshKeyParams returns a new array with two of its fields.
    When Actions with the same field values, and then with different field values, are dispatched in quick succession.
    Then The actions with the same field values share the fresh period.
    And The action with different field values runs.

  Scenario: Actions of different classes with the same computeFreshKey share the fresh period.
    Given Two different action classes with fresh.
    And Both override computeFreshKey to return the same user id.
    When Both actions are dispatched in quick succession, with the same user id, and then with another user id.
    Then The second action is aborted when it has the same user id.
    And It runs when it has another user id.

  Scenario: The action can remove its own fresh-key.
    Given An action with fresh, that removes its fresh-key in reduce, when the loaded data is empty.
    When The action loads empty data, and is dispatched again within the fresh period.
    Then It runs again.
    And After it loads non-empty data, it does not run again within the fresh period.

  Scenario: Removing all fresh-keys allows all actions to run again right away.
    Given Two actions with fresh and different fresh-keys, whose data is still fresh.
    When removeAllFreshKeys is called.
    Then Both actions can be dispatched again right away.

  Scenario: An action aborted by abortDispatch does not make its fresh-key fresh.
    Given An action with fresh, whose abortDispatch returns true.
    When The action is dispatched, and then an action with the same fresh-key is dispatched.
    Then The second action runs.

  Scenario Outline: Fresh can not be combined with nonReentrant or throttle.
    Given An action with fresh, and also with nonReentrant or throttle.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Other feature |
      | nonReentrant  |
      | throttle      |

  Scenario: Fresh can not be used in an OptimisticCommand.
    Given An OptimisticCommand with fresh.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario Outline: An invalid fresh value makes the dispatch throw.
    Given An action with an invalid fresh value.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Fresh |
      | -1    |
      | NaN   |
      | 300   |
