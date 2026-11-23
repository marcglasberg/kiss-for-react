Feature: ESSerializer with getter-only properties

  Scenario Outline: A saved field that is now a getter-only property is ignored when read.
    Given A class that had a "total" field in an old version of the app.
    And In the new version, "total" is a getter-only property, defined in the <Where>.
    When A state saved by the old version is deserialized.
    Then Deserializing does not throw.
    And The getter returns the value computed from the other fields.
    And The other fields are read back.
    Examples: 
      | Where       |
      | class       |
      | constructor |

  Scenario: A saved field that is now a property with a setter keeps the value the constructor gave it.
    Given A class that had a "discount" field in an old version of the app.
    And In the new version, "discount" is a property with a getter and a setter, defined in the class.
    When A state saved by the old version is deserialized.
    Then Deserializing does not throw.
    And The setter is not called, so "discount" keeps the value the constructor gave it.
    And The other fields are read back.

  Scenario: A nested saved field that is now a getter-only property is ignored when read.
    Given A class with a read-only property holding an object, created by the constructor.
    And That object had a "total" field in an old version of the app, which is now a getter-only property.
    When A state saved by the old version is deserialized.
    Then Deserializing does not throw.
    And The getter of the nested object returns the value computed from its other fields.

  Scenario: The ClassPersistor reads a state saved before a field became a getter, and keeps it.
    Given A state saved by an old version of the app, where "total" was a field.
    And In the new version, "total" is a getter-only property.
    When A store with a ClassPersistor starts, and reads that saved state.
    Then No error is reported.
    And The store state is the saved state.
    And The saved state is not deleted.
