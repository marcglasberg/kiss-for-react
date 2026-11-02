Feature: Add random todo

  Scenario: The user adds a random todo, which comes from the DummyJSON API.
    Given The list has the todo "Buy milk".
    And The filter is "Showing COMPLETED".
    And The DummyJSON API returns the todo "Play cricket".
    When The user adds a random todo.
    Then The todo "Play cricket" is added to the top of the list.
    And The filter becomes "Showing ACTIVE", so the new todo is visible.

  Scenario: When the API returns a todo that is already in the list, it asks the API for another one.
    Given The list has the todo "Buy milk".
    And The DummyJSON API returns "Buy milk" first, and "Play cricket" after that.
    When The user adds a random todo.
    Then The todo "Play cricket" is added to the list.
    And The API was called two times.

  Scenario: When the API only returns todos that are already in the list, it gives up after 10 tries.
    Given The list has the todo "Buy milk".
    And The DummyJSON API always returns "Buy milk".
    When The user adds a random todo.
    Then The list does not change.
    And The API was called 10 times.
    And The user sees an error that says no new todo was found.

  Scenario: When the API fails, the user sees an error.
    Given The list has the todo "Buy milk".
    And The DummyJSON API fails with the HTTP status 500.
    When The user adds a random todo.
    Then The list does not change.
    And The user sees an error that says the connection to the API failed.

  Scenario: When the API returns no todo, the user sees an error.
    Given The list has the todo "Buy milk".
    And The DummyJSON API returns an empty todo.
    When The user adds a random todo.
    Then The list does not change.
    And The user sees an error that says no todo was received from the API.
