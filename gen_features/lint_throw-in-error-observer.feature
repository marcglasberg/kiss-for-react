Feature: Lint: throw-in-error-observer

  Scenario Outline: A throw in errorObserver is reported, and fixed by returning the error.
    Given A store whose errorObserver {How}.
    When The code is linted.
    Then The throw is reported.
    And The fix changes throw to return, and the fixed code compiles.
    Examples: 
      | How                                                                         | Code                                                                                                                                                                                                                                                                                    | Fixed                                                                                              |
      | is an arrow function given to createStore                                   | \nconst store = createStore<State>({\n  initialState: new State(0),\n  errorObserver: ({ error }) => {\n    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);\n    return error;\n  },\n});\n                                           | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a method given to new Store                                              | \nconst store = new Store<State>({\n  initialState: new State(0),\n  errorObserver({ error }) {\n    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);\n    return error;\n  },\n});\n                                                  | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a function declared in the same file, and given by name                  | \nfunction errorObserver({ error }: { error: any }) {\n  if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);\n  return error;\n}\n\nconst store = createStore<State>({ initialState: new State(0), errorObserver });\n                    | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a const arrow function declared in the same file, and given by reference | \nconst observeErrors = ({ error }: { error: any }) => {\n  if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);\n  return error;\n};\n\nconst store = createStore<State>({ initialState: new State(0), errorObserver: observeErrors });\n | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |

  Scenario: Without type information, a throw in errorObserver is also reported.
    Given A store whose errorObserver throws.
    When The code is linted without type information.
    Then The throw is reported and fixed.

  Scenario: If the function declares a return type, the throw is reported but not fixed.
    Given An errorObserver with the declared return type UserException, which throws an Error.
    When The code is linted.
    Then The throw is reported.
    And There is no fix, since returning an Error would not compile.

  Scenario Outline: Throws that do not leave errorObserver, or are not in it, are not reported.
    Given {Where}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Where                                                            | Code                                                                                                                                                                                                                                                 |
      | A throw caught by a try in errorObserver                         | \nconst store = createStore<State>({\n  initialState: new State(0),\n  errorObserver: ({ error }) => {\n    try {\n      if (error === null) throw new Error('No error');\n    } catch (e) {\n      return e;\n    }\n    return error;\n  },\n});\n |
      | A throw in a function inside errorObserver                       | \nconst store = createStore<State>({\n  initialState: new State(0),\n  errorObserver: ({ error }) => {\n    const check = () => { throw new Error('Never called'); };\n    return error;\n  },\n});\n                                                |
      | A throw in a function called errorObserver, not given to a store | \nconst options = {\n  errorObserver: ({ error }: { error: any }) => { throw error; },\n};\n                                                                                                                                                         |
