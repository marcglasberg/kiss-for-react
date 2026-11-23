Feature: Lint: user-exception-without-cause

  Scenario Outline: A UserException that replaces an error without keeping it as its cause is reported.
    Given A UserException created {Where}, without a hardCause.
    When The code is linted (with or without type information).
    Then The UserException is reported.
    And The fix adds .withHardCause with the replaced error, and the fixed code compiles.
    Examples: 
      | Where                                                      | Code                                                                                                                                                                                                                                                                                   | Fixed                                                                                                                            | Name         |
      | in a catch clause of a reducer                             | \nclass SetCount extends KissAction<State> {\n  constructor(readonly text: string) { super(); }\n  reduce() {\n    try {\n      return this.state.copy(parseNumber(this.text));\n    } catch (error) {\n      throw new UserException('Please enter a valid number');\n    }\n  }\n}\n | throw new UserException('Please enter a valid number').withHardCause(error);                                                     | error        |
      | in the wrapError of an action                              | \nclass LoadCount extends KissAction<State> {\n  async reduce() {\n    const count = await load();\n    return (state: State) => state.copy(count);\n  }\n  wrapError(e: any) {\n    return new UserException('Could not load the count', { title: 'Error' });\n  }\n}\n               | return new UserException('Could not load the count', { title: 'Error' }).withHardCause(e);                                       | e            |
      | in the wrapError of a persistor                            | \nabstract class MyPersistor extends Persistor<State> {\n  wrapError(error: any) {\n    return new UserException('Could not save your data.');\n  }\n}\n                                                                                                                               | return new UserException('Could not save your data.').withHardCause(error);                                                      | error        |
      | in errorObserver                                           | \nconst store = createStore<State>({\n  initialState: new State(0),\n  errorObserver: ({ error }) =>\n    error instanceof TypeError ? new UserException('Something went wrong') : error,\n});\n                                                                                       | error instanceof TypeError ? new UserException('Something went wrong').withHardCause(error) : error,                             | error        |
      | in errorObserver, which renames the error                  | \nconst store = createStore<State>({\n  initialState: new State(0),\n  errorObserver({ error: e, action }) {\n    return action !== null && e instanceof TypeError ? new UserException('Something went wrong') : e;\n  },\n});\n                                                       | return action !== null && e instanceof TypeError ? new UserException('Something went wrong').withHardCause(e) : e;               | e            |
      | in errorObserver, which does not destructure its parameter | \nfunction errorObserver(params: { error: any }) {\n  return params.error instanceof TypeError ? new UserException('Something went wrong') : params.error;\n}\n\nconst store = createStore<State>({ initialState: new State(0), errorObserver });\n                                    | return params.error instanceof TypeError ? new UserException('Something went wrong').withHardCause(params.error) : params.error; | params.error |

  Scenario Outline: A UserException that keeps the error, or does not replace one, is not reported.
    Given {Case}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Case                                                                         | Code                                                                                                                                                                                                                                                                                                                               |
      | A UserException with withHardCause                                           | \nfunction parse(text: string) {\n  try {\n    return parseNumber(text);\n  } catch (error) {\n    throw new UserException('Please enter a valid number').withHardCause(error);\n  }\n}\n                                                                                                                                          |
      | A UserException with the hardCause option                                    | \nfunction parse(text: string) {\n  try {\n    return parseNumber(text);\n  } catch (error) {\n    throw new UserException('Please enter a valid number', { hardCause: error });\n  }\n}\n                                                                                                                                         |
      | A UserException outside a catch or wrapError                                 | \nfunction parse(text: string) {\n  if (text === '') throw new UserException('Please enter a number');\n  return parseNumber(text);\n}\n                                                                                                                                                                                           |
      | A catch without a parameter, or with a parameter starting with an underscore | \nfunction parse(text: string) {\n  try {\n    return parseNumber(text);\n  } catch {\n    throw new UserException('Please enter a valid number');\n  }\n}\n\nfunction parse2(text: string) {\n  try {\n    return parseNumber(text);\n  } catch (_error) {\n    throw new UserException('Please enter a valid number');\n  }\n}\n |
      | A UserException in a function declared inside the catch                      | \nfunction parse(text: string, onError: (show: () => void) => void) {\n  try {\n    return parseNumber(text);\n  } catch (error) {\n    onError(() => { throw new UserException('Please enter a valid number'); });\n    return 0;\n  }\n}\n                                                                                       |
      | A UserException stored in a variable                                         | \nfunction parse(text: string) {\n  try {\n    return parseNumber(text);\n  } catch (error) {\n    const exception = new UserException('Please enter a valid number');\n    throw exception.withHardCause(error);\n  }\n}\n                                                                                                        |

  Scenario: If the error name is shadowed, the UserException is reported but not fixed.
    Given A catch clause with a UserException created inside a block that declares another variable with the same name as the error.
    When The code is linted.
    Then The UserException is reported, but there is no fix.

  Scenario: A UserException without a cause is not reported in tests.
    Given A test file with a UserException created in a catch clause, without a hardCause.
    When The code is linted.
    Then There are no reports.
