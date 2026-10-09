Feature: Non reentrant actions

  Scenario: Sync action non-reentrant does not call itself.
    Given A SYNC action that calls itself.
    And The action is non-reentrant.
    When The action is dispatched.
    Then It runs once.
    And Does not result in a stack overflow.

  Scenario: Async action non-reentrant does not call itself.
    Given An ASYNC action that calls itself.
    And The action is non-reentrant.
    When The action is dispatched.
    Then It runs once.
    And Does not result in a stack overflow.

  Scenario: Async action non-reentrant does start before an action of the same type finished.
    Given An ASYNC action takes some time to finish.
    And The action is non-reentrant.
    When The action is dispatched.
    And Another action of the same type is dispatched before the previous one finished.
    Then It runs only once.

  Scenario: dispatchAndWait does not start a non-reentrant action while one of the same type is running.
    Given An ASYNC action takes some time to finish.
    And The action is non-reentrant.
    When The action is dispatched.
    And Two other actions of the same type are dispatched with dispatchAndWait before the first one finished.
    Then The reducer runs only once.
    And The dispatchAndWait calls resolve, with a status saying the action was not dispatched.

  Scenario: dispatchSync does not start a non-reentrant action while one of the same type is running.
    Given A SYNC action that calls itself with dispatchSync.
    And The action is non-reentrant.
    When The action is dispatched with dispatchSync.
    Then It runs once.
    And Does not result in a stack overflow.

  Scenario: An action calling dispatchAndWait on itself does not start a non-reentrant action twice.
    Given An ASYNC action that calls itself with dispatchAndWait.
    And The action is non-reentrant.
    When The action is dispatched.
    Then It runs once.
    And It finishes, instead of waiting for itself forever.

  Scenario: A non-reentrant action is not aborted by a running action of a subclass.
    Given A non-reentrant action, and a subclass of it.
    When The subclass action is dispatched.
    And The superclass action is dispatched while the subclass action is running.
    Then Both actions run.

  Scenario: A non-reentrant action is not aborted by a running action of its superclass.
    Given A non-reentrant action, and a subclass of it.
    When The superclass action is dispatched.
    And The subclass action is dispatched while the superclass action is running.
    Then Both actions run.

  Scenario: Non-reentrant actions with different key params run at the same time.
    Given A non-reentrant action that uses the item id as its non-reentrant key params.
    When The action is dispatched for item A, and again for item A, and for item B, while the first one is running.
    Then The second action for item A is aborted.
    And The action for item B runs.

  Scenario: Key params that are arrays or plain objects are compared by their contents.
    Given A non-reentrant action that uses an array as its non-reentrant key params.
    When The action is dispatched twice, with different arrays with the same contents.
    And Then dispatched with an array with different contents.
    Then The second action is aborted.
    And The third action runs.

  Scenario: Different non-reentrant actions with the same key block each other.
    Given Two different non-reentrant actions, that compute the same non-reentrant key for the same user.
    When The first action is dispatched for a user.
    And The second action is dispatched for the same user, and then for another user, while the first one is running.
    Then The second action for the same user is aborted.
    And The second action for the other user runs.

  Scenario: A non-reentrant action and an optimistic command with the same key block each other.
    Given A non-reentrant action and an optimistic command, that compute the same non-reentrant key.
    When The non-reentrant action is dispatched.
    And The optimistic command is dispatched while the non-reentrant action is running.
    Then The optimistic command is aborted.

  Scenario: The non-reentrant key is released when the action fails.
    Given A non-reentrant action that fails.
    When The action is dispatched and fails.
    And The action is dispatched again.
    Then The second action runs.
