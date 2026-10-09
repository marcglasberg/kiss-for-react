Feature: Lint: route-in-state

  Scenario Outline: A field of a state class with the name of a route is a warning.
    Given A state class with a field named like the current route.
    When The code is linted, with or without type information.
    Then There is a warning in the field.
    Examples: 
      | Field        | Type information |
      | currentRoute | true             |
      | routeName    | true             |
      | currentPath  | true             |
      | pathname     | false            |
      | location     | false            |

  Scenario: Other names, and classes that are not state classes, are fine.
    Given A state class with a field named "path", and a class that is not part of the state with a field named "pathname".
    When The code is linted.
    Then There are no warnings.

  Scenario: Routes in state classes are not reported in tests.
    Given A test file with a state class with a field named "currentRoute".
    When The code is linted.
    Then There are no warnings.
