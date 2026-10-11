Feature: Non-reentrant key is released after the after method

  Scenario Outline: Dispatching the same non-reentrant action from its after() method is aborted, whatever its reducer did.
    Given A non-reentrant action that dispatches the same action again from its after() method.
    When The action is dispatched, and its reducer is SYNC or ASYNC, and changes the state, returns null, or fails.
    Then The action dispatched from after() is aborted, since the non-reentrant key is only released after after() runs.
    And The state is changed only by the first action.
    Examples: 
      | Reducer | Result            |
      | async   | changes the state |
      | async   | returns null      |
      | async   | fails             |
      | sync    | changes the state |
      | sync    | returns null      |
      | sync    | fails             |

  Scenario: Dispatching the same non-reentrant action after its state changed, but before its after() method ran, is aborted.
    Given A non-reentrant ASYNC action whose reducer changes the state.
    And The same action is dispatched again right after the state changes, before after() runs.
    When The first action is dispatched.
    Then The action dispatched after the state changed is aborted, since the first action has not finished.

  Scenario Outline: A non-reentrant action with a different key can be dispatched from the after() method.
    Given A non-reentrant action whose key depends on a parameter.
    And It dispatches the same action, but with a different key, from its after() method.
    When The action is dispatched, and its reducer changes the state or returns null.
    Then The action dispatched from after() runs, since its key is not taken.
    Examples: 
      | Reducer | Result            |
      | async   | changes the state |
      | async   | returns null      |
      | sync    | changes the state |
      | sync    | returns null      |

  Scenario Outline: Once the non-reentrant action has finished, the same action can be dispatched again.
    Given A non-reentrant action whose reducer changes the state or returns null.
    And The same action is dispatched again when the action observer sees the first action has finished.
    When The first action is dispatched.
    Then The action dispatched after the first one finished runs.
    Examples: 
      | Reducer | Result            |
      | async   | changes the state |
      | async   | returns null      |
      | sync    | changes the state |
      | sync    | returns null      |

  Scenario: An unlimitedRetryCheckInternet action dispatched from its own after() method is aborted.
    Given An action with "unlimitedRetryCheckInternet = true", which is non-reentrant.
    And Its reducer changes the state.
    And It dispatches the same action again from its after() method.
    When The action is dispatched.
    Then The action dispatched from after() is aborted.

  Scenario Outline: An action that shares the non-reentrant key, dispatched from the after() method, is aborted.
    Given A non-reentrant action, and an optimistic command, that share the same non-reentrant key.
    And The action dispatched first changes the state.
    And It dispatches the other one from its after() method.
    When The first action is dispatched.
    Then The one dispatched from after() is aborted.
    Examples: 
      | First                |
      | non-reentrant action |
      | optimistic command   |
