Feature: ESSerializer with an error with an empty message

  Scenario Outline: An error with an empty message is read back with an empty message.
    Given An error of type <Type>, with an empty message.
    When The error is serialized, and then deserialized.
    Then The error read back is of type <Type>.
    And Its message is empty.
    And The message is still not an enumerable property.
    Examples: 
      | Type                                                               |
      | Error                                                              |
      | TypeError                                                          |
      | an Error subclass whose constructor takes the message              |
      | an Error subclass whose constructor takes the message and a status |
      | an Error subclass whose constructor has a default message          |

  Scenario: An error subclass with an empty message keeps its other fields.
    Given An error subclass whose constructor takes the message and a status.
    And An instance with an empty message, and status 404.
    When The error is serialized, and then deserialized.
    Then The error read back has an empty message, and status 404.

  Scenario: An error with a message is still read back with that message.
    Given An error subclass whose constructor takes the message.
    And An instance with the message "Oops".
    When The error is serialized, and then deserialized.
    Then The error read back has the message "Oops".
