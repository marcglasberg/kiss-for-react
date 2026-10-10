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

  Scenario Outline: Dispatching a non-reentrant action that is still running throws.
    Given A non-reentrant ASYNC action that was dispatched, and is still running.
    When The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.
    Then The second dispatch throws a StoreException right away.
    And The action runs only once.
    Examples: 
      | Method          |
      | dispatch        |
      | dispatchSync    |
      | dispatchAndWait |

  Scenario Outline: Dispatching an action that already finished throws, even if it would now abort its dispatch.
    Given An action that aborts its dispatch after it runs once.
    And The action was dispatched and finished.
    When The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch throws a StoreException, instead of being silently aborted.
    Examples: 
      | Method          |
      | dispatch        |
      | dispatchSync    |
      | dispatchAndWait |

  Scenario Outline: Dispatching an action that already finished throws, even if the store is shut down.
    Given An action that was dispatched and finished.
    And The store was shut down.
    When The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch throws a StoreException, instead of being silently ignored.
    Examples: 
      | Method          |
      | dispatch        |
      | dispatchSync    |
      | dispatchAndWait |

  Scenario Outline: Dispatching an action that already finished throws, even if it is now mocked.
    Given An action that was dispatched and finished.
    And The action is now mocked {Mock}.
    When The same action instance is dispatched again with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch throws a StoreException.
    Examples: 
      | Mock            | Method          |
      | as null         | dispatch        |
      | as null         | dispatchSync    |
      | as null         | dispatchAndWait |
      | by a new action | dispatch        |
      | by a new action | dispatchSync    |
      | by a new action | dispatchAndWait |

  Scenario Outline: Dispatching an action whose mock was already dispatched throws.
    Given An action that is mocked by another action, which was already dispatched.
    When The action is dispatched with dispatch, dispatchSync or dispatchAndWait.
    Then The dispatch throws a StoreException.
    Examples: 
      | Method          |
      | dispatch        |
      | dispatchSync    |
      | dispatchAndWait |

  Scenario: A mocked action can be dispatched again, since only its mock was dispatched.
    Given An action that is mocked by a new action each time.
    When The same action instance is dispatched twice.
    Then Both dispatches run the mock, and neither throws.

  Scenario: The already-dispatched error is not processed like an action failure.
    Given A store with an errorObserver.
    And An action that was already dispatched.
    When The same action instance is dispatched again.
    Then The StoreException is thrown to the caller.
    And The errorObserver is not called.
