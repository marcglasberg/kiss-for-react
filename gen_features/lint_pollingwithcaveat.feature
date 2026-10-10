Feature: Lint: polling-with-caveat

  Scenario Outline: A feature that may block Poll.stop, in the action that starts and stops the polling, is an error.
    Given An action with a poll, and {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, saying {Reason}.
    And The suggestion removes {Feature}, and the code compiles without the error.
    Examples: 
      | Feature       | Reason                                                         | Type information |
      | checkInternet | a `Poll.stop` dispatched while there is no internet fails      | true             |
      | checkInternet | a `Poll.stop` dispatched while there is no internet fails      | false            |
      | nonReentrant  | a `Poll.stop` dispatched while a run is in progress is ignored | true             |
      | nonReentrant  | a `Poll.stop` dispatched while a run is in progress is ignored | false            |
      | throttle      | a `Poll.stop` dispatched inside the throttle period is ignored | true             |
      | throttle      | a `Poll.stop` dispatched inside the throttle period is ignored | false            |
      | fresh         | a `Poll.stop` dispatched while the data is fresh is ignored    | true             |
      | fresh         | a `Poll.stop` dispatched while the data is fresh is ignored    | false            |
      | sequential    | a `Poll.stop` has to wait for its turn in the queue            | true             |
      | sequential    | a `Poll.stop` has to wait for its turn in the queue            | false            |

  Scenario: With checkInternet = { abort: true }, the error says Poll.stop is aborted.
    Given An action with a poll, and checkInternet = { abort: true }.
    When The code is linted.
    Then The error says a Poll.stop dispatched while there is no internet is aborted.

  Scenario: A poll property counts too, and each feature is reported.
    Given An action with poll = Poll.once as a property, nonReentrant and throttle.
    When The code is linted.
    Then There are errors in nonReentrant and throttle.

  Scenario Outline: A feature inherited from a superclass, in an action with a poll, is reported in the poll.
    Given An abstract action with throttle.
    And A subclass with a poll.
    When The code is linted.
    Then There is an error in the poll of the subclass, without suggestions.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A feature in a subclass of an action with a poll is reported in the feature.
    Given An abstract action with a poll.
    And A subclass with nonReentrant.
    When The code is linted.
    Then There is an error in nonReentrant, in the subclass only.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: A poll and a feature, both inherited, are only reported in the superclass.
    Given An abstract action with a poll and fresh.
    And A subclass that declares neither.
    When The code is linted.
    Then There is one error, in the fresh of the superclass.

  Scenario Outline: Code that does not block Poll.stop is not reported.
    Given {Code}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Code                                                                       |
      | The features in the tick action, returned by createPollingAction()         |
      | An action with a poll, pollInterval and pollWaitsForRun                    |
      | An action with a poll, and throttle = false in a subclass                  |
      | An action with a poll and retry (reported by incompatible-action-features) |
      | A class that is not an action, with a poll and throttle                    |
