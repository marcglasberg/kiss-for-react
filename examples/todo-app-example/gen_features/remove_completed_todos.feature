Feature: Remove completed todos

  Scenario Outline: The user removes all the completed todos.
    Given The list has the completed todos "Buy milk" and "Pay the bills".
    And The list has the todo "Walk the dog", which is not completed.
    And The filter is [Filter].
    When The user removes the completed todos.
    Then The list has only "Walk the dog".
    And In the end, the filter is [Filter] again.
    Examples: 
      | Filter            |
      | Showing ALL       |
      | Showing ACTIVE    |
      | Showing COMPLETED |

  Scenario: While the completed todos are removed, they are visible.
    Given The list has the completed todo "Buy milk".
    And The filter is "Showing ACTIVE", so completed todos are not visible.
    When The user removes the completed todos.
    Then While the todos are removed, the filter is "Showing COMPLETED".
    And In the end, the filter is "Showing ACTIVE" again.

  Scenario: Removing the completed todos when there are none does nothing.
    Given The list has no completed todos.
    When The user removes the completed todos.
    Then The state does not change.
