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

  Scenario: An action without fields is described by its name only.
    Given An action that declares no fields of its own.
    When The action is turned into a string.
    Then Only the action name is printed, without any base class fields.

  Scenario: An action with fields prints its own fields.
    Given An action with fields "amount" and "label".
    When The action is turned into a string.
    Then Its fields are printed, and the base class fields are not.

  Scenario: The "checkInternet" and "retry" configurations are not printed.
    Given An action that sets "checkInternet", and an action that sets "retry".
    When The actions are turned into strings.
    Then The configurations are not printed.

  Scenario: The "debounce", "throttle", "fresh" and "sequential" configurations are not printed.
    Given An action that sets "debounce", an action that sets "throttle" and "removeThrottleLockOnError", an action that sets "fresh", and an action that sets "sequential".
    When The actions are turned into strings.
    Then The configurations are not printed.
