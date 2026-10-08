Feature: useIsWaiting with action subclasses

  Scenario: Waiting for a base class re-renders when a subclass action starts and finishes.
    Given A component that waits for a base action class.
    When An action of a subclass of that base class is dispatched, and later finishes.
    Then The component re-renders showing it is waiting.
    And The component re-renders again showing it is no longer waiting.

  Scenario: Waiting for a class re-renders when an action of a deeper subclass starts.
    Given A component that waits for an action class.
    When An action of a subclass of a subclass of that class is dispatched.
    Then The component re-renders showing it is waiting.

  Scenario: Waiting for an exact class still re-renders when that class starts.
    Given A component that waits for an action class.
    When An action of that exact class is dispatched, and later finishes.
    Then The component shows it is waiting, and then that it is no longer waiting.

  Scenario: Waiting for a subclass does not show waiting when only the base class is in progress.
    Given A component that waits for a subclass.
    When An action of the parent class (not the subclass) is dispatched.
    Then The component keeps showing it is not waiting.
