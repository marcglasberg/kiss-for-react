Feature: Actions that throw null or undefined

  Scenario Outline: An action that throws null or undefined fails.
    Given An action whose [Method] throws [Value].
    When The action is dispatched with dispatchAndWait.
    Then The action fails with an Error that explains the problem.
    And The action status is "completed failed", not "completed OK".
    And The state is not changed.
    Examples: 
      | Value     | Method               |
      | null      | sync reduce          |
      | undefined | sync reduce          |
      | null      | async reduce         |
      | undefined | async reduce         |
      | undefined | async reduce rejects |
      | null      | sync before          |
      | undefined | sync before          |
      | null      | async before         |
      | undefined | async before         |

  Scenario: A SYNC action that throws null fails when dispatched with dispatch.
    Given A SYNC action whose reducer throws null.
    When The action is dispatched with dispatch.
    Then dispatch throws an Error that explains the problem.
    And The action status is "completed failed".

  Scenario Outline: The stateObserver gets a non-null error when the action throws null or undefined.
    Given A store with a stateObserver.
    And An action whose reducer throws [Value].
    When The action is dispatched.
    Then The stateObserver is called with an Error, and not with null or undefined.
    Examples: 
      | Value     |
      | null      |
      | undefined |

  Scenario Outline: wrapError and the errorObserver get an Error when the action throws null or undefined.
    Given A store with an errorObserver.
    And An action with a wrapError, whose reducer throws [Value].
    When The action is dispatched.
    Then wrapError and the errorObserver get an Error, and not null or undefined.
    And The failure is not swallowed.
    Examples: 
      | Value     |
      | null      |
      | undefined |

  Scenario Outline: An action that throws null or undefined can still have its error swallowed.
    Given An action whose reducer throws [Value].
    And Its wrapError returns null.
    When The action is dispatched with dispatchAndWait.
    Then dispatchAndWait resolves, since the error was swallowed.
    And The action status is still "completed failed", since the reducer did not finish.
    Examples: 
      | Value     |
      | null      |
      | undefined |
