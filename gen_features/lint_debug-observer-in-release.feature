Feature: Lint: debug-observer-in-release

  Scenario Outline: A PersistorPrinterDecorator given to the store is reported.
    Given A store whose persistor is a PersistorPrinterDecorator, {Where}.
    When The code is linted.
    Then The PersistorPrinterDecorator is reported.
    And The suggestion removes it, keeping the persistor it decorates, and the code compiles.
    Examples: 
      | Where                        | Code                                                                                                                                                                    | Suggested                         |
      | created in the store options | \nconst store = createStore<State>({\n  initialState: new State(0),\n  persistor: new PersistorPrinterDecorator(persistor),\n});\n                                      |   persistor: persistor,           |
      | created in a variable        | \nconst debugPersistor = new PersistorPrinterDecorator<State>(persistor);\nconst store = new Store<State>({ initialState: new State(0), persistor: debugPersistor });\n | const debugPersistor = persistor; |

  Scenario Outline: An actionObserver or stateObserver that only prints to the console is reported.
    Given A store with {Observer}, which only calls console.log.
    When The code is linted (with or without type information).
    Then The observer is reported.
    And The suggestion removes it, and the code compiles.
    Examples: 
      | Observer                               | Code                                                                                                                                                                                                                                                                        | Text                                                                                    | Suggested                                                                                   | Type information |
      | an actionObserver                      | \nconst store = createStore<State>({\n  initialState: new State(0),\n  actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini),\n  logger: null,\n});\n                                                                                     | actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini) | \nconst store = createStore<State>({\n  initialState: new State(0),\n  logger: null,\n});\n | true             |
      | a stateObserver declared as a function | \nfunction stateObserver(action: KissAction<State>, prevState: State, newState: State) {\n  console.log('Action:', action);\n  console.log('State:', prevState, newState);\n}\n\nconst store = createStore<State>({\n  initialState: new State(0),\n  stateObserver,\n});\n | stateObserver                                                                           | \nconst store = createStore<State>({\n  initialState: new State(0),\n});\n                  | false            |

  Scenario Outline: Debug tools used only in some conditions, and observers that do more than print, are not reported.
    Given {Case}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Case                                                    | Code                                                                                                                                                                                                                                                                                                                      |
      | A PersistorPrinterDecorator in a conditional expression | \nconst store = createStore<State>({\n  initialState: new State(0),\n  persistor: isDev ? new PersistorPrinterDecorator(persistor) : persistor,\n});\n                                                                                                                                                                    |
      | A store with debug tools created inside an if           | \nfunction create() {\n  if (isDev) {\n    return createStore<State>({\n      initialState: new State(0),\n      persistor: new PersistorPrinterDecorator(persistor),\n      actionObserver: (action) => console.log(action),\n    });\n  }\n  return createStore<State>({ initialState: new State(0), persistor });\n}\n |
      | An actionObserver given only in development             | \nconst store = createStore<State>({\n  initialState: new State(0),\n  actionObserver: isDev ? (action) => console.log(action) : undefined,\n});\n                                                                                                                                                                        |
      | An actionObserver that does more than print             | \ndeclare function track(name: string): void;\n\nconst store = createStore<State>({\n  initialState: new State(0),\n  actionObserver: (action, dispatchCount, ini) => {\n    console.log(action);\n    if (ini) track(action.constructor.name);\n  },\n});\n                                                              |

  Scenario: Debug tools in tests are not reported.
    Given A test file that creates a store with a PersistorPrinterDecorator and a console actionObserver.
    When The code is linted.
    Then There are no reports.
