Feature: ESSerializer with a constructor key

  Scenario Outline: A plain object with a constructor key is serialized and read back.
    Given A plain object with a "constructor" key holding <Constructor>, which is not a function.
    When The object is serialized, and then deserialized.
    Then The object read back is equal to the original one.
    Examples: 
      | Constructor |
      | 1           |
      | "text"      |
      | true        |
      | null        |
      | {"a":1}     |
      | [1,2]       |

  Scenario: A dictionary keyed by user text, inside a class, may have a constructor key.
    Given A class with a dictionary of word counts.
    And One of the words is "constructor".
    When The class instance is serialized, and then deserialized.
    Then The instance read back has the same word counts.

  Scenario: The ClassPersistor saves a state with a constructor key, and keeps saving.
    Given A store with a ClassPersistor, whose state has a dictionary of word counts.
    When The word "constructor" is counted.
    And Then the word "the" is counted.
    Then Both state changes are saved, and are read back.
    And No error is reported.

  Scenario: A function-style class whose instances have their own constructor property is kept.
    Given A function-style class, like Big from big.js, whose prototype is a plain object.
    And Its instances have their own "constructor" property, pointing to the class.
    When An instance is serialized, and then deserialized.
    Then The value read back is an instance of that class, with the same fields.
