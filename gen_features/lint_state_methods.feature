Feature: Lint: state methods

  Scenario Outline: State methods cannot change the existing instance or its nested objects.
    Given A state class identified by a decorator or a store, with methods that mutate its fields.
    When The mutation rule checks the methods.
    Then Assignments, increments, deletions and Object.assign on the existing state are errors.
    Examples: 
      | Types | Annotated |
      | true  | true      |
      | false | true      |
      | true  | false     |
      | false | false     |

  Scenario: State methods cannot mutate existing collections through aliases or callbacks.
    Given A state with arrays, a map, a set, and aliases to its fields.
    When The mutation rule checks the code with type information.
    Then Mutating collection calls and nested callback assignments are errors.

  Scenario Outline: Constructors, new objects, queries, static methods and unrelated classes remain usable.
    Given State methods that query state, create objects, or return this without modifying state.
    When The mutation rule checks the code.
    Then There are no errors for these operations or for a custom immutable add method.
    Examples: 
      | Types |
      | true  |
      | false |

  Scenario Outline: State instance methods and function fields must be synchronous.
    Given A state class with async methods, an async generator, and an async arrow field.
    When The synchronous-method rule checks the class.
    Then Each asynchronous member gets one warning, without a behavior-changing fix.
    Examples: 
      | Types |
      | true  |
      | false |

  Scenario: Type information finds promises returned without the async keyword.
    Given State methods, a getter, and a function field returning promises, including a union and a thenable.
    When The rule checks the class with and without type information.
    Then Type information reports every promise-returning member, while the syntax-only check reports none.

  Scenario: Synchronous state methods and static or unrelated asynchronous methods are accepted.
    Given A state with queries, a method returning a new instance, a no-op, and a nested async function.
    When The synchronous-method rule checks the classes.
    Then There are no warnings and the recommended severities are error for mutation and warning for async methods.

  Scenario: Both rules check nested state classes declared in another file.
    Given A nested state class and a store in separate files, without decorators.
    When The nested class is linted with type information.
    Then Its mutation and asynchronous method are reported.
