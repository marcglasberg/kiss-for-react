Feature: Selecting objects that keep their identity while their values are the same

  Scenario: An unrelated state change does not render the consumer, which keeps the same object.
    Given A mounted component that selects {name, age} with useObject.
    When An action changes another field of the state.
    Then The component does not render again.
    And Its selected object is the same reference as before.

  Scenario Outline: Changing one of the selected values renders the consumer with a new object.
    Given A mounted component that selects {name, age} with useObject.
    When An action changes the [Field].
    Then The component renders again, with a new object holding the new value.
    Examples: 
      | Field |
      | name  |
      | age   |

  Scenario: When the parent renders the consumer again with an equivalent inline selector, the object is reused.
    Given A component that selects {name, age} with an inline useObject selector, and passes it to a memoized child and an effect.
    When Its parent renders it again, because of local state.
    Then The selected object is the same reference, the memoized child does not render, and the effect does not run again.

  Scenario Outline: An array selection is reused while its items are the same, in the same order.
    Given A mounted component that selects an array with useObject.
    When The state array is replaced by one that is [Change].
    Then The component [Renders] again.
    Examples: 
      | Change           | Renders |
      | equal            | false   |
      | reordered        | true    |
      | longer           | true    |
      | shorter          | true    |
      | one item changed | true    |

  Scenario Outline: A Map selection is reused while its entries are the same, in the same order.
    Given A mounted component that selects a Map with useObject.
    When The state Map is replaced by one that is [Change].
    Then The component [Renders] again.
    Examples: 
      | Change             | Renders |
      | equal              | false   |
      | reordered          | true    |
      | bigger             | true    |
      | different key      | true    |
      | different value    | true    |
      | equal object value | true    |

  Scenario Outline: A Set selection is reused while its values are the same, in the same order.
    Given A mounted component that selects a Set with useObject.
    When The state Set is replaced by one that is [Change].
    Then The component [Renders] again.
    Examples: 
      | Change          | Renders |
      | equal           | false   |
      | reordered       | true    |
      | bigger          | true    |
      | different value | true    |

  Scenario: Nested values are compared by identity, not deeply.
    Given A mounted component that selects {point} with useObject, where point is an object in the state.
    When An unrelated field changes, so the same point object is selected.
    And Then the point is replaced by a new object with the same x and y.
    Then The unrelated change does not render the component.
    And The replacement renders it, since the nested value is a different object.

  Scenario Outline: Plain objects are compared by their own keys and values, whatever their key order or prototype.
    Given A mounted component whose useObject selector builds [Object] from the state value.
    When The state value changes from [From] to [To].
    Then The component [Renders] again.
    Examples: 
      | Object                   | From    | To      | Renders |
      | null prototype           | 1       | 1       | false   |
      | null prototype           | 1       | 2       | true    |
      | reordered keys           | 1       | 1       | false   |
      | missing vs undefined key | present | missing | true    |
      | missing vs undefined key | missing | missing | false   |
      | changed prototype        | 1       | 1       | true    |

  Scenario Outline: Values that are not plain objects, arrays, Maps or Sets are compared by identity.
    Given A mounted component that selects a [Kind] from the state with useObject.
    When An unrelated field changes, and then the value is replaced by an equal-looking new instance.
    Then The unrelated change does not render the component, and the same instance is returned.
    And The replacement renders it, even though the new instance has the same fields.
    Examples: 
      | Kind           |
      | Date           |
      | class instance |
      | Map subclass   |
      | Set subclass   |

  Scenario Outline: The values inside the selected object are compared with Object.is.
    Given A mounted component that selects {v} with useObject, where v is [From].
    When v changes to [To].
    Then The component [Renders] again.
    Examples: 
      | From      | To        | Renders |
      | NaN       | NaN       | false   |
      | 0         | 0         | true    |
      | NULL      | undefined | true    |
      | undefined | undefined | false   |
      | NULL      | NULL      | false   |

  Scenario: useObject and useSelect in the same component see the same state.
    Given A mounted component that selects {name} with useObject and age with useSelect.
    When One action changes both the name and the age.
    Then The component commits the new name and the new age together.
