Feature: ESSerializer with a Map or Set filled by its constructor

  Scenario Outline: A Map or Set subclass is read back with only its saved entries.
    Given A <Type> subclass whose constructor adds some default entries.
    And An instance had one of the default entries removed, and a new entry added.
    When The instance is serialized, and then deserialized.
    Then The <Type> read back has exactly the entries of the original one.
    And The removed default entry does not come back.
    Examples: 
      | Type |
      | Map  |
      | Set  |

  Scenario Outline: A Map or Set subclass that was emptied is read back empty.
    Given A <Type> subclass whose constructor adds some default entries.
    And An instance had all its entries removed.
    When The instance is serialized, and then deserialized.
    Then The <Type> read back is empty.
    Examples: 
      | Type |
      | Map  |
      | Set  |

  Scenario Outline: A read-only Map or Set property filled by the constructor is read back with only its saved entries.
    Given A class with a read-only property holding a <Type>, which the constructor fills with default entries.
    And One of the default entries was removed, and a new entry added.
    When An instance of the class is serialized, and then deserialized.
    Then The <Type> read back has exactly the entries of the original one.
    And The removed default entry does not come back.
    Examples: 
      | Type |
      | Map  |
      | Set  |

  Scenario: A removed default entry of a Map subclass does not come back after a restart.
    Given A ClassPersistor, and a state with a Map subclass whose constructor adds some default entries.
    And One of the default entries was removed, and a new entry added.
    When The state is saved, and then read back, as when the app restarts.
    Then The Map read back has the other default entry, and the new entry.
    And The removed default entry does not come back.
