Feature: Wait onTimeout

  Scenario: With onTimeout, a state condition that times out calls onTimeout and resolves with null.
    Given We wait for a state condition, with a short timeout and an onTimeout callback.
    When The timeout expires before the condition is met.
    Then onTimeout is called once.
    And The wait resolves with null, instead of failing.
    And The condition is no longer checked.

  Scenario: onTimeout is not called when the condition is met in time.
    Given We wait for a state condition, with a timeout and an onTimeout callback.
    When The state changes so that the condition is met before the timeout.
    Then The wait resolves with the action that met the condition.
    And onTimeout is never called.

  Scenario: If onTimeout throws, the wait fails with that error.
    Given We wait for a state condition, with an onTimeout callback that throws.
    When The timeout expires.
    Then The wait fails with the error thrown by onTimeout.

  Scenario: With onTimeout, an action condition that times out calls onTimeout and resolves.
    Given We wait for an action condition, with a short timeout and an onTimeout callback.
    When The timeout expires before the condition is met.
    Then onTimeout is called once.
    And The wait resolves with no trigger action, instead of failing.

  Scenario: The other wait methods also accept onTimeout.
    Given An action that takes a long time is in progress.
    When We wait for it with each wait method, with a short timeout and an onTimeout callback.
    Then Each wait calls its onTimeout, and resolves instead of failing.

  Scenario: dispatchWhen dispatches the action when the condition is met.
    Given We call dispatchWhen with an action and a state condition.
    When The state changes so that the condition is met.
    Then The action is dispatched.

  Scenario: dispatchWhen does not fail with an unhandled error when it times out.
    Given We call dispatchWhen with a short timeout, and no onTimeout callback.
    When The timeout expires before the condition is met.
    Then The action is not dispatched.
    And There is no unhandled promise rejection.
    And The timeout is logged.

  Scenario: dispatchWhen calls onTimeout when it times out.
    Given We call dispatchWhen with a short timeout and an onTimeout callback.
    When The timeout expires before the condition is met.
    Then onTimeout is called once.
    And The action is not dispatched.

  Scenario: An action can use dispatchWhen.
    Given An action calls this.dispatchWhen, to increment the count when it reaches 3.
    When The count reaches 3.
    Then The action given to dispatchWhen is dispatched.

  Scenario Outline: A component can use dispatchWhen, with useDispatchWhen or useStore.
    Given A component gets dispatchWhen from a hook.
    And It calls it to increment the count when it reaches 1.
    When The count reaches 1.
    Then The action given to dispatchWhen is dispatched.
    Examples: 
      | Hook            |
      | useDispatchWhen |
      | useStore        |
