Feature: Lint: dispatch-same-action-twice

  Scenario Outline: Dispatching the same action object twice is an error.
    Given An action kept in a const.
    When It is dispatched twice, {How}.
    Then There is an error on the second dispatch, saying the action was already dispatched.
    And The suggestion dispatches a new action instead.
    Examples: 
      | How                                       | Code                                                                                                                                                                                    | Fixed                                                            |
      | with store.dispatch                       | \nexport function run() {\n  const action = new LoadUser('Mary');\n  store.dispatch(action);\n  store.dispatch(action);\n}                                                              | store.dispatch(new LoadUser('Mary'));                            |
      | with dispatch and dispatchAndWait         | \nexport async function run() {\n  const action = new LoadUser('Mary');\n  store.dispatch(action);\n  await store.dispatchAndWait(action);\n}                                           | await store.dispatchAndWait(new LoadUser('Mary'));               |
      | with dispatchAll                          | \nexport function run() {\n  const action = new LoadUser('Mary');\n  store.dispatch(action);\n  store.dispatchAll([action, new LoadUser('Bill')]);\n}                                   | store.dispatchAll([new LoadUser('Mary'), new LoadUser('Bill')]); |
      | with the function returned by useDispatch | \nexport function useLoad() {\n  const dispatch = useDispatch();\n  return () => {\n    const action = new LoadUser('Mary');\n    dispatch(action);\n    dispatch(action);\n  };\n}     |     dispatch(new LoadUser('Mary'));                              |
      | inside an action, with this.dispatch      | \nclass LoadTwice extends KissAction<State> {\n  reduce() {\n    const action = new LoadUser('Mary');\n    this.dispatch(action);\n    this.dispatch(action);\n    return null;\n  }\n} | this.dispatch(new LoadUser('Mary'));                             |

  Scenario Outline: Dispatches that can't both run are not reported.
    Given An action kept in a const.
    When It is dispatched twice, but {Why}.
    Then There are no errors.
    Examples: 
      | Why                          | Code                                                                                                          |
      | in the two branches of an if | \n  if (fast) store.dispatch(action);\n  else store.dispatch(action);                                         |
      | in the two branches of a ?:  | \n  fast ? store.dispatch(action) : store.dispatch(action);                                                   |
      | in two cases of a switch     | \n  switch (fast) {\n    case true: store.dispatch(action); break;\n    default: store.dispatch(action);\n  } |
      | in a try and its catch       | \n  try { store.dispatch(action); }\n  catch { store.dispatch(action); }                                      |
      | the first one returns        | \n  if (fast) {\n    store.dispatch(action);\n    return;\n  }\n  store.dispatch(action);                     |

  Scenario Outline: Dispatches in different functions, or of new actions, are not reported.
    Given {Given}.
    When The code is linted.
    Then There are no errors.
    Examples: 
      | Given                                                          | Code                                                                                                                                            |
      | An action in a const, dispatched once in each of two functions | \nconst action = new LoadUser('Mary');\nexport const first = () => store.dispatch(action);\nexport const second = () => store.dispatch(action); |
      | A new action created for each dispatch                         | \nexport function run() {\n  store.dispatch(new LoadUser('Mary'));\n  store.dispatch(new LoadUser('Mary'));\n}                                  |

  Scenario: There is no suggestion when the new action would use other variables.
    Given An action created with a variable, and a different variable with the same name where it is dispatched again.
    When It is dispatched twice.
    Then There is an error, but no suggestion.

  Scenario: With type information, objects that are not Kiss actions are not reported.
    Given An event bus that dispatches its own event objects.
    When The same event is dispatched twice.
    Then With type information, there are no errors.
