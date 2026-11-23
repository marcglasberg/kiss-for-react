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
      | Case                                                              | Code                                                                                                                                                                                                                                                                           |
      | whose event handler throws, but which has no dispatch function    | \nexport function Counter() {\n  const onSave = () => {\n    throw new UserException('Please enter a valid number');\n  };\n  return <button onClick={onSave}>Save</button>;\n}\n                                                                                              |
      | that throws while rendering, where dispatching would be wrong too | \nexport const Counter = ({ count }: { count: number }) => {\n  const dispatch = useDispatch();\n  if (count < 0) throw new UserException('Invalid count');\n  return <div>{count}</div>;\n};\n                                                                                |
      | whose event handler throws a UserException with a title           | \nexport function Counter() {\n  const dispatch = useDispatch();\n  const onSave = () => {\n    throw new UserException('Please enter a valid number', { title: 'Invalid' });\n  };\n  return <button onClick={onSave}>Save</button>;\n}\n                                     |
      | whose event handler throws, and returns a value elsewhere         | \nexport function Counter() {\n  const dispatch = useDispatch();\n  const parse = (text: string) => {\n    if (text === '') throw new UserException('Please enter a number');\n    return Number(text);\n  };\n  return <button onClick={() => parse('1')}>Save</button>;\n}\n |

  Scenario Outline: A UserException thrown where Kiss shows it, or that may be called from an action, is not reported.
    Given A UserException thrown {Where}.
    When The code is linted.
    Then There are no reports.
    Examples: 
      | Where                                                           | Code                                                                                                                                                                                                                                                                                                                                                                                  |
      | in reduce, before and wrapError of an action                    | \nclass Check extends KissAction<State> {\n  before() { if (this.state.count < 0) throw new UserException('Invalid count'); }\n  reduce() {\n    if (this.state.count > 10) throw new UserException('Too many');\n    return this.state.copy(this.state.count + 1);\n  }\n  wrapError(error: any): never { throw new UserException('Failed').withHardCause(error); }\n}\n             |
      | in plain helper functions, which may be called from actions     | \nfunction parseCount(text: string) {\n  const count = Number(text);\n  if (isNaN(count)) throw new UserException('Please enter a valid number');\n  return count;\n}\n\nconst validate = (count: number) => {\n  if (count < 0) throw new UserException('Invalid count');\n};\n\nfunction Validate(count: number) {\n  if (count < 0) throw new UserException('Invalid count');\n}\n |
      | in an event handler, inside a try that catches it               | \nexport function Counter() {\n  const [error, setError] = useState('');\n  const onSave = () => {\n    try {\n      throw new UserException('Please enter a valid number');\n    } catch (e) {\n      setError(String(e));\n    }\n  };\n  return <button onClick={onSave}>{error}</button>;\n}\n                                                                                    |
      | in the after method, inside a function that is not called there | \nclass Increment extends KissAction<State> {\n  reduce() { return this.state.copy(this.state.count + 1); }\n  after() {\n    const check = () => { throw new UserException('Too many'); };\n  }\n}\n                                                                                                                                                                                 |

  Scenario: Other errors thrown in components are not reported.
    Given A component whose event handler throws an Error, which is not a UserException.
    When The code is linted.
    Then There are no reports.
