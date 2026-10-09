Feature: Lint: store-state-in-render

  Scenario Outline: Reading the state of an imported store while rendering is a warning, with a suggestion to use useSelect.
    Given A component that reads store.state.user.name in its body, from a store imported from another file.
    And The file {Imports} the State class.
    When The code is linted with type information.
    Then There is a warning in store.state.
    And The suggestion replaces the read with useSelect, typing the state parameter.
    And The code with the suggestion compiles.
    Examples: 
      | Imports         | Type               |
      | imports         | State              |
      | does not import | typeof store.state |

  Scenario Outline: Without type information, only stores known in the same file are recognized.
    Given A component that reads store.state, from a store {Where}.
    When The code is linted without type information.
    Then There is a warning only if the store is created in the same file.
    And The suggestion takes the state type from the createStore type argument.
    Examples: 
      | Where                      | Reported |
      | created in the same file   | true     |
      | imported from another file | false    |

  Scenario: Reading store.state in event handlers and effects is fine.
    Given A component that reads store.state in an event handler, an effect, and the onMount option of useDispatch.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: There is no suggestion when the read doesn't run on every render.
    Given A component that reads store.state {Where}.
    When The code is linted.
    Then There is a warning, but no suggestion, since a hook can't be called there.
    Examples: 
      | Where                   | Code                                                                |
      | inside an if            | if (props.show) console.log(store.state.user.name);                 |
      | in the right side of && | const name = props.show && store.state.user.name;                   |
      | after an early return   | if (!props.show) return null;
  const name = store.state.user.name; |
      | reading the whole state | const state = store.state;                                          |

  Scenario: The store of useStore is a store too.
    Given A component that reads useStore().store.state in its body.
    When The code is linted, with or without type information.
    Then There is a warning.
