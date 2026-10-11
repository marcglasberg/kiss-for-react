Feature: dispatchAll and dispatchAndWaitAll inside actions

  Scenario: An action can dispatch all given actions with dispatchAll.
    Given Two SYNC actions and one ASYNC action.
    When An action dispatches the three actions with this.dispatchAll.
    Then All three actions are dispatched.
    And The SYNC actions changed the state right away.
    And It returns the same list of actions.
    And The ASYNC action changes the state when it finishes.

  Scenario: An action can dispatch all given actions, and wait for them, with dispatchAndWaitAll.
    Given A SYNC action and two ASYNC actions, which take different times to finish.
    When An action dispatches the three actions with this.dispatchAndWaitAll.
    Then It waits until all three actions finished.
    And It gets the same list of actions.

  Scenario: Inside an action, dispatchAndWaitAll rejects with the error of the first failed action, after all actions finish.
    Given Two ASYNC actions that fail, and an ASYNC action that succeeds and takes longer to finish.
    When An action dispatches the three actions with this.dispatchAndWaitAll.
    Then The action fails only after all three actions finished.
    And It fails with the error of the first failed action in the list.
