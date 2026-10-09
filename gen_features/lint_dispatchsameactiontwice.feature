Feature: Lint: dispatch-same-action-twice

  Scenario Outline: Dispatching the same action object twice is an error.
    Given An action kept in a const.
    When It is dispatched twice, {How}.
    Then There is an error on the second dispatch, saying the action was already dispatched.
    And The suggestion dispatches a new action instead.
    Examples: 
      | How                                       | Code                                                                                                                                                                            | Fixed                                                            |
      | with store.dispatch                       | 
export function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  store.dispatch(action);
}                                                           | store.dispatch(new LoadUser('Mary'));                            |
      | with dispatch and dispatchAndWait         | 
export async function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  await store.dispatchAndWait(action);
}                                        | await store.dispatchAndWait(new LoadUser('Mary'));               |
      | with dispatchAll                          | 
export function run() {
  const action = new LoadUser('Mary');
  store.dispatch(action);
  store.dispatchAll([action, new LoadUser('Bill')]);
}                                | store.dispatchAll([new LoadUser('Mary'), new LoadUser('Bill')]); |
      | with the function returned by useDispatch | 
export function useLoad() {
  const dispatch = useDispatch();
  return () => {
    const action = new LoadUser('Mary');
    dispatch(action);
    dispatch(action);
  };
}     |     dispatch(new LoadUser('Mary'));                              |
      | inside an action, with this.dispatch      | 
class LoadTwice extends KissAction<State> {
  reduce() {
    const action = new LoadUser('Mary');
    this.dispatch(action);
    this.dispatch(action);
    return null;
  }
} | this.dispatch(new LoadUser('Mary'));                             |

  Scenario Outline: Dispatches that can't both run are not reported.
    Given An action kept in a const.
    When It is dispatched twice, but {Why}.
    Then There are no errors.
    Examples: 
      | Why                          | Code                                                                                                      |
      | in the two branches of an if | 
  if (fast) store.dispatch(action);
  else store.dispatch(action);                                       |
      | in the two branches of a ?:  | 
  fast ? store.dispatch(action) : store.dispatch(action);                                                |
      | in two cases of a switch     | 
  switch (fast) {
    case true: store.dispatch(action); break;
    default: store.dispatch(action);
  } |
      | in a try and its catch       | 
  try { store.dispatch(action); }
  catch { store.dispatch(action); }                                    |
      | the first one returns        | 
  if (fast) {
    store.dispatch(action);
    return;
  }
  store.dispatch(action);                      |

  Scenario Outline: Dispatches in different functions, or of new actions, are not reported.
    Given {Given}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Given                                                          | Code                                                                                                                                         |
      | An action in a const, dispatched once in each of two functions | 
const action = new LoadUser('Mary');
export const first = () => store.dispatch(action);
export const second = () => store.dispatch(action); |
      | A new action created for each dispatch                         | 
export function run() {
  store.dispatch(new LoadUser('Mary'));
  store.dispatch(new LoadUser('Mary'));
}                                   |

  Scenario: There is no suggestion when the new action would use other variables.
    Given An action created with a variable, and a different variable with the same name where it is dispatched again.
    When It is dispatched twice.
    Then There is an error, but no suggestion.

  Scenario: With type information, objects that are not Kiss actions are not reported.
    Given An event bus that dispatches its own event objects.
    When The same event is dispatched twice.
    Then With type information, there are no errors.
