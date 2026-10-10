Feature: Optimistic command whose server response fails to apply

  Scenario: When applying the server response throws, the state is not rolled back.
    Given An optimistic command whose server call succeeds with a response.
    And Applying the server response to the state throws an error.
    When The command is dispatched.
    Then The state is not rolled back, and keeps the optimistic value.
    And The rollback is not even considered, since the command did not fail.
    And There is no reload, since by default it only reloads when the command fails.
    And The action fails with the error thrown when applying the server response.

  Scenario: When reading the value from the applied server response throws, the state is not rolled back.
    Given An optimistic command whose server call succeeds with a response.
    And The server response is applied to the state.
    And Reading the value from that new state throws an error the first time.
    When The command is dispatched.
    Then The state is not rolled back, and keeps the server response.
    And The rollback is not even considered, since the command did not fail.
    And The action fails with the error thrown when reading the value.
