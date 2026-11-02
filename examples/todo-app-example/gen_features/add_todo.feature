Feature: Add todo

  Scenario: The user adds a new todo to the list.
    Given The list has the todo "Buy milk".
    When The user adds the todo "  walk the dog ".
    Then The todo "Walk the dog" is added to the top of the list, without the spaces, and capitalized.
    And The todo is not completed.

  Scenario Outline: Adding a todo makes it visible, if the filter hides it.
    Given The filter is [Filter before].
    When The user adds a new todo.
    Then The filter becomes [Filter after].
    Examples: 
      | Filter before     | Filter after   |
      | Showing ALL       | Showing ALL    |
      | Showing ACTIVE    | Showing ACTIVE |
      | Showing COMPLETED | Showing ACTIVE |

  Scenario: The user cannot add a todo that is already in the list.
    Given The list has the todo "Buy milk".
    When The user adds the todo "Buy milk" again.
    Then The list does not change.
    And The user sees an error that says the todo already exists.
