Feature: Dispatching the same action twice

  Scenario Outline: Dispatching an action that already finished throws right away.
    Given A SYNC or ASYNC action that was already dispatched and finished.
    When The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch call itself throws a StoreException (it does not return a rejected promise).
    And The action does not run again.
    And The failed dispatch still counts as a dispatch, but is not seen by the actionObserver.
    Examples: 
      | Kind  | Method          |
      | sync  | dispatch        |
      | sync  | dispatchSync    |
      | sync  | dispatchAndWait |
      | async | dispatch        |
      | async | dispatchSync    |
      | async | dispatchAndWait |

  Scenario Outline: Dispatching an action that is still running throws, and the first dispatch is not affected.
    Given An ASYNC action that was dispatched with dispatchAndWait, and is still running.
    When The same action instance is dispatched again with dispatch or dispatchAndWait.
    Then The second dispatch throws a StoreException right away.
    And The first dispatchAndWait still finishes, and the action runs only once.
    Examples: 
      | Method          |
      | dispatch        |
      | dispatchAndWait |

  Scenario: The already-dispatched error is not processed like an action failure.
    Given A store with an errorObserver and a globalWrapError.
    And An action that was already dispatched.
    When The same action instance is dispatched again.
    Then The StoreException is thrown to the caller.
    And The errorObserver and the globalWrapError are not called.
