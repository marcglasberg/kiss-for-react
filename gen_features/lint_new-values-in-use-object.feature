Feature: Lint: new-values-in-use-object

  Scenario Outline: A useObject selector that creates new values inside the object is a warning.
    Given A component with a useObject selector that returns {Value} inside the object.
    When The code is linted.
    Then There is a warning in that value.
    Examples: 
      | Value                       | Code                              | Kind            | Type information |
      | a filtered array            | state.items.filter((i) => i.done) | array or object | true             |
      | a filtered array            | state.items.filter((i) => i.done) | array or object | false            |
      | a mapped array              | state.items.map((i) => i.text)    | array or object | true             |
      | a copy of an object         | { ...state.items[0] }             | object          | true             |
      | an array literal            | [state.name, state.filter]        | array           | false            |
      | a function                  | () => state.name                  | function        | true             |
      | a new empty array when null | state.tags ?? []                  | array           | true             |
      | the keys of an object       | Object.keys(state)                | array or object | false            |

  Scenario Outline: New values in a returned array, or in a const of the selector, are warnings too.
    Given A component with a useObject selector that {How}.
    When The code is linted.
    Then There is a warning.
    Examples: 
      | How                                                      | Selector                                                                               | Text                              |
      | returns an array with a filtered array                   | (state: State) => [state.name, state.items.filter((i) => i.done)]                      | state.items.filter((i) => i.done) |
      | returns an object with a const that has a filtered array | (state: State) => { const done = state.items.filter((i) => i.done); return { done }; } | done                              |

  Scenario Outline: New values inside a Map or a Set returned by the selector are warnings too.
    Given A component with a useObject selector that returns {How}.
    When The code is linted.
    Then There is a warning in that value.
    Examples: 
      | How                                    | Selector                                                                                                        | Text                              | Container |
      | a Map with a filtered array as a value | (state: State) => new Map<string, unknown>([['name', state.name], ['done', state.items.filter((i) => i.done)]]) | state.items.filter((i) => i.done) | Map       |
      | a Map with a new object as a key       | (state: State) => new Map([[{ id: 1 }, state.name]])                                                            | { id: 1 }                         | Map       |
      | a Set with a function                  | (state: State) => new Set([state.name, () => state.name])                                                       | () => state.name                  | Set       |
      | a Set with an array literal            | (state: State) => new Set([state.filter, [state.name]])                                                         | [state.name]                      | Set       |

  Scenario: A useObject selector that returns a Map or a Set with parts of the state is fine.
    Given A component with useObject selectors that return a Map and a Set, with parts of the state and primitive values.
    And A Set created from a mapped array, whose items are strings.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: A useObject selector that returns parts of the state, or primitive values, is fine.
    Given A component with useObject selectors that return parts of the state, and computed numbers, strings and booleans.
    And A selector that returns a filtered array directly, which useObject compares item by item.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, methods that return strings are not reported.
    Given A component with a useObject selector that returns state.name.slice(0, 3) inside the object.
    When The code is linted.
    Then There are no warnings, with or without type information.
    And With type information, state.items.slice(0, 3) is a warning.

  Scenario: A useObject that does not come from Kiss is ignored.
    Given A component that uses a useObject from another library, with a selector that creates a new array.
    When The code is linted.
    Then There are no warnings.
