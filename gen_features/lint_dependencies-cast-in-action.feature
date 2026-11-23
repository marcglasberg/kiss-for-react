Feature: Lint: dependencies-cast-in-action

  Scenario Outline: Typed getters in the base action, used by the actions, are fine.
    Given A base action with typed getters that cast store.environment, store.dependencies and store.configuration.
    And An action that uses the getters.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A cast of store.environment, store.dependencies or store.configuration in an action is a warning.
    Given An action that casts one of them, with `as` or with the angle-bracket syntax.
    When The code is linted, with or without type information.
    Then There is a warning on the cast, which says to declare a typed getter in the base action.
    Examples: 
      | Type information | Cast                                    | Name          | Getter | Type         |
      | true             | this.store.dependencies as Dependencies | dependencies  | deps   | Dependencies |
      | false            | this.store.dependencies as Dependencies | dependencies  | deps   | Dependencies |
      | true             | <Dependencies>this.store.dependencies   | dependencies  | deps   | Dependencies |
      | false            | <Dependencies>this.store.dependencies   | dependencies  | deps   | Dependencies |
      | true             | this.store.environment as Environment   | environment   | env    | Environment  |
      | false            | this.store.environment as Environment   | environment   | env    | Environment  |
      | true             | this.store.configuration as Config      | configuration | config | Config       |
      | false            | this.store.configuration as Config      | configuration | config | Config       |

  Scenario: A chain of casts is one warning, on the whole chain.
    Given An action that casts store.dependencies to unknown, and then to the dependencies type.
    When The code is linted.
    Then There is one warning, on the whole chain, which suggests the final type.

  Scenario: A cast inside a callback of the action, or through a variable that holds the store, is a warning too.
    Given An action that casts store.dependencies inside an arrow function, and through a const that holds the store.
    When The code is linted, with type information.
    Then There is a warning on each cast.

  Scenario Outline: Casts in a base action (an abstract class) are not reported.
    Given An abstract action that casts store.dependencies in a getter, and in a method.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Casts outside actions, and casts of other members of the store, are not reported.
    Given A component and a function that cast store.dependencies, and an action that casts store.state and store.props.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: A cast of the dependencies of an object that is not a store is not reported.
    Given A class with its own `store` field, which is not a Kiss store, whose method casts this.store.dependencies.
    When The code is linted, with type information.
    Then There are no warnings.

  Scenario: Not reported in tests.
    Given A test file with an action that casts store.dependencies.
    When The code is linted.
    Then There are no warnings.
