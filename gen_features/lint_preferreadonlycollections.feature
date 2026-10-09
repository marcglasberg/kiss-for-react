Feature: Lint: prefer-readonly-collections

  Scenario Outline: A field of a state class with a mutable collection type is a warning, with a suggestion to make it readonly.
    Given A state class with a field of a mutable collection type.
    When The code is linted.
    Then There is a warning in the type.
    And The suggestion changes it to the readonly type, and the code still compiles.
    Examples: 
      | Field                                          | Readonly                  |
      | readonly users: User[] = [];                   | readonly User[]           |
      | readonly users: Array<User> = [];              | ReadonlyArray<User>       |
      | readonly users: Map<string, User> = new Map(); | ReadonlyMap<string, User> |
      | readonly ids: Set<string> = new Set();         | ReadonlySet<string>       |
      | readonly users: User[] | null = null;          | readonly User[]           |
      | readonly users: (User | null)[] = [];          | readonly (User | null)[]  |

  Scenario: Readonly collections, and other types, are fine.
    Given A state class with readonly collections, a string, and a user class.
    When The code is linted.
    Then There are no warnings.

  Scenario: Only the type of the field is checked, not its type arguments.
    Given A state class with a readonly map whose values are mutable arrays.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: Classes that are not state classes are not reported.
    Given A class with a mutable array, which is not part of the state.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A class named like a collection, but declared by the user, is not reported.
    Given A state class with a field of a user class named Set.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Without type information, a state class in the same file is checked.
    Given A state class with a mutable array, and a store of that state in the same file.
    When The code is linted without type information.
    Then There is a warning.

  Scenario: Mutable collections in state classes are not reported in tests.
    Given A test file with a state class with a mutable array.
    When The code is linted.
    Then There are no warnings.
