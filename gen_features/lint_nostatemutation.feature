Feature: Lint: no-state-mutation

  Scenario Outline: Changing this.state in place in an action is an error.
    Given An action whose reducer changes this.state in place.
    When The code is linted, with or without type information.
    Then There is an error.
    Examples: 
      | Type information | Code                                     | Error                                   |
      | true             | this.state.count = 5;                    | this.state.count                        |
      | false            | this.state.count += 5;                   | this.state.count                        |
      | true             | this.state.count++;                      | this.state.count++                      |
      | false            | this.state.items[0].done = true;         | this.state.items[0].done                |
      | true             | delete (this.state as any).count;        | delete (this.state as any).count        |
      | false            | Object.assign(this.state, { count: 1 }); | Object.assign(this.state, { count: 1 }) |
      | true             | this.state.items.push(new Item('a'));    | this.state.items.push                   |
      | false            | this.state.items.splice(0, 1);           | this.state.items.splice                 |
      | true             | this.state.tags.add('a');                | this.state.tags.add                     |
      | true             | this.state.byId.delete('a');             | this.state.byId.delete                  |
      | true             | this.initialState.items.pop();           | this.initialState.items.pop             |

  Scenario: The message of a mutating method names it, and suggests the method that returns a new array.
    Given A selector that sorts the state array in place, and uses the result.
    When The code is linted with type information.
    Then There is an error that says to use toSorted.
    And The suggestion replaces sort with toSorted.

  Scenario Outline: Changing the state parameter of selectors, conditions and update functions is an error.
    Given A function that gets the state, and changes it in place.
    When The code is linted, with or without type information.
    Then There is an error.
    Examples: 
      | Type information | Code                                                                                                        |
      | true             | useSelect((state: State) => state.items.reverse())                                                          |
      | false            | useObject((state: State) => ({ items: state.items.sort() }))                                                |
      | true             | store.waitCondition((state) => { state.count = 1; return true; }, { timeoutMillis: 100 })                   |
      | false            | store.dispatchWhen(new Increment(), (state) => state.items.push(new Item('a')) > 0, { timeoutMillis: 100 }) |
      | true             | dispatchWhen(new Increment(), (state: State) => { state.count++; return true; }, { timeoutMillis: 100 })    |
      | false            | store.dispatch(new UpdateStateAction((state: State) => { state.count = 0; return state; }))                 |
      | true             | useSelect(({ items }: State) => items.pop())                                                                |

  Scenario Outline: Changing the state parameter of the function returned by an async reducer is an error.
    Given An async reducer that returns a function that changes its state parameter.
    When The code is linted, with or without type information.
    Then There is an error.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: With type information, variables that hold parts of the state are followed.
    Given An action that reads parts of the state into variables, and changes them.
    When The code is linted with and without type information.
    Then With type information, there is an error.
    And Without type information, there is no error.
    Examples: 
      | Code                                                               |
      | const items = this.state.items; items.push(new Item('a'));         |
      | const { items } = this.state; items.length = 0;                    |
      | for (const item of this.state.items) item.done = true;             |
      | this.state.items.forEach((item) => { item.done = true; });         |
      | const item = this.state.byId.get('a'); if (item) item.done = true; |
      | this.state.items.at(0)!.done = true;                               |

  Scenario Outline: Changing the state from useAllState, or from useSelect, in a component is an error.
    Given A component that changes the state it got from useAllState or useSelect.
    When The code is linted, with or without type information.
    Then There is an error.
    Examples: 
      | Type information | Hook                                                    | Code                             |
      | true             | const state = useAllState<State>();                     | state.items.push(new Item(text)) |
      | false            | const items = useSelect((state: State) => state.items); | items.push(new Item(text))       |

  Scenario: With type information, changing store.state is an error.
    Given A function that pushes to store.state.items.
    When The code is linted with type information.
    Then There is an error.

  Scenario Outline: Creating a new state, and changing new objects, is fine.
    Given An action that creates new arrays and objects, changes them, and returns a new state.
    And It calls methods of the state class named add and set, which return a new state.
    And It sorts a copy of the state array.
    When The code is linted, with or without type information.
    Then There are no errors.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, methods of classes that are not arrays, maps or sets are fine.
    Given A state class with a list class, whose push and sort methods return a new list.
    And An action that calls them on the state.
    When The code is linted with type information.
    Then There are no errors.

  Scenario: this.state outside actions is not reported.
    Given A class that is not an action, which changes its own state field.
    When The code is linted.
    Then There are no errors.

  Scenario Outline: Without type information, the methods of maps and sets are not reported.
    Given An action that calls add on a set of the state, and add on the state itself.
    When The code is linted with and without type information.
    Then With type information, only the add of the set is an error.
    And Without type information, there are no errors, since add may be a method that returns a new state.
    Examples: 
      | Type information |
      | true             |
      | false            |
