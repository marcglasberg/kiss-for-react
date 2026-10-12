Feature: Logging state changes of any type

  Scenario: The state changes of a number state are logged.
    Given A store whose state is the number 0, which logs state changes.
    When An action changes the state to 1.
    Then The state change is logged.

  Scenario: The state changes of a string state are logged.
    Given A store whose state is the string "a", which logs state changes.
    When An action changes the state to "ab".
    Then The state change is logged.

  Scenario: Nothing is logged when a number state does not change.
    Given A store whose state is the number 0, which logs state changes.
    When An action returns the same number.
    Then No state change is logged.

  Scenario Outline: The change of a <Type> field is described.
    Given A state with a <Type> field.
    When The field changes.
    Then The description shows the old and the new value of the field.
    Examples: 
      | Type                             | Before          | After           | Description                                                    |
      | Date                             | [object Object] | [object Object] | State d: 1970-01-01T00:00:00.000Z → 1970-01-01T00:00:01.000Z;  |
      | Set                              | [object Object] | [object Object] | State tags: Set{a, b} → Set{a, c};                             |
      | Set with a new element           | [object Object] | [object Object] | State tags: Set{a} → Set{a, b};                                |
      | Map with a changed value         | [object Object] | [object Object] | State prices[AAPL]: 200 → 210;                                 |
      | Map with a new key               | [object Object] | [object Object] | State prices[AAPL]: undefined → 200;                           |
      | Map with a removed key           | [object Object] | [object Object] | State prices[AAPL]: 200 → undefined;                           |
      | Map with a changed nested object | [object Object] | [object Object] | State users[u1].name: Ann → Bob;                               |

  Scenario Outline: A <Type> field replaced by an equal one is not described.
    Given A state with a <Type> field.
    When The field is replaced by a new object with the same contents.
    Then The description is empty.
    Examples: 
      | Type | Before          | After           |
      | Date | [object Object] | [object Object] |
      | Set  | [object Object] | [object Object] |
      | Map  | [object Object] | [object Object] |

  Scenario Outline: A state that is itself a <Type> is described when it changes.
    Given A state that is a <Type>.
    When The state changes.
    Then The description shows the old and the new state.
    Examples: 
      | Type   | Before                                                         | After                                                          | Description                                                  |
      | number | 1                                                              | 2                                                              | State: 1 → 2;                                                |
      | Date   | Wed Dec 31 1969 21:00:00 GMT-0300 (Horário Padrão de Brasília) | Wed Dec 31 1969 21:00:01 GMT-0300 (Horário Padrão de Brasília) | State: 1970-01-01T00:00:00.000Z → 1970-01-01T00:00:01.000Z;  |
      | Map    | [object Map]                                                   | [object Map]                                                   | State [a]: 1 → 2;                                            |

  Scenario: A field that changes from a value to null, or to another type, is described.
    Given A state with a field that is an object, and another that is a number.
    When The object field becomes null, and the number field becomes a string.
    Then The description shows both changes.
