Feature: Lint: avoid-use-all-state

  Scenario Outline: useAllState is a warning, fixed with one useSelect for each path the component reads.
    Given A component that gets the whole state with useAllState.
    And It reads state.user.name, state.user.age (twice) and state.items.
    When The code is linted.
    Then There is a warning in useAllState.
    And The fix replaces it with one useSelect for each path, named after the path.
    And The fix replaces useAllState with useSelect in the import, since it is no longer used.
    And The fixed code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A useSelect that selects the whole state is a warning too.
    Given A component that uses {Hook} with a selector that returns the state itself.
    When The code is linted.
    Then There is a warning, saying it selects the whole state.
    And The fix replaces it with one useSelect for each path, and keeps the import.
    Examples: 
      | Hook        |
      | useSelect   |
      | useSelector |

  Scenario: Destructuring the state is fixed with one useSelect for each property.
    Given A component that destructures user and items from useAllState.
    When The code is linted and fixed.
    Then Each property gets its own useSelect, with the same variable name.
    And The fixed code compiles.

  Scenario Outline: There is no fix when the component uses the whole state.
    Given A component that uses useAllState, and {Use}.
    When The code is linted.
    Then There is a warning, but no fix.
    Examples: 
      | Use                                            | Code                                       |
      | passes the state to a function                 | console.log(state);                        |
      | reads a property with brackets                 | console.log(state['user']);                |
      | already has a variable with the name of a path | const userName = 1; console.log(userName); |
      | calls a method of the state                    | console.log(state.toString());             |

  Scenario Outline: The fix gets the state type from the code.
    Given A component that uses useAllState, with the state type {Where}.
    When The code is linted and fixed.
    Then The fix uses the state type in the selectors.
    Examples: 
      | Where                            | Code                                  | Fixed |
      | as a type argument               | const state = useAllState<State>();   | true  |
      | in the type of the variable      | const state: State = useAllState();   | true  |
      | only in a cast (there is no fix) | const state = useAllState() as State; | false |

  Scenario: A state that is a number is not reported, with type information.
    Given A component that uses useAllState of a store whose state is a number.
    When The code is linted.
    Then With type information, there is no warning, since the component needs the whole state.
    And Without type information, there is a warning.

  Scenario Outline: useAllState is not reported in tests, or when it does not come from Kiss.
    Given A {Where}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Where                                                  | File                        | Import                                        |
      | test file that uses useAllState                        | __tests__/UserCard.test.tsx | import { useAllState } from 'kiss-for-react'; |
      | component that uses a useAllState from another library | file.tsx                    | declare function useAllState<T>(): T;         |
