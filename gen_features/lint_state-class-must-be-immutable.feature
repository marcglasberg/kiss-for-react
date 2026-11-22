Feature: Lint: state-class-must-be-immutable

  Scenario Outline: A field of the state class that is not readonly is a warning, fixed by adding readonly.
    Given A state class with a field that is not readonly, a parameter property that is not readonly, and a readonly field.
    And A store of that state, in the same file.
    When The code is linted.
    Then There is a warning for each field that is not readonly.
    And The fix adds readonly, and the fixed code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: The classes that the state contains are state classes too.
    Given A state class with an array of User, a map of Address, and a Settings or null.
    And User, Address and Settings have fields that are not readonly.
    And Only an action, in the same file, says State is the state.
    When The code is linted.
    Then There are warnings in State, User, Address and Settings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, the state classes are found in other files.
    Given A state class in its own file, with a field that is not readonly.
    And A base action, in another file, that extends KissAction of that state.
    When The state file is linted, with and without type information.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since nothing in the file says it is a state class.

  Scenario Outline: With type information, the state is found from the store, with or without a type argument.
    Given A state class in its own file.
    And A store created in another file, in one of several ways.
    When The state file is linted with type information.
    Then There is a warning for its field that is not readonly.
    Examples: 
      | Store                                             |
      | createStore<State>({ initialState: new State() }) |
      | createStore({ initialState: new State() })        |
      | new Store<State>({ initialState: new State() })   |
      | null as unknown as Store<State>                   |

  Scenario: With type information, a generic base action and superclasses are followed.
    Given A generic base action, and an action that extends it with the state class.
    And The state class extends a base class, in another file, with a field that is not readonly.
    When The base class file is linted.
    Then There is a warning for the field of the base class.

  Scenario Outline: Classes that are not state classes are not reported.
    Given A class with fields that are not readonly, which is not used in the state.
    And An action, and a store with a number as the state.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Static fields and methods are not reported.
    Given A state class with a static field, a method, and a getter.
    When The code is linted.
    Then There are no warnings.

  Scenario: There is no fix when the file changes the field outside the constructor.
    Given A state class with a field that is not readonly, which a method changes.
    When The code is linted.
    Then There is a warning, but no fix, since readonly would not compile.
