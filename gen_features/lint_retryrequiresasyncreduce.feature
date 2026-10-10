Feature: Lint: retry-requires-async-reduce

  Scenario Outline: An action with retry and a sync reduce is an error.
    Given An action with retry = {Retry}, and a sync reduce.
    When The code is linted.
    Then There is an error in retry.
    And There are two suggestions: remove retry, or make reduce async.
    Examples: 
      | Retry             | Type information |
      | { on: true }      | true             |
      | { on: true }      | false            |
      | { maxRetries: 5 } | true             |

  Scenario Outline: The suggestions remove retry, or make reduce async, and the code compiles.
    Given An action with retry, and a sync reduce.
    When The {Suggestion} suggestion is applied.
    Then The code is {Result}.
    And It compiles.
    Examples: 
      | Suggestion | Result                                       |
      | first      | without retry                                |
      | second     | with an async reduce that returns a function |

  Scenario Outline: Retry with an async reduce, or retry turned off, is fine.
    Given An action with {Case}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Case                                      | Code                                                                                                                              |
      | retry and an async reduce                 | 
  retry = { on: true };
  async reduce() { return (state: State) => state.add(1); }                                              |
      | retry and a reduce that returns a Promise | 
  retry = { on: true };
  reduce(): Promise<(state: State) => State> { return Promise.resolve((state: State) => state.add(1)); } |
      | retry turned off, and a sync reduce       | 
  retry = { on: false };
  reduce() { return this.state.add(1); }                                                                |
      | no retry, and a sync reduce               | 
  reduce() { return this.state.add(1); }                                                                                         |

  Scenario Outline: An action with unlimitedRetryCheckInternet and a sync reduce is an error.
    Given An action with unlimitedRetryCheckInternet = {Value}, and a sync reduce.
    When The code is linted.
    Then There is an error in unlimitedRetryCheckInternet.
    And There are two suggestions: remove unlimitedRetryCheckInternet, or make reduce async.
    Examples: 
      | Value                        | Type information |
      | true                         | true             |
      | true                         | false            |
      | { maxDelayNoInternet: 3000 } | true             |

  Scenario Outline: unlimitedRetryCheckInternet with an async reduce, or turned off, is fine.
    Given An action with {Code}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Code                                                    |
      | unlimitedRetryCheckInternet = true, and an async reduce |
      | unlimitedRetryCheckInternet = false, and a sync reduce  |
