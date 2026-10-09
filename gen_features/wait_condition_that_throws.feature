Feature: Wait condition that throws

  Scenario: A waitCondition whose condition throws rejects its own promise, without affecting the action.
    Given A pending waitCondition whose condition throws when n becomes 1.
    And Another pending waitCondition that waits for n to be 1.
    When An action changes n to 1.
    Then The action completes ok, and dispatch does not throw.
    And The throwing waitCondition rejects with the condition's error.
    And The other waitCondition still resolves with the action.

  Scenario: A waitActionCondition whose condition throws rejects its own promise, without affecting the action.
    Given A pending waitActionCondition whose condition throws when an action is dispatched.
    When An action is dispatched.
    Then The action completes ok.
    And The waitActionCondition rejects with the condition's error.
