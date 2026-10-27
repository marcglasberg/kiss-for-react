Feature: Aborting actions before their delayed work starts

  Scenario Outline: Cancelling a save during its debounce delay prevents the server request.
    Given The state contains an unsaved value, and a save action waits for a 100 millisecond debounce delay.
    And The save action has not sent a request to the server.
    When The action is cancelled with [Method] before the debounce delay ends.
    And The debounce delay ends.
    Then The action finishes as aborted, its abort signal is set, and its after method runs once.
    And The action is no longer waiting, does not count as failed, and shows no error.
    And The state remains unsaved, and no save request reaches the server.
    Examples: 
      | Method            |
      | action.abort()    |
      | store.abort(Save) |

  Scenario Outline: Cancelling a save during its internet check prevents the server request.
    Given The state contains an unsaved value, and a save action uses unlimitedRetryCheckInternet.
    And The connection check is still pending, and the save action has not sent a request.
    When The action is cancelled with [Method], and the connection check then reports that the internet is available.
    Then The action finishes as aborted, its abort signal is set, and its after method runs once.
    And The action is no longer waiting, does not count as failed, and shows no error.
    And The state remains unsaved, and no save request reaches the server.
    Examples: 
      | Method            |
      | action.abort()    |
      | store.abort(Save) |

  Scenario Outline: Cancelling a save during its before method prevents the server request.
    Given The state contains an unsaved value, and the save action waits for asynchronous preparation in before.
    And The save action has not sent a request to the server.
    When The action is cancelled with [Method], and the preparation then finishes.
    Then The action finishes as aborted, its abort signal is set, and its after method runs once.
    And The action is no longer waiting, does not count as failed, and shows no error.
    And The state remains unsaved, and no save request reaches the server.
    Examples: 
      | Method            |
      | action.abort()    |
      | store.abort(Save) |

  Scenario Outline: Cancelling a save during its debounce delay finishes it right away.
    Given The state contains an unsaved value, and a save action waits for a 100 millisecond debounce delay.
    When The action is cancelled with [Method] 10 milliseconds after it was dispatched.
    Then The action finishes as aborted right away, without waiting for the end of the debounce delay.
    And The state remains unsaved, and no save request reaches the server, also after the delay.
    Examples: 
      | Method            |
      | action.abort()    |
      | store.abort(Save) |

  Scenario: A new save runs normally after a save was cancelled during its debounce delay.
    Given A save action was cancelled during its 100 millisecond debounce delay.
    When A new save action of the same type is dispatched.
    Then The new save waits for its debounce delay, and then sends its request.
    And The state is saved, and the cancelled save sent no request.

  Scenario Outline: Cancelling a save while it waits to check the internet again prevents the server request.
    Given The state contains an unsaved value, and a save action uses unlimitedRetryCheckInternet.
    And The connection check reported no internet, so the action waits to check again.
    When The action is cancelled with [Method].
    Then The action finishes as aborted, without checking the connection again.
    And The state remains unsaved, and no save request reaches the server.
    Examples: 
      | Method            |
      | action.abort()    |
      | store.abort(Save) |
