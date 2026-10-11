Feature: The actions in progress can't be modified

  Scenario: The set of actions in progress can't be modified through the set given by its forEach.
    Given An async action is in progress.
    When We try to delete it from the actions in progress, through the set given by forEach.
    Then It throws an error.
    And The action is still in progress.
    And Waiting for the action still completes when it finishes.

  Scenario: The set given by forEach is the same unmodifiable set.
    Given An async action is in progress.
    When We iterate the actions in progress with forEach.
    Then The set given to the callback is the set we called forEach on.
    And The callback is called with the given `this`.
