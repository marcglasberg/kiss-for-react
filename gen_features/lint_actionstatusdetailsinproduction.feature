Feature: Lint: action-status-details-in-production

  Scenario Outline: The hasFinishedMethod details of an action status are reported outside tests.
    Given An action that was dispatched.
    When The app code reads {Property} of its status.
    Then There is a warning, saying to use isCompleted, isCompletedOk or isCompletedFailed.
    Examples: 
      | Property                | Type information |
      | hasFinishedMethodBefore | true             |
      | hasFinishedMethodBefore | false            |
      | hasFinishedMethodReduce | true             |
      | hasFinishedMethodReduce | false            |

  Scenario Outline: hasFinishedMethodAfter is automatically replaced with isCompleted.
    Given The status returned by dispatchAndWait.
    When The app code reads its hasFinishedMethodAfter.
    Then There is a warning.
    And The automatic fix replaces it with isCompleted, which has the same value.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Destructuring the details is reported too.
    Given An action that was dispatched.
    When The app code destructures hasFinishedMethodReduce from its status.
    Then There is a warning.

  Scenario: With type information, any ActionStatus is reported.
    Given A function that gets an ActionStatus as a parameter.
    When It reads hasFinishedMethodReduce.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since it is not known to be an action status.

  Scenario: Nothing is reported in tests, or for the isCompleted properties.
    Given Code that reads hasFinishedMethodReduce, and isCompletedOk, of an action status.
    When The code is linted.
    Then In a test file, there are no warnings.
    And Outside tests, only hasFinishedMethodReduce is reported.

  Scenario: With type information, other objects with the same property names are not reported.
    Given An object that is not an action status, with a hasFinishedMethodReduce property, kept in a status property.
    When The app code reads it.
    Then With type information, there is no warning.
