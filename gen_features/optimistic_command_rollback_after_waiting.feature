Feature: Optimistic command rollback after waiting

  Scenario: A sequential command that fails rolls back to the value of the earlier command that succeeded.
    Given A sequential optimistic command, and the name is "initial".
    And The command is dispatched with name "a", and then with name "b", so "b" waits for its turn.
    When The server saves "a".
    And Then "b" gets its turn, and the server fails to save "b".
    Then The name is rolled back to "a", the value it had when "b" got its turn.

  Scenario: A sequential command that fails does not roll back to the value of an earlier command that also failed.
    Given A sequential optimistic command, and the name is "initial".
    And The command is dispatched with name "a", and its optimistic value is applied.
    And Then it's dispatched with name "b", which waits for its turn.
    When The server fails to save "a", so the name is rolled back to "initial".
    And Then "b" gets its turn, and the server fails to save "b".
    Then The name is rolled back to "initial", and not to "a", which was never saved.

  Scenario: A sequential command rolls back to a value changed by another action while it waited for its turn.
    Given A sequential optimistic command, and the name is "initial".
    And The command is dispatched with name "a", and then with name "b", so "b" waits for its turn.
    When Meanwhile, another action changes the name to "other".
    And Then the server saves "a", "b" gets its turn, and the server fails to save "b".
    Then The name is rolled back to "other", the value it had when "b" got its turn.

  Scenario: A command that checks the internet rolls back to the value it had when the internet check finished.
    Given An optimistic command that checks the internet, and the name is "initial".
    And The command is dispatched with name "a", and is waiting for the internet check.
    When Meanwhile, the name is changed to "other".
    And Then the internet check finds the internet, and the server fails to save "a".
    Then The name is rolled back to "other", and not to "initial".

  Scenario: A command that does not wait rolls back to the value it had when it was dispatched.
    Given An optimistic command, and the name is "initial".
    When The command is dispatched with name "a", and the server fails to save "a".
    Then The name is rolled back to "initial".
