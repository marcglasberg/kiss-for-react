Feature: PersistorPrinterDecorator

  Scenario Outline: The PersistorPrinterDecorator saves a state that can't be converted to a string.
    Given A store whose persistor is decorated with the PersistorPrinterDecorator.
    And The state is <State>.
    When An action changes the state.
    Then The decorated persistor saves the new state.
    And No error is reported.
    Examples: 
      | State                               |
      | an object with no prototype         |
      | an object with a circular reference |
      | an object with a BigInt             |

  Scenario Outline: The PersistorPrinterDecorator prints the content of the states it saves.
    Given A store whose persistor is decorated with the PersistorPrinterDecorator.
    And The state is <State>.
    When An action changes the count of the state from 0 to 1.
    Then The printed message has the content of the last saved state, and of the new state.
    And It does not print "[object Object]".
    Examples: 
      | State                       |
      | a class instance            |
      | an object with no prototype |

  Scenario: The PersistorPrinterDecorator does not describe the states when logging is off.
    Given A store whose persistor is decorated with the PersistorPrinterDecorator.
    And The logger is turned off.
    When An action changes the state.
    Then The decorated persistor saves the new state.
    And The states are not converted to text.
