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
