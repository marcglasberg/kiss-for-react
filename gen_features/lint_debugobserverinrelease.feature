Feature: Lint: debug-observer-in-release

  Scenario Outline: A PersistorPrinterDecorator given to the store is reported.
    Given A store whose persistor is a PersistorPrinterDecorator, {Where}.
    When The code is linted.
    Then The PersistorPrinterDecorator is reported.
    And The suggestion removes it, keeping the persistor it decorates, and the code compiles.
    Examples: 
      | Where                        | Code                                                                                                                                                                 | Suggested                         |
      | created in the store options | 
const store = createStore<State>({
  initialState: new State(0),
  persistor: new PersistorPrinterDecorator(persistor),
});
                                        |   persistor: persistor,           |
      | created in a variable        | 
const debugPersistor = new PersistorPrinterDecorator<State>(persistor);
const store = new Store<State>({ initialState: new State(0), persistor: debugPersistor });
 | const debugPersistor = persistor; |

  Scenario Outline: An actionObserver or stateObserver that only prints to the console is reported.
    Given A store with {Observer}, which only calls console.log.
    When The code is linted (with or without type information).
    Then The observer is reported.
    And The suggestion removes it, and the code compiles.
    Examples: 
      | Observer                               | Code                                                                                                                                                                                                                                                              | Text                                                                                    | Suggested                                                                              | Type information |
      | an actionObserver                      | 
const store = createStore<State>({
  initialState: new State(0),
  actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini),
  logger: null,
});
                                                                                 | actionObserver: (action, dispatchCount, ini) => console.log(action, dispatchCount, ini) | 
const store = createStore<State>({
  initialState: new State(0),
  logger: null,
});
 | true             |
      | a stateObserver declared as a function | 
function stateObserver(action: KissAction<State>, prevState: State, newState: State) {
  console.log('Action:', action);
  console.log('State:', prevState, newState);
}

const store = createStore<State>({
  initialState: new State(0),
  stateObserver,
});
 | stateObserver                                                                           | 
const store = createStore<State>({
  initialState: new State(0),
});
                 | false            |

  Scenario Outline: Debug tools used only in some conditions, and observers that do more than print, are not reported.
    Given {Case}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Case                                                    | Code                                                                                                                                                                                                                                                                                                           |
      | A PersistorPrinterDecorator in a conditional expression | 
const store = createStore<State>({
  initialState: new State(0),
  persistor: isDev ? new PersistorPrinterDecorator(persistor) : persistor,
});
                                                                                                                                                              |
      | A store with debug tools created inside an if           | 
function create() {
  if (isDev) {
    return createStore<State>({
      initialState: new State(0),
      persistor: new PersistorPrinterDecorator(persistor),
      actionObserver: (action) => console.log(action),
    });
  }
  return createStore<State>({ initialState: new State(0), persistor });
}
 |
      | An actionObserver given only in development             | 
const store = createStore<State>({
  initialState: new State(0),
  actionObserver: isDev ? (action) => console.log(action) : undefined,
});
                                                                                                                                                                  |
      | An actionObserver that does more than print             | 
declare function track(name: string): void;

const store = createStore<State>({
  initialState: new State(0),
  actionObserver: (action, dispatchCount, ini) => {
    console.log(action);
    if (ini) track(action.constructor.name);
  },
});
                                                             |

  Scenario: Debug tools in tests are not reported.
    Given A test file that creates a store with a PersistorPrinterDecorator and a console actionObserver.
    When The code is linted.
    Then There are no reports.
