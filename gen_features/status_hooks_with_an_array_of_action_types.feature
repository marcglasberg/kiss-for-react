Feature: Status hooks with an array of action types

  Scenario: useIsWaiting with an array shows waiting while an action of any of the types runs.
    Given A component that calls useIsWaiting([LoadUser, LoadPosts]).
    When LoadUser runs, then LoadPosts also runs, then LoadUser finishes, then LoadPosts finishes.
    Then The component shows waiting while at least one of them runs.
    And It shows not waiting before they start, and after both finish.

  Scenario: An array written inline in the component does not cause extra renders.
    Given A component that passes an array written inline to the status hooks.
    When An action of a type that is not in the array starts and finishes.
    Then The component does not render again, since what the hooks return did not change.

  Scenario: useIsFailed and useExceptionFor with an array show the failure of any of the types.
    Given A component that calls useIsFailed([LoadUser, LoadPosts]) and useExceptionFor([LoadUser, LoadPosts]).
    When LoadPosts fails with a UserException.
    Then The component shows failed, and the exception of LoadPosts.
    And When LoadUser also fails, the component shows the exception of LoadUser, since it comes first in the array.

  Scenario: useClearExceptionFor with an array clears the failures of all the types in the array.
    Given A component that shows the failures of LoadUser and LoadPosts.
    And LoadUser and LoadPosts both failed.
    When The function returned by useClearExceptionFor is called with the array [LoadUser, LoadPosts].
    Then The component shows no failure.
    And The component rendered only once for the clear.

  Scenario Outline: All the status hooks accept one type, an array with one type, or an array with several types.
    Given A component that calls useIsWaiting, useIsFailed, useExceptionFor and useClearExceptionFor with {Argument}.
    When A LoadUser action runs and fails, and then the failure is cleared.
    Then The component shows waiting while LoadUser runs.
    And The component shows the failure and the exception of LoadUser after it fails.
    And The component shows no failure after the failure is cleared.
    Examples: 
      | Argument              |
      | LoadUser              |
      | [LoadUser]            |
      | [LoadUser, LoadPosts] |

  Scenario: The abort function of useStore accepts an array of types.
    Given A component that gets the abort function from useStore.
    And Actions of type LoadUser, LoadPosts and LoadComments are running.
    When The component calls abort with the array [LoadUser, LoadPosts].
    Then The LoadUser and LoadPosts actions are aborted.
    And The LoadComments action is not aborted.
