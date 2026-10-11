Feature: dispatchAndWaitAll when a dispatch throws right away

  Scenario Outline: dispatchAndWaitAll dispatches all actions, even when one of them can't be dispatched.
    Given A list of three actions.
    And The first and the last actions are ok.
    And The dispatch of the middle action throws right away, because the middle action <Cause>.
    When The actions are dispatched with dispatchAndWaitAll, and awaited.
    Then The first and the last actions are dispatched and finish OK.
    And Only then dispatchAndWaitAll rejects, with the error thrown by the dispatch of the middle action.
    Examples: 
      | Cause                                              |
      | was already dispatched                             |
      | is mocked by a function that throws                |
      | is mocked as an action that was already dispatched |

  Scenario: dispatchAndWaitAll dispatches all actions, even when the same action appears twice in the list.
    Given A list of three actions, where the last one is the same action instance as the first.
    When The actions are dispatched with dispatchAndWaitAll, and awaited.
    Then The first and the middle actions are dispatched and finish OK, and the first runs only once.
    And Only then dispatchAndWaitAll rejects, with a StoreException saying the action was already dispatched.

  Scenario Outline: dispatchAndWaitAll rejects with the error of the first failed action in the list.
    Given A list with an ok action, an action that fails while running, and an action that can't be dispatched.
    And The action that fails while running comes <Order> the action that can't be dispatched.
    When The actions are dispatched with dispatchAndWaitAll, and awaited.
    Then All actions that can be dispatched are dispatched and finish.
    And dispatchAndWaitAll rejects with the error of the one that comes first in the list.
    Examples: 
      | Order  |
      | before |
      | after  |

  Scenario: When a dispatch of dispatchAndWaitAll throws right away, failed actions don't cause unhandled rejections.
    Given A list of three actions.
    And The first action fails while running.
    And The dispatch of the middle action throws right away, because it was already dispatched.
    And The last action is ok.
    When The actions are dispatched with dispatchAndWaitAll, and its rejection is handled.
    Then There are no unhandled promise rejections.
    And dispatchAndWaitAll rejects with the error of the first action.

  Scenario: dispatchAndWaitAll returns a rejected Promise (it doesn't throw) when the store is not ready.
    Given A store that is not ready yet, because it is still reading the persisted state.
    When Two actions are dispatched with dispatchAndWaitAll.
    Then dispatchAndWaitAll doesn't throw, but returns a Promise that rejects with a StoreException.
    And No action runs.
