Feature: Misconfigured actions are not dispatched

  Scenario Outline: A misconfigured action throws when dispatched, and is not dispatched at all.
    Given An action that is misconfigured.
    And The store has an actionObserver.
    When The action is dispatched.
    Then The dispatch throws a StoreException (or dispatchAndWait rejects with it).
    And The action is not marked as dispatched, and is not completed.
    And None of its before, reduce and after methods run.
    And The actionObserver is not called.
    And The action is not in progress, and the state does not change.
    Examples: 
      | Misconfiguration                        | Dispatch        |
      | an invalid retry option                 | dispatch        |
      | an invalid retry option                 | dispatchAndWait |
      | an invalid retry option                 | dispatchSync    |
      | an optimistic command with nonReentrant | dispatch        |
      | an optimistic command with nonReentrant | dispatchAndWait |
      | an optimistic command with nonReentrant | dispatchSync    |

  Scenario: After a misconfigured action throws, it can be fixed and dispatched again.
    Given An action with an invalid retry option.
    And The action was dispatched, and threw a StoreException.
    When Its retry option is fixed, and the same action is dispatched again.
    Then It runs, and changes the state.
    And Its after method runs once.
