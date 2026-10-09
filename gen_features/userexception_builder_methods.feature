Feature: UserException builder methods

  Scenario Outline: Builder methods keep the callbacks and props of the exception.
    Given A UserException with onOk and onCancel callbacks, and some props.
    When A builder method is called on it.
    Then The new exception still calls the same callbacks.
    And The new exception still has the same props.
    Examples: 
      | Builder       |
      | withTitle     |
      | withMessage   |
      | withHardCause |
      | withDialog    |
      | noDialog      |
      | withErrorText |
      | addProps      |
      | addCallbacks  |

  Scenario: Builder methods change only their own field.
    Given A UserException with message, title, hard cause, error text, dialog turned on, callbacks and props.
    When Each builder method is called on it.
    Then Only the field of that builder changes, and all the other fields are kept.

  Scenario Outline: Builder methods keep the subclass of the exception.
    Given A subclass of UserException, with its own field and method.
    And An exception of that subclass.
    When A builder method is called on it.
    Then The new exception is of the same subclass.
    And The new exception keeps the field, the method and the name of the subclass.
    Examples: 
      | Builder       |
      | withTitle     |
      | withMessage   |
      | withHardCause |
      | withDialog    |
      | noDialog      |
      | withErrorText |
      | addProps      |
      | addCallbacks  |

  Scenario: Builder methods work on a subclass whose constructor takes different parameters.
    Given A subclass of UserException whose constructor always uses a fixed message.
    And An exception of that subclass.
    When withMessage and withTitle are called on it.
    Then The new exception has the new message and title, and is of the same subclass.
    And The constructor of the subclass is not called again.
