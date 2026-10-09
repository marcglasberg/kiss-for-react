Feature: Lint: user-exception-without-cause

  Scenario Outline: A UserException that replaces an error without keeping it as its cause is reported.
    Given A UserException created {Where}, without a hardCause.
    When The code is linted (with or without type information).
    Then The UserException is reported.
    And The fix adds .withHardCause with the replaced error, and the fixed code compiles.
    Examples: 
      | Where                           | Code                                                                                                                                                                                                                                                                        | Fixed                                                                                                | Name  |
      | in a catch clause of a reducer  | 
class SetCount extends KissAction<State> {
  constructor(readonly text: string) { super(); }
  reduce() {
    try {
      return this.state.copy(parseNumber(this.text));
    } catch (error) {
      throw new UserException('Please enter a valid number');
    }
  }
}
 | throw new UserException('Please enter a valid number').withHardCause(error);                         | error |
      | in the wrapError of an action   | 
class LoadCount extends KissAction<State> {
  async reduce() {
    const count = await load();
    return (state: State) => state.copy(count);
  }
  wrapError(e: any) {
    return new UserException('Could not load the count', { title: 'Error' });
  }
}
              | return new UserException('Could not load the count', { title: 'Error' }).withHardCause(e);           | e     |
      | in the wrapError of a persistor | 
abstract class MyPersistor extends Persistor<State> {
  wrapError(error: any) {
    return new UserException('Could not save your data.');
  }
}
                                                                                                                          | return new UserException('Could not save your data.').withHardCause(error);                          | error |
      | in globalWrapError              | 
const store = createStore<State>({
  initialState: new State(0),
  globalWrapError: (error: any) =>
    error instanceof TypeError ? new UserException('Something went wrong') : error,
});
                                                                               | error instanceof TypeError ? new UserException('Something went wrong').withHardCause(error) : error, | error |

  Scenario Outline: A UserException that keeps the error, or does not replace one, is not reported.
    Given {Case}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Case                                                                         | Code                                                                                                                                                                                                                                                                                                               |
      | A UserException with withHardCause                                           | 
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    throw new UserException('Please enter a valid number').withHardCause(error);
  }
}
                                                                                                                                  |
      | A UserException with the hardCause option                                    | 
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    throw new UserException('Please enter a valid number', { hardCause: error });
  }
}
                                                                                                                                 |
      | A UserException outside a catch or wrapError                                 | 
function parse(text: string) {
  if (text === '') throw new UserException('Please enter a number');
  return parseNumber(text);
}
                                                                                                                                                                                |
      | A catch without a parameter, or with a parameter starting with an underscore | 
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch {
    throw new UserException('Please enter a valid number');
  }
}

function parse2(text: string) {
  try {
    return parseNumber(text);
  } catch (_error) {
    throw new UserException('Please enter a valid number');
  }
}
 |
      | A UserException in a function declared inside the catch                      | 
function parse(text: string, onError: (show: () => void) => void) {
  try {
    return parseNumber(text);
  } catch (error) {
    onError(() => { throw new UserException('Please enter a valid number'); });
    return 0;
  }
}
                                                                                |
      | A UserException stored in a variable                                         | 
function parse(text: string) {
  try {
    return parseNumber(text);
  } catch (error) {
    const exception = new UserException('Please enter a valid number');
    throw exception.withHardCause(error);
  }
}
                                                                                                 |

  Scenario: If the error name is shadowed, the UserException is reported but not fixed.
    Given A catch clause with a UserException created inside a block that declares another variable with the same name as the error.
    When The code is linted.
    Then The UserException is reported, but there is no fix.

  Scenario: A UserException without a cause is not reported in tests.
    Given A test file with a UserException created in a catch clause, without a hardCause.
    When The code is linted.
    Then There are no reports.
