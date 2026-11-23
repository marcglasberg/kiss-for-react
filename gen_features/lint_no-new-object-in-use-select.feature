Feature: Lint: no-new-object-in-use-select

  Scenario Outline: A useSelect whose selector returns a new object is an error, fixed with useObject.
    Given A component that uses useSelect with a selector that returns a new object.
    When The code is linted.
    Then There is an error in useSelect.
    And The fix replaces useSelect with useObject, and adds useObject to the import.
    And The fixed code compiles.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: If it was the only use of useSelect, the fix replaces it with useObject in the import too.
    Given A component that uses useSelect only once, with a selector that returns a new object.
    When The code is linted and fixed.
    Then The import has useObject instead of useSelect.

  Scenario Outline: Selectors that return a new array, or return a new object from a block, are also errors.
    Given A component that uses useSelect or useSelector with a selector that returns a new array or object.
    When The code is linted.
    Then There is an error.
    Examples: 
      | Selector                                                     | Hook        |
      | (state: State) => [state.name, state.age]                    | useSelect   |
      | (state: State) => { return { name: state.name }; }           | useSelect   |
      | (state: State) => ({ name: state.name }) as { name: string } | useSelect   |
      | function (state: State) { return [state.name]; }             | useSelect   |
      | (state: State) => ({ name: state.name })                     | useSelector |

  Scenario: A useSelect that returns a part of the state is fine.
    Given A component that uses useSelect with selectors that return parts of the state.
    When The code is linted.
    Then There are no errors.

  Scenario: A useSelect that does not come from Kiss is ignored.
    Given A component that uses a useSelect from another library, with a selector that returns a new object.
    When The code is linted.
    Then There are no errors.

  Scenario: If useObject is already imported, the fix uses it.
    Given A component that imports both useSelect and useObject (as "useObj").
    And It uses useSelect with a selector that returns a new object.
    When The code is linted and fixed.
    Then The fix replaces useSelect with useObj, and doesn't change the import.

  Scenario: With a namespace import, the fix uses the namespace.
    Given A component that imports Kiss as a namespace, and uses kiss.useSelect with a selector that returns a new object.
    When The code is linted and fixed.
    Then The fix replaces kiss.useSelect with kiss.useObject.

  Scenario: If the name useObject is already used for something else, there is no fix.
    Given A file with its own function called useObject.
    And A component that uses useSelect with a selector that returns a new object.
    When The code is linted.
    Then There is an error, but no fix.
