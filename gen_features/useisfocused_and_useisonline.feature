Feature: useIsFocused and useIsOnline

  Scenario Outline: A component shows whether the app is focused or online, and re-renders when it changes.
    Given A component that uses useIsFocused or useIsOnline.
    When The app loses focus or goes offline, and then is focused or online again.
    Then The component re-renders with the new value each time.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario: A change in one signal does not re-render a component that uses only the other.
    Given A component that uses useIsFocused only.
    When The app goes offline.
    Then The component does not re-render.

  Scenario: On the server, the app is always focused and online.
    Given A store that says the app is not focused and not online.
    When A component that uses useIsFocused and useIsOnline is rendered to a string.
    Then Both are true in the HTML.
