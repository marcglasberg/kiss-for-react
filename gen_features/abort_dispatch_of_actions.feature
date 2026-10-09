Feature: Abort dispatch of actions

  Scenario: The action can abort its own dispatch.
    Given An action that returns true (or false) in its abortDispatch method.
    When The action is dispatched (with dispatch, or dispatchSync, or dispatchAndWait).
    Then It is aborted (or is not aborted, respectively).
    # We have to test dispatch/dispatchSync/dispatchAndWait separately, because they abort in different ways.

  Scenario: When an action is mocked, its mock decides if it is aborted.
    Given An action that returns true (or false) in its abortDispatch method.
    And The action is mocked with an action that does the opposite.
    When The action is dispatched (with dispatch, or dispatchSync, or dispatchAndWait).
    Then It is not aborted (or is aborted, respectively).
    # It should now abort when its abortDispatch method return false, which is the opposite of the normal behavior.
    # We have to test dispatch/dispatchSync/dispatchAndWait separately, because they abort in different ways.

  Scenario Outline: The action can use the state to decide if it aborts its dispatch.
    Given An action that aborts its dispatch when the count is {Limit} or more.
    And The count is 3.
    When The action is dispatched with dispatch, dispatchSync or dispatchAndWait.
    Then It {Result}.
    Examples: 
      | Limit | Result     | Method          |
      | 3     | is aborted | dispatch        |
      | 3     | is aborted | dispatchSync    |
      | 3     | is aborted | dispatchAndWait |
      | 5     | runs       | dispatch        |
      | 5     | runs       | dispatchSync    |
      | 5     | runs       | dispatchAndWait |

  Scenario: Inside abortDispatch, the action can read its store and its initial state.
    Given An action that reads this.store and this.initialState in its abortDispatch method.
    When The action is dispatched.
    Then abortDispatch sees the store, and the state of the store as its initial state.
