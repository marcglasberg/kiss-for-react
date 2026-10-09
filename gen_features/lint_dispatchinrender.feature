Feature: Lint: dispatch-in-render

  Scenario Outline: Dispatching while a component renders is a warning.
    Given A component that dispatches {How}, in its body.
    When The code is linted.
    Then There is a warning in the dispatch.
    Examples: 
      | How                                             | Code                                                                                    | Callee              |
      | with the function from useDispatch              | const dispatch = useDispatch();
  dispatch(new LoadUser());                             | dispatch            |
      | with the function from useDispatchAndWait       | const dispatchAndWait = useDispatchAndWait();
  void dispatchAndWait(new LoadUser());   | dispatchAndWait     |
      | with useStore                                   | const kiss = useStore();
  kiss.dispatch(new LoadUser());                               | kiss.dispatch       |
      | with useStore directly                          | useStore().dispatch(new LoadUser());                                                    | useStore().dispatch |
      | with a store created in the same file           | store.dispatch(new LoadUser());                                                         | store.dispatch      |
      | inside an if                                    | const dispatch = useDispatch();
  if (props.id) dispatch(new LoadUser());               | dispatch            |
      | in a JSX attribute, instead of an event handler | const dispatch = useDispatch();
  return <button onClick={dispatch(new LoadUser())} />; | dispatch            |
      | in a function called right away                 | const dispatch = useDispatch();
  (() => dispatch(new LoadUser()))();                   | dispatch            |

  Scenario Outline: Arrow function components, memo components and custom hooks are checked too.
    Given A {Kind} that dispatches in its body.
    When The code is linted.
    Then There is a warning.
    Examples: 
      | Kind                      | Code                                                                                                          |
      | arrow function component  | 
export const User = () => {
  const dispatch = useDispatch();
  dispatch(new LoadUser());
  return <p />;
}; |
      | component wrapped in memo | 
export const User = memo(function () {
  store.dispatch(new LoadUser());
  return <p />;
});                 |
      | custom hook               | 
export function useUser() {
  const dispatch = useDispatch();
  dispatch(new LoadUser());
}                  |

  Scenario: Dispatches in event handlers, effects, useDispatch options and other closures are fine.
    Given A component that dispatches in an event handler, an effect, the onMount option of useDispatch, and a callback.
    And It also uses the dispatch of React's useReducer in its body.
    When The code is linted.
    Then There are no warnings.
    And The code compiles.

  Scenario: Functions that are not components are not checked.
    Given A function with a lowercase name that dispatches, and does not return JSX.
    When The code is linted.
    Then There are no warnings.

  Scenario: A store imported from another file is only recognized with type information.
    Given A component that dispatches in its body, with a store imported from another file.
    When The code is linted.
    Then With type information, there is a warning.
    And Without type information, there is no warning, since the store is not known.
