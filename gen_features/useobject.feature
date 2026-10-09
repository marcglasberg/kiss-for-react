Feature: useObject

  Scenario: useObject does not rebuild the component when other parts of the state change.
    Given A component that uses useObject to select the name and the age.
    When An action changes another part of the state.
    Then The component does not rebuild.
    And It still gets the same object.

  Scenario: useObject rebuilds the component when one of the selected values changes.
    Given A component that uses useObject to select the name and the age.
    When An action changes the age.
    Then The component rebuilds, with the new age.

  Scenario: useObject returns the same object while the selected values are the same.
    Given A component that uses useObject to select the name and the age.
    When The component rebuilds for another reason.
    Then useObject returns the same object as before.

  Scenario: useObject also works when the selector returns an array.
    Given A component that uses useObject to select the name and the age, as an array.
    When An action changes another part of the state.
    And Then an action changes the name.
    Then The component only rebuilds when the name changes.

  Scenario: useSelect with a selector that creates a new object renders once when the component mounts.
    Given A component that uses useSelect to select an object with the name and the age.
    When The component mounts.
    Then It renders once (it does not rebuild forever).

  Scenario: useSelect with a selector that creates a new object rebuilds for all state changes.
    Given A component that uses useSelect to select an object with the name and the age.
    When An action changes another part of the state.
    Then The component rebuilds anyway, since the selector creates a new object each time.
    And That is why useObject is needed.
