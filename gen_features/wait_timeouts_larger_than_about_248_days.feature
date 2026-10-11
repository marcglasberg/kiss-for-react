Feature: Wait timeouts larger than about 24.8 days

  Scenario Outline: waitCondition with a very large timeout doesn't time out right away.
    Given A state where the condition is false.
    When We wait for the condition with a timeout of <Timeout>.
    And The condition becomes true a while later.
    Then The wait doesn't time out before that.
    And The wait resolves with the action that made the condition true.
    Examples: 
      | Timeout                 |
      | 30 days                 |
      | Infinity                |
      | Number.MAX_SAFE_INTEGER |

  Scenario: waitCondition with a 30-day timeout times out after exactly 30 days.
    Given A state where the condition is false, and stays false.
    When We wait for the condition with a timeout of 30 days.
    Then The wait has not timed out 1 millisecond before the 30 days.
    And The wait rejects with a TimeoutException at the 30 days.

  Scenario Outline: dispatchWhen with a very large timeout doesn't drop the action.
    Given A state where the condition is false.
    When We use dispatchWhen with a timeout of <Timeout>.
    And The condition becomes true a while later.
    Then The action is dispatched.
    And onTimeout is not called.
    Examples: 
      | Timeout                 |
      | 30 days                 |
      | Infinity                |
      | Number.MAX_SAFE_INTEGER |

  Scenario Outline: waitAllActions with a very large timeout waits for the actions to finish.
    Given An async action that takes 100 milliseconds to finish.
    When We dispatch the action, and wait for it with a timeout of <Timeout>.
    Then The wait doesn't time out.
    And The wait resolves when the action finishes.
    Examples: 
      | Timeout                 |
      | 30 days                 |
      | Infinity                |
      | Number.MAX_SAFE_INTEGER |
