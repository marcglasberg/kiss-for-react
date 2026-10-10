Feature: Throttle

  Scenario: A sync action is throttled when dispatched several times quickly.
    Given A SYNC action with throttle.
    When The action is dispatched 3 times in quick succession.
    Then Only the first action runs, right away.
    And The other dispatches are aborted.

  Scenario: An async action is throttled when dispatched several times quickly.
    Given An ASYNC action with throttle.
    When The action is dispatched 3 times in quick succession.
    Then Only the first action runs.
    And The aborted dispatches complete without running.

  Scenario: An action runs again after the throttle period ends.
    Given An action with throttle, that was dispatched.
    When The action is dispatched again, after the throttle period.
    Then It runs again.
    And It starts a new throttle period.

  Scenario: The throttle period starts when the action is dispatched, not when it finishes.
    Given An ASYNC action with throttle, that takes longer than its throttle period to finish.
    When The action is dispatched again while the first is still running, but after the throttle period.
    Then Both actions run.

  Scenario: Setting throttle to true uses the default throttle period of 1000 milliseconds.
    Given An action with throttle = true.
    When The action is dispatched, and then again after a while, but before 1000 milliseconds.
    Then The second dispatch is aborted.
    And The throttle period is 1000 milliseconds.

  Scenario: Setting throttle to false turns off the throttle a base class turned on.
    Given An action with throttle = false, that extends an action with throttle.
    When The action is dispatched several times in quick succession.
    Then All dispatches run.

  Scenario: An action can ignore the throttle period.
    Given An action with throttle, that ignores the throttle when it is dispatched with force.
    And The action was dispatched, and its throttle period has not ended.
    When The action is dispatched with force.
    Then It runs.
    And It starts a new throttle period, so a later dispatch without force is aborted.

  Scenario: By default, the throttle lock is NOT removed when the action fails.
    Given An action with throttle, that fails.
    When The action is dispatched again, within the throttle period.
    Then It does not run a second time.

  Scenario: With removeThrottleLockOnError, the throttle lock is removed when the action fails.
    Given An action with throttle and removeThrottleLockOnError = true, that fails.
    When The action is dispatched again, within the throttle period.
    Then It runs again.

  Scenario: With removeThrottleLockOnError, the throttle lock is NOT removed when the action succeeds.
    Given An action with throttle and removeThrottleLockOnError = true, that succeeds.
    When The action is dispatched again, within the throttle period.
    Then It does not run a second time.

  Scenario: A failed action does not remove the throttle lock taken by a newer action.
    Given An action with throttle and removeThrottleLockOnError = true, that takes longer than its throttle period, and fails.
    And While it runs, after its throttle period, the action is dispatched again, and takes a new throttle lock.
    When The first action fails.
    Then The new throttle lock is kept, so a dispatch within the new throttle period is aborted.

  Scenario: The action can remove its own throttle lock.
    Given An action with throttle, that removes its throttle lock in after(), only for a specific error.
    When The action fails with that error, and is dispatched again within the throttle period.
    Then It runs again.

  Scenario: By default, actions of different classes do not throttle each other.
    Given Two different action classes with throttle.
    And One of them is a subclass of the other.
    When Both actions are dispatched in quick succession.
    Then Both actions run.

  Scenario: Actions of different classes with the same lock throttle each other.
    Given Two different action classes with throttle.
    And Both override throttleLockBuilder to return the same lock.
    When Both actions are dispatched in quick succession.
    Then Only the first action runs.

  Scenario: Actions of the same class with different locks do not throttle each other.
    Given An action with throttle, whose lock depends on one of its fields.
    When Actions with different values of that field are dispatched in quick succession.
    Then The actions with different locks throttle separately.

  Scenario: Array locks are compared by their contents.
    Given An action with throttle, whose lock is a new array with its class and a field.
    When Actions with the same field value are dispatched in quick succession.
    Then They throttle each other.

  Scenario: Removing all throttle locks allows all actions to run again right away.
    Given Two actions with throttle and different locks, inside their throttle periods.
    When removeAllThrottleLocks is called.
    Then Both actions can be dispatched again right away.

  Scenario: An action aborted by abortDispatch does not take the throttle lock.
    Given An action with throttle, whose abortDispatch returns true.
    When The action is dispatched, and then an action with the same lock is dispatched.
    Then The second action runs.

  Scenario: Throttle can not be combined with nonReentrant.
    Given An action with both throttle and nonReentrant.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario: Throttle can not be used in an OptimisticCommand.
    Given An OptimisticCommand with throttle.
    When The action is dispatched.
    Then The dispatch throws a StoreException.

  Scenario Outline: An invalid throttle value makes the dispatch throw.
    Given An action with an invalid throttle value.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Throttle |
      | -1       |
      | NaN      |
      | 300      |
