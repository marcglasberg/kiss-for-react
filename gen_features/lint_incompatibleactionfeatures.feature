Feature: Lint: incompatible-action-features

  Scenario Outline: Two features that can't be combined, in the same action, are an error.
    Given An action with {First}, and then {Second}.
    When The code is linted.
    Then There is an error in {Second}, saying they can't be combined.
    And The suggestions remove one or the other, and the code compiles without the error.
    Examples: 
      | First                       | Second                      |
      | debounce                    | retry                       |
      | throttle                    | nonReentrant                |
      | fresh                       | nonReentrant                |
      | fresh                       | throttle                    |
      | sequential                  | debounce                    |
      | poll                        | retry                       |
      | poll                        | debounce                    |
      | unlimitedRetryCheckInternet | retry                       |
      | unlimitedRetryCheckInternet | checkInternet               |
      | unlimitedRetryCheckInternet | nonReentrant                |
      | unlimitedRetryCheckInternet | debounce                    |
      | unlimitedRetryCheckInternet | throttle                    |
      | unlimitedRetryCheckInternet | fresh                       |
      | unlimitedRetryCheckInternet | sequential                  |
      | unlimitedRetryCheckInternet | poll                        |
      | ignoreOld                   | nonReentrant                |
      | ignoreOld                   | sequential                  |
      | ignoreOld                   | unlimitedRetryCheckInternet |

  Scenario Outline: The error explains why, when it helps.
    Given An action with {First} and {Second}.
    When The code is linted.
    Then The error says: {Reason}
    Examples: 
      | First                       | Second        | Reason                                                                           |
      | unlimitedRetryCheckInternet | retry         | `unlimitedRetryCheckInternet` already retries.                                   |
      | unlimitedRetryCheckInternet | checkInternet | `unlimitedRetryCheckInternet` already checks the internet.                       |
      | unlimitedRetryCheckInternet | nonReentrant  | `unlimitedRetryCheckInternet` is already non-reentrant.                          |
      | poll                        | retry         | Add `retry` to the action returned by `createPollingAction()` instead.           |
      | sequential                  | debounce      | The debounce period would only start when the action gets its turn in the queue. |
      | ignoreOld                   | sequential    | The actions already apply their results in the dispatch order.                   |

  Scenario: The rule reports exactly the combinations the store does not allow.
    Given Each pair of features, turned on in the same action.
    When The code is linted, and the same action is dispatched.
    Then The lint reports the pair if, and only if, the dispatch throws a StoreException.
    # This keeps the rule in sync with the store.

  Scenario: The rule reports exactly the features an OptimisticCommand does not allow.
    Given An OptimisticCommand with each feature.
    When The code is linted, and the same command is dispatched.
    Then The lint reports the feature if, and only if, the dispatch throws a StoreException.

  Scenario Outline: An OptimisticCommand with a feature it can't use is an error.
    Given An OptimisticCommand with {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, with a suggestion to remove it.
    Examples: 
      | Feature                     | Type information |
      | nonReentrant                | true             |
      | nonReentrant                | false            |
      | throttle                    | true             |
      | unlimitedRetryCheckInternet | false            |

  Scenario Outline: An OptimisticCommand that retries forever is an error.
    Given An OptimisticCommand with retry = {Retry}.
    When The code is linted.
    Then There is an error in retry: {Result}.
    Examples: 
      | Retry                      | Result                 |
      | { maxRetries: -1 }         | it can't retry forever |
      | { unlimitedRetries: true } | it can't retry forever |
      | { maxRetries: 3 }          | none                   |

  Scenario: The rule reports exactly the features an OptimisticSync does not allow.
    Given An OptimisticSync with each feature.
    When The code is linted, and the same action is dispatched.
    Then The lint reports the feature if, and only if, the dispatch throws a StoreException.

  Scenario Outline: An OptimisticSync with a feature it can't use is an error.
    Given An OptimisticSync with {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, with a suggestion to remove it.
    Examples: 
      | Feature      | Type information |
      | retry        | true             |
      | retry        | false            |
      | sequential   | true             |
      | nonReentrant | false            |

  Scenario: The rule reports exactly the features an OptimisticSyncWithPush does not allow.
    Given An OptimisticSyncWithPush with each feature.
    When The code is linted, and the same action is dispatched.
    Then The lint reports the feature if, and only if, the dispatch throws a StoreException.
    And It allows the same features as an OptimisticSync.

  Scenario Outline: An OptimisticSyncWithPush with a feature it can't use is an error.
    Given An OptimisticSyncWithPush with {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, saying an OptimisticSyncWithPush can't use it, with a suggestion to remove it.
    Examples: 
      | Feature      | Type information |
      | retry        | true             |
      | retry        | false            |
      | sequential   | true             |
      | nonReentrant | false            |

  Scenario: The rule reports exactly the features a ServerPush does not allow.
    Given A ServerPush with each feature.
    When The code is linted, and the same action is dispatched.
    Then The lint reports the feature if, and only if, the dispatch throws a StoreException.
    And It does not allow any feature, not even checkInternet.

  Scenario Outline: A ServerPush with a feature is an error.
    Given A ServerPush with {Feature}.
    When The code is linted.
    Then There is an error in {Feature}, saying a ServerPush can't use it, with a suggestion to remove it.
    Examples: 
      | Feature       | Type information |
      | checkInternet | true             |
      | checkInternet | false            |
      | sequential    | true             |

  Scenario: An OptimisticSync with checkInternet is not reported.
    Given An OptimisticSync with checkInternet.
    When The code is linted.
    Then There are no errors.

  Scenario Outline: A feature inherited from a superclass counts too.
    Given An abstract action with throttle = 1000.
    And A subclass with nonReentrant = true.
    When The code is linted.
    Then There is an error in nonReentrant, with a suggestion to remove it (not the inherited throttle).
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Two features inherited from a superclass are only reported in the superclass.
    Given An abstract action with retry and debounce.
    And A subclass that declares neither.
    When The code is linted.
    Then There is one error, in the superclass.

  Scenario Outline: A feature turned off by a subclass does not count.
    Given An abstract action with {Inherited}.
    And A subclass with {Own}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Inherited            | Own                                       | Type information |
      | retry = { on: true } | debounce = 300, and retry = { on: false } | true             |
      | retry = { on: true } | debounce = 300, and retry = { on: false } | false            |
      | throttle = 1000      | nonReentrant = true, and throttle = false | false            |

  Scenario Outline: A poll constructor parameter counts as polling.
    Given An action with retry, and a constructor parameter "readonly poll = Poll.once".
    When The code is linted.
    Then There is an error in poll, with a suggestion to remove retry only.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Features that can be combined, and classes that are not actions, are not reported.
    Given {Code}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Code                                                          |
      | An action with nonReentrant, retry and checkInternet          |
      | An action with throttle and retry                             |
      | An action with sequential and nonReentrant                    |
      | A class that is not an action, with throttle and nonReentrant |

  Scenario Outline: A boolean feature counts as on when its value is not a literal, like a constant.
    Given A constant FLAG that is true.
    And An action with {Other}, and {Feature} = FLAG.
    When The code is linted.
    Then There is an error in {Feature}, saying they can't be combined, since the store also checks if it's truthy.
    Examples: 
      | Other               | Feature      | Type information |
      | throttle = 1000     | nonReentrant | true             |
      | throttle = 1000     | nonReentrant | false            |
      | debounce = 300      | sequential   | true             |
      | debounce = 300      | sequential   | false            |
      | nonReentrant = true | ignoreOld    | true             |
      | nonReentrant = true | ignoreOld    | false            |

  Scenario Outline: A boolean feature set to a falsy literal does not count.
    Given An action with throttle = 1000, and nonReentrant = {Value}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Value     |
      | false     |
      | 0         |
      | null      |
      | undefined |

  Scenario Outline: A retry set to a falsy value does not count, since the store only turns it on when it is truthy.
    Given An action with debounce = 300, and retry = {Value}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Value         |
      | false         |
      | 0             |
      | { on: false } |

  Scenario: With type information, a feature set to a constant that is false does not count.
    Given A constant OFF that is false.
    And An action with throttle = 1000, and nonReentrant = OFF.
    When The code is linted with type information.
    Then There are no errors, since the type of OFF is false.

  Scenario: With type information, a feature inherited with a constant that is true counts.
    Given A constant FLAG that is true.
    And An abstract action with nonReentrant = FLAG.
    And A subclass with throttle = 1000.
    When The code is linted with type information.
    Then There is an error in throttle.

  Scenario Outline: An action written as a class expression is checked too.
    Given An action written as a class expression, with throttle and nonReentrant.
    When The code is linted.
    Then There is an error in nonReentrant, with or without type information.
    Examples: 
      | Type information |
      | true             |
      | false            |
