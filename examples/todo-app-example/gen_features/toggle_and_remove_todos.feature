Feature: Toggle and remove todos

  Scenario Outline: The user marks a todo as completed, or as not completed.
    Given The list has the todos "Buy milk" and "Walk the dog".
    And "Buy milk" is [Completed before].
    When The user toggles "Buy milk".
    Then "Buy milk" becomes [Completed after].
    And "Walk the dog" does not change, and the order of the list does not change.
    Examples: 
      | Completed before | Completed after |
      | not completed    | completed       |
      | completed        | not completed   |

  Scenario: The user removes a todo from the list.
    Given The list has the todos "Buy milk" and "Walk the dog".
    When The user removes "Buy milk".
    Then The list has only "Walk the dog".
