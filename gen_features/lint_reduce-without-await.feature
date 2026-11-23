Feature: Lint: reduce-without-await

  Scenario Outline: An async reduce without await is reported.
    Given An action whose reduce is async, but has no await.
    When The code is linted.
    Then There is a warning in reduce.
    And There is a suggestion to make reduce sync.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: The suggestion makes reduce sync, using this.state instead of the state parameter.
    Given An async reduce without await, which returns null, a function without parameters, and a function with a state parameter.
    When The suggestion is applied.
    Then reduce is sync.
    And It returns the values directly, with this.state instead of the state parameter.
    And The code compiles.

  Scenario Outline: The suggestion is not offered when the returned function can't be inlined.
    Given An async reduce without await, which returns {Case}.
    When The code is linted.
    Then There is a warning, but no suggestion.
    Examples: 
      | Case                                    | Code                                                                                                     |
      | a function with a block body            | \n  async reduce() {\n    return (state: State) => { const n = state.count; return state.add(n); };\n  } |
      | a function, with a declared return type | \n  async reduce(): Promise<(state: State) => State> {\n    return (state: State) => state.add(1);\n  }  |

  Scenario Outline: Async reducers that need to be async are not reported.
    Given An action with {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                                                           | Code                                                                                                                                                               |
      | an async reduce with await                                     | \n  async reduce() {\n    const n = await load();\n    return (state: State) => state.add(n);\n  }                                                                 |
      | an async reduce with for await                                 | \n  async reduce() {\n    let n = 0;\n    for await (const x of [load()]) n += x;\n    return (state: State) => state.add(n);\n  }                                 |
      | an async reduce that returns a promise                         | \n  async reduce() {\n    return loadReducer();\n  }                                                                                                               |
      | retry, which needs an async reduce                             | \n  retry = { on: true };\n  async reduce() {\n    return (state: State) => state.add(1);\n  }                                                                     |
      | checkInternet, which makes the action async anyway             | \n  checkInternet = { dialog: true };\n  async reduce() {\n    return (state: State) => state.add(1);\n  }                                                         |
      | an async before, which makes the action async anyway           | \n  async before() { await load(); }\n  async reduce() {\n    return (state: State) => state.add(1);\n  }                                                          |
      | a sync reduce                                                  | \n  reduce() {\n    return this.state.add(1);\n  }                                                                                                                 |
      | an await only inside a nested function, and a returned promise | \n  async reduce() {\n    const loadTwice = async () => (await load()) + (await load());\n    return loadTwice().then((n) => (state: State) => state.add(n));\n  } |

  Scenario Outline: With type information, an inherited async before or retry is also found.
    Given A base action, declared in another file, with {Case}.
    And An action that extends it, with an async reduce without await.
    When The code is linted with type information.
    Then There are no warnings.
    And Without type information, the base action is not known, so it is reported.
    Examples: 
      | Case          | Base                              |
      | checkInternet | checkInternet = { dialog: true }; |
      | retry         | retry = { on: true };             |

  Scenario: Classes that are not Kiss actions are not reported.
    Given A class that is not a Kiss action, with an async reduce without await.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: An async reduce without await, in an action with unlimitedRetryCheckInternet, is fine.
    Given An action with unlimitedRetryCheckInternet = true, and an async reduce without await.
    When The code is linted.
    Then There are no warnings, since unlimitedRetryCheckInternet needs an async reduce.
    Examples: 
      | Type information |
      | true             |
      | false            |
