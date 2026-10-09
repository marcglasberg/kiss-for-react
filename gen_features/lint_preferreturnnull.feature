Feature: Lint: prefer-return-null

  Scenario Outline: A sync reduce that returns this.state is reported, and fixed to return null.
    Given An action whose sync reduce returns this.state in some case.
    When The code is linted.
    Then That return is reported.
    And The fix returns null instead, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: An async reduce whose returned function returns the state unchanged is reported, and fixed.
    Given An action whose async reduce returns {Function}.
    When The code is linted.
    Then The returned function is reported.
    And The fix returns null instead, and the code compiles.
    Examples: 
      | Function                            |
      | (state: State) => state             |
      | () => this.state                    |
      | (state: State) => { return state; } |

  Scenario Outline: There is no fix when the declared return type of reduce does not accept null.
    Given An action whose reduce returns this.state, with a declared return type {Type}.
    When The code is linted.
    Then It is reported, {Fix}.
    Examples: 
      | Type         | Fix           | Fixed |
      | State        | without a fix | false |
      | State | null | with a fix    | true  |

  Scenario Outline: Reducers that change the state are not reported.
    Given An action whose reduce {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                       | Code                                                                           |
      | returns null                                               | 
  reduce() { return null; }                                                   |
      | returns a new state                                        | 
  reduce() { return this.state.add(1); }                                      |
      | returns a function that changes the state                  | 
  async reduce() { await save(); return (state: State) => state.add(1); }     |
      | mutates this.state, and returns it                         | 
  reduce() { this.state.items.push('a'); return this.state; }                 |
      | mutates a variable with this.state, and returns this.state | 
  reduce() { const s = this.state; (s as any).count = 2; return this.state; } |
      | returns this.state inside a nested function                | 
  reduce() { const get = () => { return this.state; }; return get().add(1); } |

  Scenario: Classes that are not Kiss actions are not reported.
    Given A class that is not a Kiss action, whose reduce returns this.state.
    When The code is linted with type information.
    Then There are no warnings.
