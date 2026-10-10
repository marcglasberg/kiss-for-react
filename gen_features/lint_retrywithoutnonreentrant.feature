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
      | Case                                                            | Code                                                                                                                                                                                                                                                                                                                                                                                        |
      | nonReentrant = true                                             | 
class LoadText extends KissAction<State> {
  retry = { on: true };
  nonReentrant = true;
  async reduce() { const text = await loadText(); return () => new State(text); }
}                                                                                                                                                                                                              |
      | nonReentrant = false, which is deliberate                       | 
class LoadText extends KissAction<State> {
  retry = { on: true };
  nonReentrant = false;
  async reduce() { const text = await loadText(); return () => new State(text); }
}                                                                                                                                                                                                             |
      | nonReentrant = true in its superclass                           | 
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadText extends NonReentrantAction {
  retry = { on: true };
  async reduce() { const text = await loadText(); return () => new State(text); }
}                                                                                                                                             |
      | an overridden abortDispatch                                     | 
class LoadText extends KissAction<State> {
  retry = { on: true };
  abortDispatch() { return this.state.text !== ''; }
  async reduce() { const text = await loadText(); return () => new State(text); }
}                                                                                                                                                                                |
      | retry turned off                                                | 
class LoadText extends KissAction<State> {
  retry = { on: false };
  async reduce() { const text = await loadText(); return () => new State(text); }
}                                                                                                                                                                                                                                    |
      | a sync reduce, which is reported by retry-requires-async-reduce | 
class LoadText extends KissAction<State> {
  retry = { on: true };
  reduce() { return new State('text'); }
}                                                                                                                                                                                                                                                                              |
      | it is an OptimisticCommand, which is always non-reentrant       | 
class SaveText extends OptimisticCommand<State, string> {
  constructor(readonly text: string) { super(); }
  retry = { maxRetries: 5 };
  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.text; }
  applyValueToState(state: State, value: string) { return new State(value); }
  async sendCommandToServer(value: string) { return value; }
}   |
      | it is an OptimisticSync, which can't use retry nor nonReentrant | 
class SaveText extends OptimisticSync<State, string> {
  constructor(readonly text: string) { super(); }
  retry = { maxRetries: 5 };
  valueToApply() { return this.text; }
  applyOptimisticValueToState(state: State, value: string) { return new State(value); }
  getValueFromState(state: State) { return state.text; }
  async sendValueToServer(value: string) { return value; }
} |

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
