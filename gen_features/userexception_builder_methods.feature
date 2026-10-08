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
