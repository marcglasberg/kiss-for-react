Feature: Hooks with a changing selector

  Scenario: useSelect uses the new selector when the component re-renders with new props.
    Given A component that selects the item with the id it gets as a prop.
    And It is rendered with id 0, so it shows the first item.
    When It is re-rendered with id 1.
    Then It shows the second item.

  Scenario: After the selector changes, state changes are checked with the new selector.
    Given A component that selects the item with the id it gets as a prop.
    And It was rendered with id 0, and then re-rendered with id 1.
    When The item with id 1 changes in the state.
    And Later, the item with id 0 changes in the state.
    Then The component shows the new value of item 1.
    And It keeps showing it after item 0 changes.

  Scenario: useSelect shows the right value after switching back to a selector whose value changed meanwhile.
    Given A component rendered with id 0, then re-rendered with id 1.
    And While it shows id 1, the item with id 0 changes in the state.
    When It is re-rendered with id 0 again.
    Then It shows the new value of item 0.

  Scenario: useIsFailed and useExceptionFor use the new action type when it changes.
    Given Action type A failed, and action type B did not.
    And A component shows if type A failed, and its error.
    When It is re-rendered for type B.
    Then It shows that type B did not fail, and has no error.
    And When type B fails later, it shows that, with the error of B.

  Scenario: useIsWaiting uses the new action type when it changes.
    Given Action type A is running, and action type B is not.
    And A component shows if type A is running.
    When It is re-rendered for type B.
    Then It shows that type B is not running.
    And When type B starts later, it shows that it is running.
