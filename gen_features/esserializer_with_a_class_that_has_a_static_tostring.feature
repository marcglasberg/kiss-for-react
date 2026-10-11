Feature: ESSerializer with a class that has a static toString

  Scenario Outline: A class with a static toString is read back by running its constructor.
    Given A class with a private field, a field initializer, and a <StaticToString>.
    And An instance whose count was changed.
    When The instance is serialized, and then deserialized.
    Then The instance read back has its private field.
    And It has the field initializer of its class.
    And It has the saved count.
    Examples: 
      | StaticToString                                  |
      | static toString of its own                      |
      | static toString inherited from its parent class |

  Scenario: A class with a static toString that looks like a class is still read back.
    Given A class whose static toString returns text starting with "class".
    When An instance is serialized, and then deserialized.
    Then The instance read back has its private field, and the saved fields.
