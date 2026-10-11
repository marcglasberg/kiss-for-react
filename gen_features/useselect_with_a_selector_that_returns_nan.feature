Feature: useSelect with a selector that returns NaN

  Scenario Outline: A selector that returns NaN does not re-render the component when other parts of the state change.
    Given The state has `a` equal to NaN.
    And A component selects `a`.
    When Two actions change other parts of the state, but not `a`.
    Then The component is not rendered again.
    Examples: 
      | Hook        |
      | useSelect   |
      | useSelector |

  Scenario: A selector that returns NaN does not re-render the component when the state changes before it subscribes.
    Given The state has `a` equal to NaN.
    And A component selects `a`.
    And Its child changes another part of the state when it mounts, before the component subscribes to the store.
    When The component is rendered.
    Then The component is rendered only once.

  Scenario: A selector re-renders the component when the selected value changes to NaN.
    Given The state has `a` equal to 1.
    And A component selects `a`.
    When An action changes `a` to NaN.
    Then The component is rendered again, and shows NaN.

  Scenario: A selector re-renders the component when the selected value changes from NaN.
    Given The state has `a` equal to NaN.
    And A component selects `a`.
    When An action changes `a` to 1.
    Then The component is rendered again, and shows 1.

  Scenario: Selected values are compared like React compares them, so 0 and -0 are different values.
    Given The state has `a` equal to 0.
    And A component selects `a`.
    When An action changes `a` to -0.
    Then The component is rendered again, and shows -0.
