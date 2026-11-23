Feature: Lint: missing-initial-state

  Scenario Outline: A store created with the static initialState of the state class is fine.
    Given A state class with a static initialState, used by the store.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information | Store                                                    |
      | true             | createStore<State>({ initialState: State.initialState }) |
      | false            | createStore<State>({ initialState: State.initialState }) |
      | true             | new Store<State>({ initialState: State.initialState })   |
      | true             | createStore({ initialState: State.initialState })        |

  Scenario Outline: A store that creates the state with the constructor is a warning, with a suggestion to use initialState.
    Given A state class with a static initialState.
    And A store that creates the initial state with new.
    When The code is linted, with or without type information.
    Then There is a warning in the initial state.
    And The suggestion replaces it with State.initialState, and the code compiles.
    Examples: 
      | Type information | Store              |
      | true             | createStore<State> |
      | false            | createStore<State> |
      | true             | createStore        |
      | false            | new Store          |

  Scenario Outline: When initialState is a static method, the suggestion calls it.
    Given A state class with a static initialState method.
    And A store that creates the initial state with new.
    When The code is linted.
    Then The suggestion replaces it with State.initialState().
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A state class without a static initialState is a warning.
    Given A state class without a static initialState.
    And A store of that state.
    When The code is linted, with or without type information.
    Then There is a warning, with no suggestion.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: With type information, the state class is checked in another file.
    Given A state class in another file, with or without a static initialState.
    And A store that uses a value from another function as the initial state.
    When The code is linted with type information.
    Then There is a warning only when the state class has no static initialState.
    Examples: 
      | Has initialState |
      | true             |
      | false            |

  Scenario Outline: States that are not classes are not reported.
    Given A store whose state is a number, an object, or an interface.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information | Store                                                         |
      | true             | createStore<number>({ initialState: 0 })                      |
      | false            | createStore<number>({ initialState: 0 })                      |
      | true             | createStore({ initialState: { count: 0 } })                   |
      | true             | createStore<Counter>({ initialState: { count: 0 } })          |
      | false            | createStore<Counter>({ initialState: { count: 0 } })          |
      | true             | createStore<Map<string, number>>({ initialState: new Map() }) |
      | false            | createStore({ initialState: new Map<string, number>() })      |

  Scenario: Without type information, a state class from another file is only reported when the store calls its constructor.
    Given A state class imported from another file.
    And Two stores: one that calls its constructor, and one that uses a function.
    When The code is linted without type information.
    Then There is a warning only for the constructor, without a suggestion.

  Scenario: Stores created in tests are not reported.
    Given A test file that creates a store with new State().
    When The code is linted.
    Then There are no warnings.
