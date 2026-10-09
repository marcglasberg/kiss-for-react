Feature: Lint: demo files

  Scenario Outline: Each demo file shows its rules, each warning marked right above the line it underlines.
    Given The demo file {File}.
    When Its eslint-disable lines are removed, and it is linted with all the rules.
    Then Each mark has a warning of its rule, on the line below it.
    And Each warning is marked.
    And The marks say which quick fixes there are: automatic, and suggestions.
    And The eslint-disable lines at the top are exactly the rules the file shows.
    And With the eslint-disable lines, the file has no warnings at all.
    Examples: 
      | File             |
      | actions.ts       |
      | components.tsx   |
      | debugging.ts     |
      | dispatching.ts   |
      | errors.ts        |
      | naming.ts        |
      | reducers.ts      |
      | state-classes.ts |
      | state.ts         |
      | user.test.ts     |

  Scenario: Together, the demo files show all the rules of the plugin.
    Given All the demo files.
    When We collect the rules they mark.
    Then They are all the rules of the plugin.

  Scenario: The demo files compile.
    Given The demo files, and their tsconfig.json.
    When TypeScript checks them.
    Then There are no errors.
