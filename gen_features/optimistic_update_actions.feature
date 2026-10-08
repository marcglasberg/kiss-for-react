Feature: Optimistic update actions

  Scenario: A successful save keeps the new value and then applies the reloaded value.
    Given An optimistic update action whose save succeeds.
    And Its reload returns the value from the server.
    When The action is dispatched.
    Then The new value is applied before saving.
    And The final state has the reloaded value.
    And The action completes OK.

  Scenario: When the save fails, the action fails with the save error.
    Given An optimistic update action whose save throws a UserException.
    When The action is dispatched.
    Then The action completes with the save error.
    And The action is marked as failed in the store.
    And The error is shown to the user.

  Scenario: When the save fails, the rollback happens before the reload, so the reloaded value wins.
    Given An optimistic update action whose save fails.
    And Its reload returns the value from the server.
    When The action is dispatched.
    Then The state is rolled back to the old value before reloading.
    And The final state has the reloaded value, not the old one.

  Scenario: When the save fails and there is no reload, the state is rolled back.
    Given An optimistic update action whose save fails.
    And The action does not provide a reload method.
    When The action is dispatched.
    Then The state goes back to the old value.
    And The action fails with the save error.

  Scenario: When the save fails but the state was changed meanwhile, there is no rollback.
    Given An optimistic update action whose save fails.
    And While saving, another action changes the same value.
    And The action does not provide a reload method.
    When The action is dispatched.
    Then The state keeps the value set by the other action.
    And The action fails with the save error.

  Scenario: When the reload fails after a successful save, the action fails with the reload error.
    Given An optimistic update action whose save succeeds.
    And Its reload throws an error.
    When The action is dispatched.
    Then The action fails with the reload error.
    And The state keeps the new value.

  Scenario: When both the save and the reload fail, the action fails with the save error.
    Given An optimistic update action whose save fails.
    And Its reload also throws an error.
    When The action is dispatched.
    Then The action fails with the save error.
    And The state is rolled back to the old value.
