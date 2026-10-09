Feature: Lint: dispatch-sync-async-action

  Scenario Outline: dispatchSync of an async action is an error.
    Given An action that is async because {Reason}.
    When It is dispatched with store.dispatchSync.
    Then There is an error, saying why the action is async.
    And The suggestions replace dispatchSync with dispatch or dispatchAndWait.
    Examples: 
      | Reason                             | Action            | Message                    | Type information |
      | its reduce is async                | AsyncReduce       | `reduce` returns a promise | true             |
      | its reduce is async                | AsyncReduce       | `reduce` returns a promise | false            |
      | its before is async                | AsyncBefore       | `before` returns a promise | true             |
      | its before is async                | AsyncBefore       | `before` returns a promise | false            |
      | it sets checkInternet              | WithCheckInternet | sets `checkInternet`       | true             |
      | it sets checkInternet              | WithCheckInternet | sets `checkInternet`       | false            |
      | its superclass has an async before | SubclassOfAsync   | `before` returns a promise | true             |
      | its superclass has an async before | SubclassOfAsync   | `before` returns a promise | false            |

  Scenario: dispatchSync of a sync action is fine.
    Given A sync action.
    When It is dispatched with store.dispatchSync.
    Then There are no errors.

  Scenario Outline: The action can be in a variable, or dispatched with the function from useDispatchSync.
    Given An async action.
    When It is dispatched {How}.
    Then There is an error.
    Examples: 
      | How                                           | Code                                                                                                                    |
      | from a const variable                         | 
const action = new AsyncReduce();
store.dispatchSync(action);                                                          |
      | with the function returned by useDispatchSync | 
export function Button() {
  const dispatchSync = useDispatchSync();
  return () => dispatchSync(new AsyncReduce());
} |

  Scenario: With type information, the action's type is enough to know it's async.
    Given A function that gets an action typed as an async action class, and dispatches it with dispatchSync.
    When The code is linted.
    Then With type information, there is an error.
    And Without type information, there is no error, since the action's class is unknown.

  Scenario: An action typed only as KissAction is not reported.
    Given A function that gets an action typed as KissAction, and dispatches it with dispatchSync.
    When The code is linted with type information.
    Then There are no errors, since the action could be sync.
