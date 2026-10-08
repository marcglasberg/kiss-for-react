Feature: Action toString

  Scenario Outline: An action with a field that cannot be turned into JSON can be dispatched.
    Given An action with a circular, BigInt, or unserializable field.
    And Logging is turned off.
    When The action is dispatched.
    Then The dispatch does not throw.
    And The action runs and changes the state.
    Examples: 
      | Field           |
      | circular        |
      | bigint          |
      | throwing toJSON |

  Scenario Outline: An action with a field that cannot be turned into JSON is still logged.
    Given An action with a circular, BigInt, or unserializable field.
    And Logging is turned on.
    When The action is dispatched.
    Then The dispatch does not throw.
    And The action is logged with its class name.
    Examples: 
      | Field           |
      | circular        |
      | bigint          |
      | throwing toJSON |

  Scenario: The description of an action shows fields that cannot be turned into JSON.
    Given An action with a BigInt field.
    When The action is turned into a string.
    Then The BigInt value is shown.

  Scenario: The description of an action with normal fields is unchanged.
    Given An action with a number field.
    When The action is turned into a string.
    Then The field is shown as JSON.
