Feature: ClassPersistor with Map

  Scenario: A state with a Map is saved and read back with all its entries.
    Given A state class with a Map of strings to numbers.
    When The state is saved by the ClassPersistor, and then read back.
    Then The state read back has a Map with the same entries, in the same order.

  Scenario: An empty Map is saved and read back as an empty Map.
    Given A state class with an empty Map.
    When The state is saved by the ClassPersistor, and then read back.
    Then The state read back has an empty Map.

  Scenario: Map keys and values keep their types when read back.
    Given A Map whose keys are numbers, booleans, dates and undefined.
    And Whose values are custom classes, dates, Sets and nested Maps.
    When The state is saved by the ClassPersistor, and then read back.
    Then Each key and value is read back with its original type and content.

  Scenario: A Map inside an array or a Set is saved and read back.
    Given A state with an array of Maps, and a Set containing a Map.
    When The state is saved by the ClassPersistor, and then read back.
    Then The Maps are read back with all their entries.

  Scenario: A state with a Map survives an app restart.
    Given A store with a ClassPersistor, whose state has a Map.
    And An action that adds an entry to the Map, and is saved.
    When The app restarts, and a new store is created with the same storage.
    Then The new store state has the Map with all the saved entries.
    And The saved state is not deleted.
    And No error is logged.

  Scenario: A Map saved by an older version, without its entries, is read back as an empty Map.
    Given A saved state where the Map was written without its entries.
    When The state is read by the ClassPersistor.
    Then There is no error, and the Map is read back as an empty Map.
