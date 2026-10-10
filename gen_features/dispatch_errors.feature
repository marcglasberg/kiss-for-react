Feature: Dispatch errors

  Scenario Outline: Waiting for an action that fails with an error that is not swallowed gives that error to the caller.
    Given An action that throws an error which is not a UserException.
    And There is no errorObserver.
    When The action is dispatched with dispatchAndWait, and awaited.
    Then The awaited call throws the error.
    And The after method of the action still runs.
    Examples: 
      | Action       |
      | sync         |
      | async reduce |
      | async before |

  Scenario Outline: The promise of dispatchAndWait rejects with the error, so .catch() also receives it.
    Given An action that throws an error which is not a UserException.
    And There is no errorObserver.
    When The action is dispatched with dispatchAndWait, using .catch().
    Then The .catch() receives the error.
    Examples: 
      | Action       |
      | sync         |
      | async reduce |

  Scenario Outline: Waiting for an action that fails with a UserException does not throw.
    Given An action that throws a UserException.
    And There is no errorObserver.
    When The action is dispatched with dispatchAndWait, and awaited.
    Then The awaited call does not throw, and returns the status with the error.
    Examples: 
      | Action       |
      | sync         |
      | async reduce |
      | async before |

  Scenario Outline: The errorObserver decides if waiting for a failed action throws.
    Given An action that throws an error which is not a UserException.
    And An errorObserver that returns the error, or null.
    When The action is dispatched with dispatchAndWait, and awaited.
    Then The awaited call throws only if the errorObserver returned the error.
    Examples: 
      | Action       | Observer returns |
      | sync         | the error        |
      | sync         | null             |
      | async reduce | the error        |
      | async reduce | null             |

  Scenario: Dispatching a sync action that fails with an error that is not swallowed throws.
    Given A sync action that throws an error which is not a UserException.
    When The action is dispatched with dispatch.
    Then The dispatch throws the error.

  Scenario Outline: Dispatching an action that fails with a UserException does not throw.
    Given An action that throws a UserException.
    When The action is dispatched with dispatch.
    Then The dispatch does not throw.
    Examples: 
      | Action       |
      | sync         |
      | async reduce |

  Scenario Outline: When one of the actions of dispatchAndWaitAll fails, all actions still run, and then it throws.
    Given A list of actions where one throws an error which is not a UserException.
    And The others succeed.
    When The actions are dispatched with dispatchAndWaitAll, and awaited.
    Then All actions are dispatched and finish.
    And The awaited call throws the error, only after all of them finish.
    Examples: 
      | Failing action |
      | sync           |
      | async reduce   |
