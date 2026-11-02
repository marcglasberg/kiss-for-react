Feature: Filter

  Scenario Outline: The user changes to the next filter.
    Given The filter is [Filter before].
    When The user changes to the next filter.
    Then The filter becomes [Filter after].
    And The list does not change.
    Examples: 
      | Filter before     | Filter after      |
      | Showing ACTIVE    | Showing COMPLETED |
      | Showing COMPLETED | Showing ALL       |
      | Showing ALL       | Showing ACTIVE    |

  Scenario: The filter is set to a given value.
    Given The filter is "Showing ALL".
    When The filter is set to "Showing COMPLETED".
    Then The filter becomes "Showing COMPLETED".
