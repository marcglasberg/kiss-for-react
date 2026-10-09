Feature: showUserException that throws

  Scenario: If showUserException throws once, later user exceptions are still shown.
    Given A showUserException that throws the first time it is called.
    When Two actions fail with UserException.
    Then showUserException is called for the second one too.

  Scenario: A throwing showUserException does not replace the action error, nor skip the errorObserver.
    Given A showUserException that always throws.
    And An errorObserver that records the errors it gets, and swallows them.
    When An action fails with UserException.
    Then dispatch does not throw.
    And The errorObserver gets the UserException, not the showUserException error.
    And The action status has the UserException as its error.
