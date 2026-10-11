Feature: The actions in progress the developer gets are copies

  Scenario: Getting the actions in progress gives a copy, not a live view.
    Given An async action is in progress.
    When We get the actions in progress.
    And Then another action is dispatched, and the first action finishes.
    Then The set we got still has the first action.
    And It doesn't have the second action.

  Scenario: Getting the actions in progress twice gives two separate copies.
    Given An async action is in progress.
    When We get the actions in progress twice.
    And We change the first set we got.
    Then The two sets are different objects.
    And The second set is not changed.

  Scenario Outline: Changing the actions in progress we got doesn't affect the store.
    Given An async action is in progress.
    When We get the actions in progress, and change that set with <Change>.
    Then It doesn't throw an error.
    And The action is still in progress in the store, and no other action is.
    And Waiting for the action still completes when it finishes.
    Examples: 
      | Change |
      | delete |
      | clear  |
      | add    |

  Scenario: The actions in progress are a real Set.
    Given Two async actions are in progress.
    When We get the actions in progress.
    Then It is a Set, with all the Set methods.

  Scenario: The actions in progress can be printed for debugging.
    Given Two async actions are in progress.
    When We turn the actions in progress into a string.
    Then We get the description of each action.

  Scenario: The condition of waitActionCondition gets a copy of the actions in progress.
    Given An async action is in progress.
    When We wait for a condition that keeps the sets of actions it gets.
    And The action finishes.
    Then The condition got a different set each time.
    And The first set it got still has the action, because it's a copy, not a live view.

  Scenario: Changing the set the condition of waitActionCondition gets doesn't affect the store.
    Given An async action is in progress.
    When We wait for a condition that clears the set of actions it gets.
    Then The wait doesn't fail.
    And The action is still in progress in the store.
    And The wait completes when the action finishes.

  Scenario: Two waits that complete together get separate copies of the actions in progress.
    Given Two async actions are in progress, a fast one and a slow one.
    And Two waits are waiting for the fast action to finish.
    When The fast action finishes.
    And We change the set of actions returned by the first wait.
    Then Both waits got a set with the slow action, but the sets are different objects.
    And The set returned by the second wait is not changed.
    And The slow action is still in progress in the store.
    And Waiting for the slow action still completes when it finishes.
