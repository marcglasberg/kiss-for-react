Feature: useObject with values that are not plain objects

  Scenario Outline: useObject rebuilds the component when the selected value is replaced by a different one, which is not a plain object.
    Given A component that uses useObject to select a value from the state.
    And The value is not a plain object or an array.
    When An action replaces that value with a different one, of the same type.
    Then The component rebuilds.
    And useObject returns the new value.
    Examples: 
      | Value                                    |
      | Map                                      |
      | Set                                      |
      | Date                                     |
      | Class instance with only #private fields |

  Scenario Outline: useObject does not rebuild the component while the selected value that is not a plain object is the same.
    Given A component that uses useObject to select a value from the state.
    And The value is not a plain object or an array.
    When An action changes another part of the state.
    Then The component does not rebuild.
    Examples: 
      | Value                                    |
      | Map                                      |
      | Set                                      |
      | Date                                     |
      | Class instance with only #private fields |

  Scenario: useObject still compares objects without a prototype value by value.
    Given A component that uses useObject to select an object created with Object.create(null).
    When An action changes another part of the state.
    Then The component does not rebuild.

  Scenario Outline: useObject compares a Map or a Set entry by entry.
    Given A component that uses useObject with a selector that creates a new Map or Set each time, with some parts of the state.
    When An action changes another part of the state.
    And Then an action changes one of the selected parts.
    Then The component only rebuilds when the selected part changes, with the new value.
    Examples: 
      | Collection |
      | Map        |
      | Set        |

  Scenario Outline: useObject rebuilds the component when a Map or a Set has the same entries in a different order.
    Given A component that uses useObject to select a Map or a Set from the state.
    When An action replaces it with one that has the same entries, in a different order.
    Then The component rebuilds, with the entries in the new order.
    Examples: 
      | Collection |
      | Map        |
      | Set        |

  Scenario Outline: useObject compares other objects by identity, even when they have the same values.
    Given A component that uses useObject with a selector that creates a new object each time, with the same values.
    And The object is not a plain object, an array, a Map or a Set.
    When An action changes another part of the state.
    Then The component rebuilds, like it would with useSelect.
    Examples: 
      | Object          |
      | Class instance  |
      | Date            |
      | Subclass of Map |

  Scenario: The useObject type only accepts selectors that return a plain object, an array, a Map or a Set.
    Given Components with useObject selectors that return different kinds of values.
    When The code is type-checked.
    Then A plain object, an array, a Map, a Set, or null or undefined, compiles.
    And A class instance, a Date, a string or a function does not compile.
