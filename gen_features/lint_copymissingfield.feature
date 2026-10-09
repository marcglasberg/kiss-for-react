Feature: Lint: copy-missing-field

  Scenario Outline: A copy method with a destructured object that misses a field is a warning, with a suggestion to add it.
    Given A state class with the fields name, age and email.
    And A copy method that only accepts name and email.
    When The code is linted, with or without type information.
    Then There is a warning in the method, which says age is missing.
    And The suggestion adds age to the parameters, and uses it in the new state.
    And The code compiles, and has no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: A copy method with separate parameters that misses fields is a warning, with a suggestion to add them.
    Given A state class with the fields name, age and email.
    And A copyWith method with a name parameter, that creates the state with an object.
    When The code is linted.
    Then There is a warning, which says age and email are missing.
    And The suggestion adds them to the parameters, and the code compiles.

  Scenario: The suggestion keeps a type with one member per line.
    Given A copy method whose parameter type has one member per line.
    When The code is linted.
    Then The suggestion adds the missing field in a new line, and the code compiles.

  Scenario Outline: Copy methods that can change all fields are fine.
    Given A state class with copy methods that accept all fields, or a Partial of the state.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information | Method                                                                                                                                                           |
      | true             | copy({ name, age, email }: { name?: string, age?: number, email?: string }) {
    return new State(name ?? this.name, age ?? this.age, email ?? this.email);
  } |
      | false            | copy(name = this.name, age = this.age, email = this.email) {
    return new State(name, age, email);
  }                                                         |
      | true             | copy(changes: Partial<State>) {
    return Object.assign(new State(this.name, this.age, this.email), changes);
  }                                               |
      | true             | copy(changes: Partial<State>) {
    const s = { ...this, ...changes };
    return new State(s.name, s.age, s.email);
  }                                         |
      | false            | copy(changes: Partial<State>) {
    return new State(changes.name ?? this.name, changes.age ?? this.age, changes.email ?? this.email);
  }                       |

  Scenario: With type information, a copy with an object parameter that misses a field is a warning.
    Given A copy method whose parameter is a Pick of some fields of the state.
    When The code is linted with type information.
    Then There is a warning, with no suggestion.

  Scenario: Other methods, private fields, and classes that are not state classes are not reported.
    Given A state class with a private field, and methods named withName and copy that don't list it.
    And A class that is not part of the state, with a copy method that misses a field.
    When The code is linted.
    Then There are no warnings.

  Scenario: There is no suggestion when the field can be null.
    Given A state class with a field that can be null.
    And A copy method that doesn't list it.
    When The code is linted.
    Then There is a warning, with no suggestion, since name ?? this.name would not allow setting it to null.
