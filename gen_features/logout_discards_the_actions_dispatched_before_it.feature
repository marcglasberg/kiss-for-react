Feature: LogOut discards the actions dispatched before it

  Scenario Outline: An action dispatched before logOut does not change the state when it finishes after logOut.
    Given A store with a persistor.
    And An action that loads the user "bob", with an [Kind].
    And The action was dispatched, and is still running.
    When logOut runs and finishes, and only then the action finishes.
    Then The state is still the initial-state of logOut.
    And The persisted state is also the initial-state of logOut.
    And The action finishes as aborted, not as failed.
    Examples: 
      | Kind                      |
      | ASYNC reduce              |
      | ASYNC before, SYNC reduce |

  Scenario Outline: An action dispatched before logOut that fails after logOut does not fail, and its error is not shown.
    Given An action that fails with [Error] when it finishes.
    And The action was dispatched, and is still running.
    When logOut runs and finishes, and only then the action fails.
    Then The action finishes as aborted, not as failed.
    And The error is not given to the errorObserver.
    And No error is shown to the user.
    And The action does not count as failed.
    Examples: 
      | Error           |
      | an Error        |
      | a UserException |

  Scenario Outline: An action dispatched before logOut cannot dispatch other actions after logOut.
    Given An action that, when it finishes, dispatches another action with [Method].
    And The action was dispatched, and is still running.
    When logOut runs and finishes, and only then the action dispatches the other action.
    Then The other action is not dispatched.
    And The state is still the initial-state of logOut.
    Examples: 
      | Method             |
      | dispatch           |
      | dispatchAndWait    |
      | dispatchSync       |
      | dispatchAll        |
      | dispatchAndWaitAll |
      | dispatchWhen       |

  Scenario: A dispatchWhen called by an action before logOut does not dispatch after logOut.
    Given An action that called dispatchWhen, to dispatch another action when n is 5.
    And The action finished, before logOut.
    When logOut runs and finishes, and then the state changes to n = 5.
    Then The other action is not dispatched.

  Scenario: An OptimisticCommand dispatched before logOut does not apply the server response after logOut.
    Given An OptimisticCommand that saves the user name, and puts the server response in the state.
    And The command was dispatched, and its optimistic value was applied.
    When logOut runs and finishes, and only then the server responds.
    Then The server response is not applied.
    And The state is still the initial-state of logOut.
    And The command finishes as aborted, not as failed.

  Scenario: An action that calls logOut and waits for it cannot change the state, or dispatch actions, after it.
    Given An action that calls logOut and waits for it.
    And After logOut, the action dispatches another action, and changes the state.
    When The action is dispatched.
    Then The other action is not dispatched.
    And The state is the initial-state of logOut.
    And The action finishes as aborted, since it was dispatched before logOut.

  Scenario: Actions dispatched after logOut run normally, and so do the actions they dispatch.
    Given A logOut that already finished.
    When An action is dispatched, which dispatches another action.
    Then Both actions run, and change the state.

  Scenario: An action dispatched before logOut, which finished before logOut, is not affected.
    Given An ASYNC action that loads the user "bob".
    When The action finishes, and only then logOut runs.
    Then The action completed OK, and changed the state before logOut.
    And After logOut, the state is the initial-state of logOut.
