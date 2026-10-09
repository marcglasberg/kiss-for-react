Feature: Lint: then-on-dispatch-and-wait

  Scenario Outline: A then callback that ignores the status of dispatchAndWait is a warning, with a suggestion to check it.
    Given A component that dispatches with the function from useDispatchAndWait.
    And It navigates in a then callback, without a parameter.
    When The code is linted.
    Then There is a warning in then.
    And The suggestion adds a status parameter, and only navigates if status.isCompletedOk.
    And The code with the suggestion compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: The promise of any kind of dispatchAndWait is checked.
    Given Code that calls then on {Call}, with a callback that ignores the status.
    When The code is linted.
    Then There is a warning.
    Examples: 
      | Call                                       | Code                                                                                                                                                                 |
      | store.dispatchAndWait                      | 
store.dispatchAndWait(new SaveUser()).then(() => navigate('/home'));                                                                                                |
      | useStore().dispatchAndWait                 | 
export function SaveButton() {
  const kiss = useStore();
  return <button onClick={() => kiss.dispatchAndWait(new SaveUser()).then(() => navigate('/home'))} />;
} |
      | this.dispatchAndWait, in an action         | 
class SaveAndGo extends KissAction<State> {
  reduce() {
    this.dispatchAndWait(new SaveUser()).then(() => navigate('/home'));
    return null;
  }
}             |
      | a renamed function from useDispatchAndWait | 
export function SaveButton() {
  const save = useDispatchAndWait();
  return <button onClick={() => save(new SaveUser()).then(() => navigate('/home'))} />;
}       |

  Scenario: The suggestion wraps a block body, and uses the parameter that is not read.
    Given A then callback with a status parameter that it does not read, and a block body.
    When The code is linted.
    Then There is a warning.
    And The suggestion wraps the body in an if that checks the parameter, indenting it.

  Scenario Outline: Callbacks that use the status, or ignore it on purpose, are fine.
    Given Code that {How}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | How                                          | Code                                                                                                      |
      | checks the status in then                    | store.dispatchAndWait(new SaveUser()).then((status) => { if (status.isCompletedOk) navigate('/home'); }); |
      | names the parameter _status                  | store.dispatchAndWait(new SaveUser()).then((_status) => navigate('/home'));                               |
      | uses finally                                 | store.dispatchAndWait(new SaveUser()).finally(() => navigate('/home'));                                   |
      | uses then on dispatchAndWaitAll              | store.dispatchAndWaitAll([new SaveUser()]).then(() => navigate('/home'));                                 |
      | uses then on a promise that is not from Kiss | Promise.resolve(1).then(() => navigate('/home'));                                                         |

  Scenario: With type information, a dispatchAndWait that does not return an action status is ignored.
    Given A dispatchAndWait function that is not from Kiss, and returns a promise of a number.
    When Code calls then on it, with a callback without parameters.
    Then With type information, there are no warnings.
