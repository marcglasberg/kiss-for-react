Feature: Lint: store-in-selector

  Scenario Outline: A selector that reads the state from useAllState is an error, fixed with its parameter.
    Given A component that gets the whole state with useAllState.
    And A useSelect whose selector reads that state, instead of its parameter.
    When The code is linted.
    Then There is an error in the variable.
    And The fix replaces it with the parameter.
    And The fixed code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A selector or condition that dispatches is an error.
    Given A component with {Where} that dispatches an action.
    When The code is linted.
    Then There is an error in the dispatch.
    Examples: 
      | Where                       | Code                                                                                                                                                        | Dispatch       |
      | a useSelect selector        | const items = useSelect((s: State) => { dispatch(new LoadUser()); return s.items; });                                                                       | dispatch       |
      | a useObject selector        | const items = useObject((s: State) => { store.dispatch(new LoadUser()); return [s.items]; });                                                               | store.dispatch |
      | a useDispatchWhen condition | const dispatchWhen = useDispatchWhen(); dispatchWhen(new LoadUser(), (s: State) => { dispatch(new LoadUser()); return s.ready; }, { timeoutMillis: 1000 }); | dispatch       |

  Scenario Outline: A selector that reads store.state is an error, fixed with its parameter.
    Given A store {Where}.
    And A component with a useSelect whose selector reads store.state.
    When The code is linted.
    Then There is an error in store.state, with type information or when the store is created in the same file.
    And The fix replaces it with the parameter.
    Examples: 
      | Where                      | Type information | Reported |
      | created in the same file   | true             | true     |
      | created in the same file   | false            | true     |
      | imported from another file | true             | true     |
      | imported from another file | false            | false    |

  Scenario Outline: A condition of waitCondition in an action that reads this.state is an error, fixed with its parameter.
    Given An action that waits with this.waitCondition, whose condition reads this.state.
    When The code is linted.
    Then There is an error in this.state.
    And The fix replaces it with the parameter.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A selector or condition that reads a value selected by another selector is fine.
    Given A component that selects a value with useSelect.
    And {Where} that reads that value.
    When The code is linted.
    Then There are no errors, since using a selected value, like a prop, is a common and correct pattern.
    Examples: 
      | Where                       | Type information |
      | A useSelect selector        | true             |
      | A useSelect selector        | false            |
      | A useDispatchWhen condition | true             |
      | A useDispatchWhen condition | false            |

  Scenario: A selector that reads a variable with the whole state, from another selector, is an error.
    Given A component that gets the whole state with a useSelect whose selector returns its parameter.
    And A useSelect whose selector reads that variable.
    When The code is linted.
    Then There is an error in the variable, fixed with the parameter.

  Scenario Outline: Selectors that only use their parameter, props and local values are fine.
    Given A component with selectors that use their parameter, a prop, and a local constant.
    And A useSelect from another library, whose selector reads the whole state.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: A selector without a parameter is reported without a fix.
    Given A component with a useSelect whose selector has no parameter, and reads the state from useAllState.
    When The code is linted.
    Then There is an error, but no fix.
