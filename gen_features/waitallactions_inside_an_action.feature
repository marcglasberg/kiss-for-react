Feature: waitAllActions inside an action

  Scenario: Inside an action, waitAllActions with an empty list fails right away, instead of timing out.
    Given An action that dispatches two other actions.
    When The action calls waitAllActions([]) to wait until no actions are in progress.
    Then The action fails with a StoreException, and not with a TimeoutException.
    And It fails right away, since the action itself is in progress, so it could never complete.

  Scenario: Inside an action, waitAllActions with null fails right away, instead of timing out.
    Given An action that dispatches another action.
    When The action calls waitAllActions(null).
    Then The action fails with a StoreException, and not with a TimeoutException.

  Scenario: Inside an action, waitAllActions waits for the given actions to finish.
    Given An action that dispatches two actions in parallel.
    When The action calls waitAllActions with those two actions.
    Then It waits until both finish, and the action completes ok.

  Scenario: Inside an action, waitAllActions ignores the action itself, if it is in the list.
    Given An action that dispatches another action.
    When The action calls waitAllActions with the other action and with itself.
    Then It waits only for the other action to finish, and the action completes ok.

  Scenario: Inside an action, waitAllActions with only the action itself completes right away.
    Given An action that is in progress.
    When The action calls waitAllActions with only itself.
    Then There is nothing else to wait for, so it completes right away, and the action completes ok.

  Scenario: Inside an action, waitAllActionTypes with an empty list fails right away, instead of timing out.
    Given An action that dispatches another action.
    When The action calls waitAllActionTypes([]) to wait until no actions are in progress.
    Then The action fails with a StoreException, and not with a TimeoutException.

  Scenario: Inside an action, waitAllActionTypes ignores the type of the action itself, if it is in the list.
    Given An action that dispatches a BuyAction.
    When The action calls waitAllActionTypes with BuyAction and with its own type.
    Then It waits only for the BuyAction to finish, and the action completes ok.

  Scenario: Outside of actions, store.waitAllActions([]) still waits until no actions are in progress.
    Given Two actions are dispatched in parallel.
    When The test calls store.waitAllActions([]).
    Then It waits until both actions finish.
