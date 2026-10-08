Feature: StateObserver

  Scenario: StateObserver is called when the state changes.
    Given SYNC and ASYNC actions.
    When The actions are dispatched.
    Then The SYNC action starts and finishes at once.
    And The ASYNC action first starts, and then finishes after the async gap.

  Scenario: StateObserver when actions throw errors.
    Given SYNC and ASYNC actions that throw errors.
    When The actions are dispatched.
    Then The SYNC action starts and finishes at once.
    And The ASYNC action first starts, and then finishes after the async gap.

  Scenario Outline: StateObserver is called when the action does not change the state.
    Given Actions whose reducers do not change the state, in each of the possible ways.
    When Each action is dispatched.
    Then The StateObserver is called once for each action, with no error.
    And The prevState and the newState are the same, unchanged, state.
    Examples: 
      | Action                   |
      | SyncReturnsNull          |
      | SyncReturnsSameState     |
      | SyncAbortsReduce         |
      | AsyncReturnsNull         |
      | AsyncFunctionReturnsNull |
      | AsyncAbortsReduce        |
