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
      | Case                                               | Code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
      | overrides nonReentrantKeyParams                    | \nclass SaveTodo extends OptimisticCommand<State, string> {\n  constructor(readonly todoId: string, readonly text: string) { super(); }\n  nonReentrantKeyParams() { return this.todoId; }\n\n  optimisticValue() { return this.text; }\n  getValueFromState(state: State) { return state.todos[this.todoId]; }\n  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }\n  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }\n}                                                                                           |
      | overrides computeNonReentrantKey                   | \nclass SaveTodo extends OptimisticCommand<State, string> {\n  constructor(readonly todoId: string, readonly text: string) { super(); }\n  computeNonReentrantKey() { return this.todoId; }\n\n  optimisticValue() { return this.text; }\n  getValueFromState(state: State) { return state.todos[this.todoId]; }\n  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }\n  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }\n}                                                                                          |
      | inherits nonReentrantKeyParams from its superclass | \nabstract class TodoCommand extends OptimisticCommand<State, string> {\n  abstract readonly todoId: string;\n  nonReentrantKeyParams() { return this.todoId; }\n}\nclass SaveTodo extends TodoCommand {\n  constructor(readonly todoId: string, readonly text: string) { super(); }\n\n  optimisticValue() { return this.text; }\n  getValueFromState(state: State) { return state.todos[this.todoId]; }\n  applyValueToState(state: State, value: string) { return state.withTodo(this.todoId, value); }\n  async sendCommandToServer(value: string) { await saveTodo(this.todoId, value); }\n} |
      | has no fields (only retry)                         | \nclass ClearTodos extends OptimisticCommand<State, Record<string, string>> {\n  retry = { maxRetries: 5 };\n  optimisticValue() { return {}; }\n  getValueFromState(state: State) { return state.todos; }\n  applyValueToState(state: State, value: Record<string, string>) { return new State(value); }\n  async sendCommandToServer() {}\n}                                                                                                                                                                                                                                                    |

  Scenario Outline: A nonReentrant action with fields, without a key, is a warning.
    Given An action with nonReentrant = true {Where}, and the field todoId.
    And It does not override nonReentrantKeyParams or computeNonReentrantKey.
    When The code is linted.
    Then There is a warning in the class name.
    And The suggestion overrides nonReentrantKeyParams, returning the field, and the code compiles.
    Examples: 
      | Where             | Type information | Code                                                                                                                                                                                                                                                            |
      | in the action     | true             | \nclass LoadTodo extends KissAction<State> {\n  nonReentrant = true;\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n}                                                                    |
      | in the action     | false            | \nclass LoadTodo extends KissAction<State> {\n  nonReentrant = true;\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n}                                                                    |
      | in its superclass | true             | \nabstract class NonReentrantAction extends KissAction<State> {\n  nonReentrant = true;\n}\nclass LoadTodo extends NonReentrantAction {\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n} |
      | in its superclass | false            | \nabstract class NonReentrantAction extends KissAction<State> {\n  nonReentrant = true;\n}\nclass LoadTodo extends NonReentrantAction {\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n} |

  Scenario Outline: Actions that are not non-reentrant, or that have a key, are not reported.
    Given An action with fields, that extends KissAction, and {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                  | Code                                                                                                                                                                                                                                             |
      | is not nonReentrant                                   | \nclass LoadTodo extends KissAction<State> {\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n}                                                                             |
      | has nonReentrant = false                              | \nclass LoadTodo extends KissAction<State> {\n  nonReentrant = false;\n  constructor(readonly todoId: string) { super(); }\n  async reduce() { await loadTodo(this.todoId); return null; }\n}                                                    |
      | is nonReentrant, and overrides nonReentrantKeyParams  | \nclass LoadTodo extends KissAction<State> {\n  nonReentrant = true;\n  constructor(readonly todoId: string) { super(); }\n  nonReentrantKeyParams() { return this.todoId; }\n  async reduce() { await loadTodo(this.todoId); return null; }\n}  |
      | is nonReentrant, and overrides computeNonReentrantKey | \nclass LoadTodo extends KissAction<State> {\n  nonReentrant = true;\n  constructor(readonly todoId: string) { super(); }\n  computeNonReentrantKey() { return this.todoId; }\n  async reduce() { await loadTodo(this.todoId); return null; }\n} |
      | is nonReentrant, but has no fields                    | \nclass LoadTodos extends KissAction<State> {\n  nonReentrant = true;\n  retry = { on: true };\n  async reduce() { await loadTodo('all'); return null; }\n}                                                                                      |

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
      | Case                                                                                 | Code                                                   |
      | overrides optimisticSyncKeyParams                                                    | \n  optimisticSyncKeyParams() { return this.itemId; }  |
      | overrides computeOptimisticSyncKey                                                   | \n  computeOptimisticSyncKey() { return this.itemId; } |
      | only overrides nonReentrantKeyParams, which it does not use, so it is still reported | \n  nonReentrantKeyParams() { return this.itemId; }    |

  Scenario Outline: An OptimisticSyncWithPush with fields, without a key, is a warning.
    Given A subclass of OptimisticSyncWithPush with the field itemId.
    And It {Case}.
    When The code is linted.
    Then There is {Result}.
    Examples: 
      | Case                                                                 | Code                                                  | Result                      |
      | doesn't override optimisticSyncKeyParams or computeOptimisticSyncKey |                                                       | a warning in the class name |
      | overrides optimisticSyncKeyParams                                    | \n  optimisticSyncKeyParams() { return this.itemId; } | no warning                  |
