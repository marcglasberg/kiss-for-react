Feature: Lint: retry-without-non-reentrant

  Scenario Outline: An action with retry, but not nonReentrant, is a warning.
    Given An action with retry = {Retry}, an async reduce, and no nonReentrant.
    When The code is linted.
    Then There is a warning in retry.
    And The suggestion adds nonReentrant = true after retry, and the code compiles.
    Examples: 
      | Retry             | Type information |
      | { on: true }      | true             |
      | { on: true }      | false            |
      | { maxRetries: 5 } | true             |

  Scenario: The suggestion adds override when retry has it.
    Given An action with override retry, and no nonReentrant.
    When The suggestion is applied.
    Then It adds override nonReentrant = true.

  Scenario Outline: Actions with retry that are not reported.
    Given An action with retry, and {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                            | Code                                                                                                                                                                                                                                                                                                                                                                                                |
      | nonReentrant = true                                             | \nclass LoadText extends KissAction<State> {\n  retry = { on: true };\n  nonReentrant = true;\n  async reduce() { const text = await loadText(); return () => new State(text); }\n}                                                                                                                                                                                                                 |
      | nonReentrant = false, which is deliberate                       | \nclass LoadText extends KissAction<State> {\n  retry = { on: true };\n  nonReentrant = false;\n  async reduce() { const text = await loadText(); return () => new State(text); }\n}                                                                                                                                                                                                                |
      | nonReentrant = true in its superclass                           | \nabstract class NonReentrantAction extends KissAction<State> {\n  nonReentrant = true;\n}\nclass LoadText extends NonReentrantAction {\n  retry = { on: true };\n  async reduce() { const text = await loadText(); return () => new State(text); }\n}                                                                                                                                              |
      | an overridden abortDispatch                                     | \nclass LoadText extends KissAction<State> {\n  retry = { on: true };\n  abortDispatch() { return this.state.text !== ''; }\n  async reduce() { const text = await loadText(); return () => new State(text); }\n}                                                                                                                                                                                   |
      | retry turned off                                                | \nclass LoadText extends KissAction<State> {\n  retry = { on: false };\n  async reduce() { const text = await loadText(); return () => new State(text); }\n}                                                                                                                                                                                                                                        |
      | a sync reduce, which is reported by retry-requires-async-reduce | \nclass LoadText extends KissAction<State> {\n  retry = { on: true };\n  reduce() { return new State('text'); }\n}                                                                                                                                                                                                                                                                                  |
      | it is an OptimisticCommand, which is always non-reentrant       | \nclass SaveText extends OptimisticCommand<State, string> {\n  constructor(readonly text: string) { super(); }\n  retry = { maxRetries: 5 };\n  optimisticValue() { return this.text; }\n  getValueFromState(state: State) { return state.text; }\n  applyValueToState(state: State, value: string) { return new State(value); }\n  async sendCommandToServer(value: string) { return value; }\n}   |
      | it is an OptimisticSync, which can't use retry nor nonReentrant | \nclass SaveText extends OptimisticSync<State, string> {\n  constructor(readonly text: string) { super(); }\n  retry = { maxRetries: 5 };\n  valueToApply() { return this.text; }\n  applyOptimisticValueToState(state: State, value: string) { return new State(value); }\n  getValueFromState(state: State) { return state.text; }\n  async sendValueToServer(value: string) { return value; }\n} |

  Scenario: Without type information, an OptimisticCommand from another file is recognized by its methods.
    Given An action that extends a base command of another file, which extends OptimisticCommand.
    And It has retry, and implements sendCommandToServer.
    When The code is linted.
    Then There are no warnings, with or without type information.

  Scenario: Retry without nonReentrant is not reported in tests.
    Given A test file with an action with retry, and no nonReentrant.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: An action with retry and throttle or fresh is not reported.
    Given An action with retry = { on: true }, and {Feature} {Where}.
    When The code is linted.
    Then There are no warnings, since nonReentrant can not be combined with {Feature}.
    Examples: 
      | Feature         | Where             | Type information |
      | throttle = 1000 | in the action     | true             |
      | throttle = 1000 | in the action     | false            |
      | fresh = 1000    | in the action     | false            |
      | fresh = 1000    | in its superclass | true             |
      | fresh = 1000    | in its superclass | false            |
