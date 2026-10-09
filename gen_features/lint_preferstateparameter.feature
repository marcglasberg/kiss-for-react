Feature: Lint: prefer-state-parameter

  Scenario Outline: Using this.state in the function returned by an async reducer is reported.
    Given An action whose async reduce returns a function with a state parameter.
    And The function uses this.state instead of its parameter.
    When The code is linted.
    Then Each this.state is reported.
    And The fix replaces them with the parameter.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: If the returned function has no parameter, the fix adds it, with its type.
    Given An action whose async reduce returns a function without parameters, which uses this.state.
    When The code is linted with type information.
    Then this.state is reported.
    And The fix adds a state parameter with the state type, and uses it.
    And The fixed code compiles.

  Scenario: Without type information, a returned function with no parameter is reported, but not fixed.
    Given An action whose async reduce returns a function without parameters, which uses this.state.
    When The code is linted without type information.
    Then this.state is reported, but there is no fix (the parameter would need a type).

  Scenario Outline: this.state outside the returned function, or in a sync reducer, is fine.
    Given An action that uses this.state {Where}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Where                                            | Code                                                                                                                                       |
      | in an async reducer, before returning a function | 
  async reduce() {
    const count = this.state.count;
    const n = await load();
    return (state: State) => state.add(n + count);
  } |
      | in a sync reducer                                | 
  reduce() {
    return this.state.add(1);
  }                                                                                            |
