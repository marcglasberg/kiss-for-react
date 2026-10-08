Feature: Hooks return stable functions

  Scenario Outline: Hooks that return functions return the same function on every render.
    Given A component that calls a hook that returns a function (or the dispatchers).
    When The component re-renders because the state changed.
    Then The hook returns the same value it returned in the first render.
    Examples: 
      | Hook                  |
      | useDispatch           |
      | useDispatcher         |
      | useDispatchAndWait    |
      | useDispatchAndWaitAll |
      | useDispatchAll        |
      | useDispatchSync       |
      | useDispatchWhen       |
      | useClearExceptionFor  |
      | useStore              |

  Scenario: An effect that depends on the dispatch function runs only once.
    Given A component that dispatches an action in an effect.
    And The effect lists the dispatch function as a dependency.
    And The component selects the state the action changes.
    When The component is rendered.
    Then The effect runs once, and the action is dispatched once.
