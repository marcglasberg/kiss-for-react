Feature: Lint: throw-in-error-observer

  Scenario Outline: A throw in errorObserver is reported, and fixed by returning the error.
    Given A store whose errorObserver {How}.
    When The code is linted.
    Then The throw is reported.
    And The fix changes throw to return, and the fixed code compiles.
    Examples: 
      | How                                                                         | Code                                                                                                                                                                                                                                                                             | Fixed                                                                                              |
      | is an arrow function given to createStore                                   | 
const store = createStore<State>({
  initialState: new State(0),
  errorObserver: ({ error }) => {
    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
    return error;
  },
});
                                            | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a method given to new Store                                              | 
const store = new Store<State>({
  initialState: new State(0),
  errorObserver({ error }) {
    if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
    return error;
  },
});
                                                   | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a function declared in the same file, and given by name                  | 
function errorObserver({ error }: { error: any }) {
  if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
  return error;
}

const store = createStore<State>({ initialState: new State(0), errorObserver });
                    | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |
      | is a const arrow function declared in the same file, and given by reference | 
const observeErrors = ({ error }: { error: any }) => {
  if (error instanceof NetworkError) throw new UserException('No connection').withHardCause(error);
  return error;
};

const store = createStore<State>({ initialState: new State(0), errorObserver: observeErrors });
 | if (error instanceof NetworkError) return new UserException('No connection').withHardCause(error); |

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
      | Where                                                            | Code                                                                                                                                                                                                                                     |
      | A throw caught by a try in errorObserver                         | 
const store = createStore<State>({
  initialState: new State(0),
  errorObserver: ({ error }) => {
    try {
      if (error === null) throw new Error('No error');
    } catch (e) {
      return e;
    }
    return error;
  },
});
 |
      | A throw in a function inside errorObserver                       | 
const store = createStore<State>({
  initialState: new State(0),
  errorObserver: ({ error }) => {
    const check = () => { throw new Error('Never called'); };
    return error;
  },
});
                                            |
      | A throw in a function called errorObserver, not given to a store | 
const options = {
  errorObserver: ({ error }: { error: any }) => { throw error; },
};
                                                                                                                                                 |
