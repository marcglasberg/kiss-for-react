Feature: Debounce

  Scenario: A sync action is debounced when dispatched several times quickly.
    Given A SYNC action with debounce.
    When The action is dispatched 3 times in quick succession.
    Then Only the last action runs its reducer, once, after the debounce period.

  Scenario: An async action is debounced when dispatched several times quickly.
    Given An ASYNC action with debounce.
    When The action is dispatched 3 times in quick succession.
    Then Only the last action runs its reducer, once, after the debounce period.

  Scenario: Each dispatch resets the debounce period.
    Given An action with debounce.
    When The action is dispatched several times, each one before the debounce period of the previous ends.
    Then No action runs until the dispatches stop for the debounce period.

  Scenario: An action runs again after the debounce period expires.
    Given An action with debounce.
    When The action is dispatched.
    And After the debounce period, it is dispatched again.
    Then Each dispatch runs its reducer.

  Scenario: An action dispatched during the debounce period finishes right away, without running its reducer.
    Given An action with debounce, that is waiting for its debounce period.
    When Another action of the same class is dispatched.
    Then The first action finishes right away, without failing.
    And Its before and after methods run, but not its reducer.
    And Only the second action changes the state.

  Scenario: Setting debounce to true uses the default debounce period of 333 milliseconds.
    Given An action with debounce = true.
    When The action is dispatched.
    Then It runs its reducer only after 333 milliseconds.

  Scenario: Setting debounce to false turns off the debounce a base class turned on.
    Given An action with debounce = false, that extends an action with debounce.
    When The action is dispatched.
    Then It runs right away.

  Scenario: By default, actions of different classes do not debounce each other.
    Given Two different action classes with debounce.
    And One of them is a subclass of the other.
    When Both actions are dispatched in quick succession.
    Then Both actions run their reducers.

  Scenario: Actions of different classes with the same lock debounce each other.
    Given Two different action classes with debounce.
    And Both override debounceLockBuilder to return the same lock.
    When Both actions are dispatched in quick succession.
    Then Only the last action runs its reducer.

  Scenario: Actions of the same class with different locks do not debounce each other.
    Given An action with debounce, whose lock depends on one of its fields.
    When Actions with different values of that field are dispatched in quick succession.
    Then The actions with different locks debounce separately.

  Scenario: Array locks are compared by their contents.
    Given An action with debounce, whose lock is a new array with its class and a field.
    When Actions with the same field value are dispatched in quick succession.
    Then They debounce each other.

  Scenario: Removing all debounce locks makes the waiting actions finish without running their reducers.
    Given Two actions with debounce and different locks, waiting for their debounce period.
    When removeAllDebounceLocks is called.
    Then Both actions finish right away, without running their reducers.
    And A new action with debounce still runs after its debounce period.

  Scenario: A custom wrapReduce only runs for the action that runs its reducer.
    Given An action with debounce and a custom wrapReduce.
    When The action is dispatched twice in quick succession.
    Then The wrapReduce runs only once, after the debounce period.

  Scenario: A debounced action uses the state at the time its reducer runs.
    Given An action with debounce.
    When The action is dispatched.
    And The state changes during the debounce period.
    Then The reducer reads the changed state.

  Scenario: A debounced action can not be dispatched with dispatchSync.
    Given A SYNC action with debounce.
    When The action is dispatched with dispatchSync.
    Then The dispatch throws a StoreException.
    And The reducer does not run.

  Scenario: Debounce can not be combined with retry.
    Given An action with both debounce and retry.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario: Debounce can not be used in an OptimisticCommand.
    Given An OptimisticCommand with debounce.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario Outline: An invalid debounce value makes the dispatch throw.
    Given An action with an invalid debounce value.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Debounce |
      | -1       |
      | NaN      |
      | 300      |
