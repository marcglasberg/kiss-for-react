Feature: useDispatch onUnmount order

  Scenario Outline: When a component is replaced by one with another key, the old onUnmount runs before the new onMount.
    Given A component that uses useDispatch.
    And Its onMount selects its id, and its onUnmount clears the selection.
    And The component is mounted with key and id "A".
    When It is replaced by the same component with key and id "B".
    Then The onUnmount of "A" runs before the onMount of "B".
    And "B" stays selected.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: When a page is replaced by another page, the old onUnmount runs before the new onMount.
    Given Two pages that use useDispatch.
    And Their onMount selects their id, and their onUnmount clears the selection.
    And Page "A" is mounted.
    When Page "A" is replaced by page "B", as in a route switch.
    Then The onUnmount of "A" runs before the onMount of "B".
    And "B" stays selected.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario Outline: onUnmount runs as soon as the component unmounts.
    Given A component that uses useDispatch, mounted with id "A".
    And Its onUnmount clears the selection.
    When The component unmounts, inside a synchronous act.
    Then onUnmount has already run when the act finishes.
    And The selection is cleared.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: A component mounted next to another one, in StrictMode, calls onMount and onUnmount once.
    Given A page "A" that uses useDispatch, mounted in StrictMode.
    When A page "B" is mounted next to it.
    And Then both are unmounted.
    Then onMount and onUnmount are called once for each page.
