Feature: Describing state changes

  Scenario: Changes at the top level of the state are described.
    Given A state with a count of 1.
    When The count changes to 2.
    Then The description lists the change to the count.

  Scenario: Changes inside nested objects of the state are described.
    Given A state with a user named Ann.
    When The user name changes to Bob.
    Then The description lists the change to the user name, with its full path.

  Scenario: Changes at several nesting levels are all described.
    Given A state with a count of 1, a user named Ann, living in Paris.
    When The count changes to 2, the name to Bob, and the city to Rome.
    Then The description lists all three changes.

  Scenario: Nothing is described when nothing changed.
    Given A state with nested objects.
    When It is compared to an equal state.
    Then The description is empty.
