Feature: Check internet in different environments

  Scenario: In React Native, the default internet check assumes the device is online.
    Given A React Native environment, which has `window` and `navigator`, but no `navigator.onLine`.
    And An action with checkInternet turned on, and no hasInternet override.
    When The action is dispatched.
    Then The action completes successfully.
    And The state is changed by the reducer.

  Scenario Outline: In the browser, the default internet check uses navigator.onLine.
    Given A browser environment where navigator.onLine is a boolean.
    And An action with checkInternet turned on, and no hasInternet override.
    When The action is dispatched.
    Then It succeeds when online, and fails with "No Internet" when offline.
    Examples: 
      | onLine | succeeds |
      | true   | true     |
      | false  | false    |

  Scenario: Without a window object, the default internet check assumes the device is online.
    Given An environment with no `window`, like Node.js.
    And An action with checkInternet turned on, and no hasInternet override.
    When The action is dispatched.
    Then The action completes successfully.
