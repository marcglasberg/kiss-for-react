Feature: Lint: stale-state-after-await

  Scenario Outline: Building the returned state from a copy of the state made before an await is an error.
    Given An action whose async reduce copies this.state to a variable, before an await.
    And After the await, it returns a function that uses the variable to build the new state.
    When The code is linted.
    Then There is an error in the use of the variable.
    And The suggestion uses the state parameter of the returned function instead.
    And The suggested code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: A copy of the state used through another local variable is also an error.
    Given An action whose async reduce copies this.state to a variable, before an await.
    And After the await, it uses the variable to create another variable, which is returned.
    When The code is linted.
    Then There is an error in the use of the first variable.
    And The suggestion uses this.state instead.

  Scenario Outline: Uses of the copy that don't build the returned state are fine.
    Given An action whose async reduce copies this.state to a variable, before an await.
    And It uses the variable {Use}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Use                                         | Code                                                                                                                                                                     |
      | in a condition, after the await             | 
    const s = this.state;
    const user = await loadUser();
    if (s.user !== null) return null;
    return (state: State) => state.copy({ user });                   |
      | inside the await                            | 
    const s = this.state;
    const user = await loadUser(s.name);
    return (state: State) => state.copy({ user });                                                   |
      | in the return, but with no await before it  | 
    const s = this.state;
    return (state: State) => s.copy({ user: 'x' });                                                                                           |
      | after an await in the other branch of an if | 
    const s = this.state;
    if (s.name === 'a') {
      await loadUser();
      return null;
    } else {
      return (state: State) => s.copy({ user: 'x' });
    } |

  Scenario: A class that is not an action is ignored.
    Given A class that doesn't extend KissAction, with the same async reduce.
    When The code is linted with type information.
    Then There are no errors.
