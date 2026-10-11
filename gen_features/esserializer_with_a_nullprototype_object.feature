Feature: ESSerializer with a null-prototype object

  Scenario: A null-prototype object is read back with no prototype.
    Given A dictionary of word counts with no prototype, made with Object.create(null).
    And It is a field of a plain object.
    When The plain object is serialized, and then deserialized.
    Then The dictionary read back has no prototype.
    And It has the same word counts.
    And It has no inherited keys, like "constructor" or "toString".

  Scenario: A top-level null-prototype object is read back with no prototype.
    Given A dictionary with no prototype, made with Object.create(null).
    When The dictionary itself is serialized, and then deserialized.
    Then The dictionary read back has no prototype, and the same entries.

  Scenario: A null-prototype object inside a class keeps its nested values.
    Given A class with a field holding a dictionary with no prototype.
    And The dictionary has a Date, a Map, a class instance, and a nested dictionary with no prototype.
    When An instance of the class is serialized, and then deserialized.
    Then The dictionary read back has no prototype.
    And Its nested values are read back with their types.

  Scenario: A null-prototype object with a "__proto__" key keeps it as a normal key.
    Given A dictionary with no prototype, with the keys "__proto__" and "a".
    When The dictionary is serialized, and then deserialized.
    Then The dictionary read back has no prototype.
    And "__proto__" is a normal key, with its value.

  Scenario: A plain object is still read back with the Object prototype.
    Given A plain object, made with {}.
    When It is serialized, and then deserialized.
    Then The object read back has the Object prototype.
    And The saved JSON has no type for it.
