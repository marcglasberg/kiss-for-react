Feature: dispatchAll and dispatchAndWaitAll in useStore

  Scenario: The store from useStore can dispatch all given actions with dispatchAll.
    Given A component that gets the store with useStore.
    And Two SYNC actions and one ASYNC action.
    When The component dispatches the three actions with dispatchAll.
    Then All three actions are dispatched.
    And The SYNC actions changed the state right away.
    And It returns the same list of actions.
    And The ASYNC action changes the state when it finishes.

  Scenario: The store from useStore can dispatch all given actions, and wait for them, with dispatchAndWaitAll.
    Given A component that gets the store with useStore.
    And A SYNC action and two ASYNC actions, which take different times to finish.
    When The component dispatches the three actions with dispatchAndWaitAll.
    Then All three actions are dispatched right away.
    And The Promise resolves only after all three actions finished.
    And It resolves with the same list of actions.

  Scenario: With useStore, dispatchAndWaitAll rejects with the error of the first failed action, after all actions finish.
    Given A component that gets the store with useStore.
    And Two ASYNC actions that fail, and an ASYNC action that succeeds and takes longer to finish.
    When The component dispatches the three actions with dispatchAndWaitAll.
    Then The Promise rejects only after all three actions finished.
    And It rejects with the error of the first failed action in the list.
