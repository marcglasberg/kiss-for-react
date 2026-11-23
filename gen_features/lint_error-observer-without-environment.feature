Feature: Lint: error-observer-without-environment

  Scenario Outline: A store with an errorObserver and an environment is fine, and so is a store without an errorObserver.
    Given A store created with an errorObserver and an environment, and a store created with neither.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A store with an errorObserver but no environment is a warning.
    Given A store created with an errorObserver, and no environment, with createStore or new Store.
    When The code is linted, with or without type information.
    Then There is a warning on the errorObserver, which says to pass the environment too.
    Examples: 
      | Type information | Creation           |
      | true             | createStore<State> |
      | false            | createStore<State> |
      | true             | new Store<State>   |
      | false            | new Store<State>   |

  Scenario: An errorObserver given as a shorthand property, or as a method, is a warning too.
    Given A store created with `errorObserver` as a shorthand property, and another with it as a method, without an environment.
    When The code is linted.
    Then There is a warning on each.

  Scenario: Not reported when the options are spread from another object, since the environment may be in it.
    Given A store created with options spread from a variable, and an errorObserver.
    When The code is linted.
    Then There are no warnings.

  Scenario: Not reported in tests, nor for other objects with an errorObserver.
    Given A test file that creates a store with an errorObserver and no environment.
    And A file where an object that is not a store has an errorObserver.
    When The code is linted.
    Then There are no warnings.
