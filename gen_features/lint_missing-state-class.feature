Feature: Lint: missing-state-class

  Scenario Outline: Every state class needs its own annotation when the rule is enabled.
    Given A store with nested state classes, a base class, and an unrelated class.
    When The code is linted with the optional rule enabled.
    Then The root, nested classes and base class are reported, but the unrelated class is not.
    Examples: 
      | Types |
      | true  |
      | false |

  Scenario Outline: The decorator is recognized by its Kiss import, including aliases and namespace imports.
    Given An annotated class with no store and an unannotated nested class.
    When The state rules and the optional annotation rule check the classes.
    Then The annotated class is checked for immutability and only its nested class needs an annotation.
    Examples: 
      | Import                                                | Decorator       | Types |
      | import { stateClass } from 'kiss-for-react';          | stateClass      | true  |
      | import { stateClass as state } from 'kiss-for-react'; | state           | true  |
      | import * as kiss from 'kiss-for-react';               | kiss.stateClass | true  |
      | import { stateClass as state } from 'kiss-for-react'; | state           | false |
      | import * as kiss from 'kiss-for-react';               | kiss.stateClass | false |

  Scenario: Nested state classes are found across files without annotations.
    Given A store, root state, user and address in separate files, and a cyclic state reference.
    When The address file is linted with and without type information.
    Then Only the check with type information reports the missing annotation.

  Scenario: An annotated root in another file makes its nested classes state classes.
    Given An annotated state with no store, and its user class in another file.
    When The user file is linted with type information.
    Then The user is checked for immutability and needs its own annotation.

  Scenario Outline: A different decorator with the same name does not mark a Kiss state class.
    Given A local decorator named stateClass and a class used by a Kiss action.
    When The optional annotation rule checks the class.
    Then The rule reports the missing Kiss annotation.
    Examples: 
      | Types |
      | true  |
      | false |

  Scenario: Each subclass needs its own annotation and the rule is disabled by default.
    Given An annotated base class and an unannotated subclass used by a store.
    When The optional rule checks the classes and the recommended configuration is inspected.
    Then Only the subclass is reported, and the recommended configuration does not enable the rule.

  Scenario Outline: Fully annotated state and unrelated classes need no further annotations.
    Given An annotated root and nested class, a Date from the standard library, and a service outside state.
    When The optional rule checks the classes.
    Then There are no warnings or TypeScript errors.
    Examples: 
      | Types |
      | true  |
      | false |

  Scenario: Type information recognizes the Kiss decorator re-exported from another file.
    Given A class annotated with a re-exported Kiss decorator and no store.
    When The class is linted with type information.
    Then The annotation is accepted and the state rules check the class.
