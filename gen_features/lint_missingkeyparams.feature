Feature: Lint: missing-key-params

  Scenario Outline: An OptimisticCommand with fields, without a key, is a warning.
    Given A subclass of OptimisticCommand with the fields todoId and text.
    And It doesn't override nonReentrantKeyParams or computeNonReentrantKey.
    When The code is linted.
    Then There is a warning in the class name.
    And The suggestion overrides nonReentrantKeyParams, returning the fields, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Fields declared as properties are found too.
    Given A subclass of OptimisticCommand with fields declared as properties.
    When The suggestion is applied.
    Then nonReentrantKeyParams is added after the last field, returning the fields.
    And The code compiles.

  Scenario Outline: OptimisticCommands that are not reported.
    Given A subclass of OptimisticCommand that {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                               | Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
      | overrides nonReentrantKeyParams                    | 
class SaveTodo extends OptimisticCommand<State, string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; }

  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.todos[this.todoId]; }
  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }
  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }
}                                                                                        |
      | overrides computeNonReentrantKey                   | 
class SaveTodo extends OptimisticCommand<State, string> {
  constructor(readonly todoId: string, readonly text: string) { super(); }
  computeNonReentrantKey() { return this.todoId; }

  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.todos[this.todoId]; }
  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }
  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }
}                                                                                       |
      | inherits nonReentrantKeyParams from its superclass | 
abstract class TodoCommand extends OptimisticCommand<State, string> {
  abstract readonly todoId: string;
  nonReentrantKeyParams() { return this.todoId; }
}
class SaveTodo extends TodoCommand {
  constructor(readonly todoId: string, readonly text: string) { super(); }

  optimisticValue() { return this.text; }
  getValueFromState(state: State) { return state.todos[this.todoId]; }
  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }
  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }
} |
      | has no fields (only retry)                         | 
class ClearTodos extends OptimisticCommand<State, Record<string, string>> {
  retry = { maxRetries: 5 };
  optimisticValue() { return {}; }
  getValueFromState(state: State) { return state.todos; }
  applyValueToState(state: State, value: Record<string, string>) { return new State(value); }
  async sendCommandToServer() {}
}                                                                                                                                                                                                                                               |

  Scenario Outline: A nonReentrant action with fields, without a key, is a warning.
    Given An action with nonReentrant = true {Where}, and the field todoId.
    And It does not override nonReentrantKeyParams or computeNonReentrantKey.
    When The code is linted.
    Then There is a warning in the class name.
    And The suggestion overrides nonReentrantKeyParams, returning the field, and the code compiles.
    Examples: 
      | Where             | Type information | Code                                                                                                                                                                                                                                                     |
      | in the action     | true             | 
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}                                                                  |
      | in the action     | false            | 
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}                                                                  |
      | in its superclass | true             | 
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadTodo extends NonReentrantAction {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
} |
      | in its superclass | false            | 
abstract class NonReentrantAction extends KissAction<State> {
  nonReentrant = true;
}
class LoadTodo extends NonReentrantAction {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
} |

  Scenario Outline: Actions that are not non-reentrant, or that have a key, are not reported.
    Given An action with fields, that extends KissAction, and {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                  | Code                                                                                                                                                                                                                                       |
      | is not nonReentrant                                   | 
class LoadTodo extends KissAction<State> {
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}                                                                           |
      | has nonReentrant = false                              | 
class LoadTodo extends KissAction<State> {
  nonReentrant = false;
  constructor(readonly todoId: string) { super(); }
  async reduce() { await loadTodo(this.todoId); return null; }
}                                                   |
      | is nonReentrant, and overrides nonReentrantKeyParams  | 
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; }
  async reduce() { await loadTodo(this.todoId); return null; }
}  |
      | is nonReentrant, and overrides computeNonReentrantKey | 
class LoadTodo extends KissAction<State> {
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
  computeNonReentrantKey() { return this.todoId; }
  async reduce() { await loadTodo(this.todoId); return null; }
} |
      | is nonReentrant, but has no fields                    | 
class LoadTodos extends KissAction<State> {
  nonReentrant = true;
  retry = { on: true };
  async reduce() { await loadTodo('all'); return null; }
}                                                                                     |

  Scenario: With type information, an OptimisticCommand base class of another file is known.
    Given An abstract command in another file, that extends OptimisticCommand.
    And A subclass with fields, without a key.
    When The code is linted.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since the superclass is unknown.

  Scenario Outline: An action with unlimitedRetryCheckInternet and fields, without a key, is a warning.
    Given An action with unlimitedRetryCheckInternet = true, and the field todoId.
    And It does not override nonReentrantKeyParams or computeNonReentrantKey.
    When The code is linted.
    Then There is a warning in the class name, since the action is non-reentrant.
    And With nonReentrantKeyParams, there is no warning.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: An OptimisticSync with fields, without a key, is a warning.
    Given A subclass of OptimisticSync with the field itemId.
    And It doesn't override optimisticSyncKeyParams or computeOptimisticSyncKey.
    When The code is linted.
    Then There is a warning in the class name, saying the value of other items may never be sent.
    And The suggestion overrides optimisticSyncKeyParams, returning the field, and the code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: OptimisticSyncs that are not reported.
    Given An OptimisticSync that {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                                                 | Code                                                  |
      | overrides optimisticSyncKeyParams                                                    | 
  optimisticSyncKeyParams() { return this.itemId; }  |
      | overrides computeOptimisticSyncKey                                                   | 
  computeOptimisticSyncKey() { return this.itemId; } |
      | only overrides nonReentrantKeyParams, which it does not use, so it is still reported | 
  nonReentrantKeyParams() { return this.itemId; }    |
