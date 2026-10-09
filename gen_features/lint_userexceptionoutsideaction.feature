Feature: Lint: user-exception-outside-action

  Scenario: A UserException thrown in an event handler of a component is reported.
    Given A component that uses useDispatch.
    And An event handler of the component throws a UserException.
    When The code is linted (with or without type information).
    Then The throw is reported.
    And The suggestion dispatches a UserExceptionAction instead, and imports it.
    And The suggested code compiles.

  Scenario: A UserException thrown in an effect of a hook is reported.
    Given A hook whose useEffect callback throws a UserException, as its last statement.
    And The hook uses useDispatch.
    When The code is linted.
    Then The throw is reported.
    And The suggestion dispatches a UserExceptionAction, without a return, and the code compiles.

  Scenario: A UserException thrown in the after method of an action is reported.
    Given An action whose after method throws a UserException.
    When The code is linted (with or without type information).
    Then The throw is reported, saying Kiss ignores errors thrown in after.
    And The suggestion dispatches a UserExceptionAction with this.dispatch, and the code compiles.

  Scenario Outline: Without a dispatch function, or with more than a message, there is no suggestion.
    Given A component {Case}.
    When The code is linted.
    Then The throw is reported, without a suggestion.
    Examples: 
      | Case                                                              | Code                                                                                                                                                                                                                                                                  |
      | whose event handler throws, but which has no dispatch function    | 
export function Counter() {
  const onSave = () => {
    throw new UserException('Please enter a valid number');
  };
  return <button onClick={onSave}>Save</button>;
}
                                                                                            |
      | that throws while rendering, where dispatching would be wrong too | 
export const Counter = ({ count }: { count: number }) => {
  const dispatch = useDispatch();
  if (count < 0) throw new UserException('Invalid count');
  return <div>{count}</div>;
};
                                                                             |
      | whose event handler throws a UserException with a title           | 
export function Counter() {
  const dispatch = useDispatch();
  const onSave = () => {
    throw new UserException('Please enter a valid number', { title: 'Invalid' });
  };
  return <button onClick={onSave}>Save</button>;
}
                                    |
      | whose event handler throws, and returns a value elsewhere         | 
export function Counter() {
  const dispatch = useDispatch();
  const parse = (text: string) => {
    if (text === '') throw new UserException('Please enter a number');
    return Number(text);
  };
  return <button onClick={() => parse('1')}>Save</button>;
}
 |

  Scenario Outline: A UserException thrown where Kiss shows it, or that may be called from an action, is not reported.
    Given A UserException thrown {Where}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Where                                                           | Code                                                                                                                                                                                                                                                                                                                                                                    |
      | in reduce, before and wrapError of an action                    | 
class Check extends KissAction<State> {
  before() { if (this.state.count < 0) throw new UserException('Invalid count'); }
  reduce() {
    if (this.state.count > 10) throw new UserException('Too many');
    return this.state.copy(this.state.count + 1);
  }
  wrapError(error: any) { throw new UserException('Failed').withHardCause(error); }
}
               |
      | in plain helper functions, which may be called from actions     | 
function parseCount(text: string) {
  const count = Number(text);
  if (isNaN(count)) throw new UserException('Please enter a valid number');
  return count;
}

const validate = (count: number) => {
  if (count < 0) throw new UserException('Invalid count');
};

function Validate(count: number) {
  if (count < 0) throw new UserException('Invalid count');
}
 |
      | in an event handler, inside a try that catches it               | 
export function Counter() {
  const [error, setError] = useState('');
  const onSave = () => {
    try {
      throw new UserException('Please enter a valid number');
    } catch (e) {
      setError(String(e));
    }
  };
  return <button onClick={onSave}>{error}</button>;
}
                                                                                  |
      | in the after method, inside a function that is not called there | 
class Increment extends KissAction<State> {
  reduce() { return this.state.copy(this.state.count + 1); }
  after() {
    const check = () => { throw new UserException('Too many'); };
  }
}
                                                                                                                                                                          |

  Scenario: Other errors thrown in components are not reported.
    Given A component whose event handler throws an Error, which is not a UserException.
    When The code is linted.
    Then There are no reports.
