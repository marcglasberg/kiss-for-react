Feature: Wait actions snapshot

  Scenario: The actions returned by waitActionCondition don't change after the wait resolves.
    Given We wait for the condition "some action is in progress".
    And An async action is dispatched, which resolves the wait.
    When The action finishes.
    Then The actions returned by the wait still contain the action.

  Scenario: The actions returned by waitActionCondition when it completes immediately don't change later.
    Given An async action is in progress.
    And We wait for the condition "some action is in progress", completing immediately.
    When The action finishes.
    Then The actions returned by the wait still contain the action.

  Scenario: The actions returned by waitActionCondition when it times out don't change later.
    Given An async action is in progress.
    And We wait for a condition that is never met, with a timeout and an onTimeout callback.
    And The wait times out while the action is still in progress.
    When The action finishes.
    Then The actions returned by the wait still contain the action.

  Scenario: The actions returned by waitAllActions don't change after the wait resolves.
    Given A slow action and a fast action are in progress.
    And We wait for the fast action to finish.
    And The wait resolves while the slow action is still in progress.
    When The slow action finishes.
    Then The actions returned by the wait still contain the slow action.
