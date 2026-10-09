Feature: Lint: async-feature-in-sync-action

  Scenario Outline: nonReentrant in an action with a sync reduce is a warning.
    Given An action with nonReentrant = true, and a sync reduce.
    When The code is linted.
    Then There is a warning in nonReentrant, saying it does nothing.
    And The suggestion removes nonReentrant, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: checkInternet in an action with a sync reduce is a warning.
    Given An action with checkInternet, and a sync reduce.
    When The code is linted.
    Then There is a warning in checkInternet, saying it makes the action async.
    And The suggestion removes checkInternet.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Both nonReentrant and checkInternet: only checkInternet is reported.
    Given An action with a sync reduce, nonReentrant = true, and checkInternet.
    When The code is linted.
    Then Only checkInternet is reported.
    And nonReentrant is not, since checkInternet makes the action async.

  Scenario Outline: Async features in actions that are or may be async are fine.
    Given An action with nonReentrant and checkInternet, and {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                        | Code                                                                                         |
      | an async reduce                             | 
  async reduce() { const n = await load(); return (state: State) => state.add(n); }         |
      | a sync reduce, and an overridden before     | 
  async before() { await load(); }
  reduce() { return this.state.add(1); }                 |
      | a sync reduce, and an overridden wrapReduce | 
  wrapReduce(reduce: () => any) { return reduce; }
  reduce() { return this.state.add(1); } |

  Scenario: Features that are turned off are fine.
    Given An action with a sync reduce, nonReentrant = false, and checkInternet = undefined.
    When The code is linted.
    Then There are no warnings.

  Scenario: With type information, a before overridden in a base action of another file is known.
    Given A base action in another file, which overrides before.
    And An action that extends it, with nonReentrant = true and a sync reduce.
    When The code is linted.
    Then With type information, there are no warnings, since the action may be async.
    And Without type information, there is a warning, since the base action is unknown.

  Scenario: Async features in sync actions are not reported in tests.
    Given A test file with an action with nonReentrant and a sync reduce.
    When The code is linted.
    Then There are no warnings.
