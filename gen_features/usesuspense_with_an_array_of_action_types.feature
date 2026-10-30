Feature: useSuspense with an array of action types

  Scenario: useSuspense with an array suspends while an action of any of the types runs.
    Given A mounted component that calls useSuspense([LoadUser, LoadPosts]), inside a Suspense boundary.
    When LoadUser starts, then LoadPosts starts, then LoadUser finishes, then LoadPosts finishes.
    Then The boundary shows the fallback while at least one of them runs, and the code after the hook does not run.
    And When both finish, the component shows the new state.

  Scenario: useSuspense with an array throws the error of the first type in the array that failed.
    Given A mounted component that calls useSuspense([LoadUser, LoadPosts]), inside an error boundary.
    When LoadPosts fails, and then LoadUser also fails.
    Then The error boundary first shows the error of LoadPosts.
    And After the boundary is reset, it shows the error of LoadUser, since LoadUser comes first in the array.

  Scenario: An array written inline gets the same promise on every render, while the actions run.
    Given An action of type LoadUser is running.
    When The value that useSuspense reads is asked twice, with two different arrays that have the same types.
    Then Both times it is the same promise, as React's Suspense needs.
    And The promise resolves when the action finishes.

  Scenario Outline: useSuspense accepts one type, an array with one type, or an array with several types.
    Given A mounted component that calls useSuspense({Argument}), inside a Suspense boundary.
    When A LoadUser action starts, and then finishes.
    Then The boundary shows the fallback while the action runs.
    And When the action finishes, the component shows the new state.
    Examples: 
      | Argument              |
      | LoadUser              |
      | [LoadUser]            |
      | [LoadUser, LoadPosts] |
