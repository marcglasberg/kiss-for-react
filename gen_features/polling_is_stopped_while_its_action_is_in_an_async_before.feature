Feature: Polling is stopped while its action is in an async before

  Scenario Outline: Polling does not start if it was stopped while its action was in an async before.
    Given An action that starts polling with [Poll], and whose before() is async.
    And The action was dispatched, and is still in its before().
    When All polling is stopped with [How].
    Then After the action finishes, the polling does not start.
    And The action finishes as aborted.
    Examples: 
      | Poll                  | How                                            |
      | Poll.start            | clearInternalActionProps()                     |
      | Poll.start            | setShutDown(true), and then setShutDown(false) |
      | Poll.start            | logOut()                                       |
      | Poll.runNowAndRestart | clearInternalActionProps()                     |
      | Poll.runNowAndRestart | setShutDown(true), and then setShutDown(false) |
      | Poll.runNowAndRestart | logOut()                                       |

  Scenario Outline: An action dispatched after all polling was stopped can start polling again.
    Given All polling was stopped with clearInternalActionProps().
    When An action that starts polling with [Poll], and whose before() is async, is dispatched.
    Then The polling starts, and ticks.
    Examples: 
      | Poll                  |
      | Poll.start            |
      | Poll.runNowAndRestart |
