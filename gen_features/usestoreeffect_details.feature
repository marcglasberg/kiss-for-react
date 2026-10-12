Feature: useStoreEffect details

  Scenario: onMount and onUnmount run at the same time as the useEffects around them.
    Given A component with a useEffect, then a useStoreEffect with onMount and onUnmount, then another useEffect.
    When The component mounts, and then unmounts.
    Then onMount runs after the setup of the first useEffect, and before the setup of the second.
    And onUnmount runs after the cleanup of the first useEffect, and before the cleanup of the second.

  Scenario Outline: Two useStoreEffect in the same component run in the order they are called.
    Given A component that calls useStoreEffect twice, each with onMount and onUnmount.
    When The component mounts, and then unmounts.
    Then The first onMount runs before the second one.
    And The first onUnmount runs before the second one.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: An async onMount is not awaited, so onUnmount may run before it finishes.
    Given A component that uses useStoreEffect with an async onMount, and onUnmount.
    And onMount waits for something that is not finished yet.
    When The component unmounts.
    Then onUnmount runs right away, while onMount is still waiting.
    And onMount finishes later.

  Scenario Outline: A component that unmounts in the same synchronous run as its mount gets onUnmount a microtask later.
    Given A component that uses useStoreEffect with onMount and onUnmount.
    When The component mounts and unmounts in the same synchronous run, with no microtask in between.
    Then onMount is called, but onUnmount is not called yet.
    And onUnmount is called after a microtask.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: Hiding and showing the component with Activity calls onUnmount, and then onMount again.
    Given A component that uses useStoreEffect with onMount and onUnmount, inside an Activity.
    When The Activity hides the component, and then shows it again.
    Then onUnmount is called when the component is hidden.
    And onMount is called again when the component is shown.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: The deps are compared like React does: each value with Object.is.
    Given A component that uses useStoreEffect with deps and onDepsChange.
    And It is mounted with the old deps.
    When It re-renders with the new deps (a new array, when it is an array).
    Then onDepsChange is called only when the deps changed, with the old deps.
    Examples: 
      | Old deps  | New deps  | onDepsChange is called |
      | NaN       | NaN       | false                  |
      | 0         | -0        | true                   |
      | "a"       | "a"       | false                  |
      | "a"       | ["a"]     | true                   |
      | [1, 2]    | [1, 2]    | false                  |
      | [1, 2]    | [1, 2, 3] | true                   |
      | undefined | "a"       | true                   |

  Scenario Outline: An error thrown by onMount, onDepsChange or onUnmount goes to the nearest error boundary.
    Given A component inside an error boundary.
    And The component uses useStoreEffect, and one of its callbacks throws an error.
    When The callback runs.
    Then The error boundary gets the error.
    And If onMount threw, onUnmount is not called later.
    Examples: 
      | Callback     |
      | onMount      |
      | onDepsChange |
      | onUnmount    |

  Scenario Outline: The promise returned by an async onMount, onDepsChange or onUnmount is not handled.
    Given A component that uses useStoreEffect with async onMount, onDepsChange and onUnmount.
    When The component mounts, its deps change, and it unmounts.
    Then The promises they return are not awaited, and their errors are not caught.
    And So, if one of them rejects, it is an unhandled promise rejection, as in a useEffect.
    Examples: 
      | Callback     |
      | onMount      |
      | onDepsChange |
      | onUnmount    |
