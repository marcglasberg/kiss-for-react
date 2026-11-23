Feature: Lint: polling-action-restarts-polling

  Scenario Outline: createPollingAction() that creates the action with a Poll value that controls the polling is a warning.
    Given An action with polling.
    When Its createPollingAction() returns new LoadPrices(Poll.{Value}).
    Then There is a warning in Poll.{Value}.
    And The suggestion uses Poll.once, and then there is no warning.
    Examples: 
      | Value            | Type information |
      | start            | true             |
      | start            | false            |
      | stop             | true             |
      | stop             | false            |
      | runNowAndRestart | true             |
      | runNowAndRestart | false            |

  Scenario Outline: createPollingAction() that creates the action with Poll.once, or without a poll, is fine.
    Given An action with polling, whose poll is Poll.once by default.
    When Its createPollingAction() returns {Creation}.
    Then There is no warning.
    Examples: 
      | Creation                  | Type information |
      | new LoadPrices(Poll.once) | true             |
      | new LoadPrices(Poll.once) | false            |
      | new LoadPrices()          | true             |
      | new LoadPrices()          | false            |

  Scenario Outline: createPollingAction() that passes this.poll is a warning.
    Given An action with polling.
    When Its createPollingAction() returns new LoadPrices(this.poll).
    Then There is a warning in this.poll, saying it is Poll.start or Poll.runNowAndRestart while the polling runs.
    And The suggestion uses Poll.once.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: createPollingAction() that creates an action without a poll, whose default is not Poll.once, is a warning.
    Given An action whose poll parameter is Poll.start by default.
    When Its createPollingAction() returns new PollPrices(), without the poll.
    Then There is a warning in new PollPrices(), saying it uses Poll.start.
    And The suggestion passes Poll.once, and then there is no warning.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A poll property that is not Poll.once, in the created action, is a warning without a suggestion.
    Given A tick action with the property poll = Poll.start.
    When createPollingAction() returns a new tick action.
    Then There is a warning in the new expression, without suggestions.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, the default poll of an action declared in another file is checked too.
    Given An action declared in another file, whose poll parameter is Poll.start by default.
    When createPollingAction() creates it without a poll.
    Then There is a warning with type information, and none without it.

  Scenario: A createPollingAction() in a class that is not an action is not checked.
    Given A class that is not an action, with createPollingAction() returning new LoadPrices(Poll.start).
    When The code is linted.
    Then There is no warning.
