Feature: waitAnyActionTypeFinishes with an optional onTimeout

  Scenario Outline: Waiting with an onTimeout that may be undefined, and is given, using <Waiter>.
    Given An onTimeout callback, in a variable that could also be undefined.
    When We wait with <Waiter> for an action type that never finishes, passing the variable and a timeout.
    Then The onTimeout is called, and the wait resolves with null.
    Examples: 
      | Waiter    |
      | the store |
      | an action |
      | useStore  |

  Scenario Outline: Waiting with an onTimeout that is undefined, using <Waiter>.
    Given An onTimeout variable that is undefined.
    When We wait with <Waiter> for an action type that never finishes, passing the variable and a timeout.
    Then The wait fails with a TimeoutException, as if no onTimeout was given.
    Examples: 
      | Waiter    |
      | the store |
      | useStore  |

  Scenario: Waiting with an onTimeout that may be undefined, when the action finishes in time.
    Given An onTimeout callback, in a variable that could also be undefined.
    When We wait for an action type, passing the variable, and an action of that type finishes.
    Then The wait resolves with that action, and onTimeout is not called.
