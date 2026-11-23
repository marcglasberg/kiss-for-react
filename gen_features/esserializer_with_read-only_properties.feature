Feature: ESSerializer with read-only properties

  Scenario: A read-only property holding a Map is read back with its entries.
    Given A class with a read-only property holding a Map, created by the constructor.
    And The Map has some entries.
    When An instance is serialized, and then deserialized.
    Then The Map read back has the same entries.
    And It has no extra fields.

  Scenario Outline: A read-only property holding a built-in value is read back with its content.
    Given A class with a read-only property holding a <Type>, created by the constructor.
    And Its content is changed.
    When An instance is serialized, and then deserialized.
    Then The <Type> read back has the same content.
    And It has no extra fields.
    Examples: 
      | Type           |
      | Set            |
      | Date           |
      | Array subclass |
      | Map subclass   |

  Scenario: A read-only property holding a class instance is read back with its fields.
    Given A class with a read-only property holding an instance of another class.
    And The fields of that instance are changed.
    When An instance is serialized, and then deserialized.
    Then The instance read back has the same fields.
    And It has no extra fields, like "type" or "value".

  Scenario Outline: A read-only property holding a primitive JSON can't represent keeps its value.
    Given A class with a read-only property holding <Value>.
    When An instance is serialized, and then deserialized.
    Then Deserializing does not throw.
    And The property read back is <Value>.
    Examples: 
      | Value     |
      | NaN       |
      | Infinity  |
      | undefined |
      | BigInt    |
