Feature: useStoreEffect with onFocus, onBlur, onOnline and onOffline

  Scenario Outline: onFocus and onOnline are called when the app is focused or online again, not on mount.
    Given A store that is ready, and the app is focused and online.
    And A component that uses useStoreEffect with onFocus, onBlur, onOnline and onOffline.
    When The component mounts.
    Then None of them is called.
    And When the app loses focus, onBlur is called. When it is focused again, onFocus is called.
    And When the app goes offline, onOffline is called. When it is online again, onOnline is called.
    And The actions they dispatch change the state.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: The callbacks are called only on transitions.
    Given A component with onFocus and onOnline, and the app is focused and online.
    When The store is told again that the app is focused and online.
    Then onFocus and onOnline are not called.

  Scenario Outline: Only onFocus can be given, or only onOnline, and the other transitions are ignored.
    Given A component that gives only one of the callbacks.
    When All four transitions happen.
    Then Only that callback is called, once.
    Examples: 
      | Callback  | Expected |
      | onFocus   | focus    |
      | onBlur    | blur     |
      | onOnline  | online   |
      | onOffline | offline  |

  Scenario: A component without these callbacks does not start the focus and online sources.
    Given A store with custom focus and online sources.
    And A component that uses useStoreEffect with onMount only.
    When The component mounts.
    Then The sources are not started.
    And A component with onFocus starts only the focus source, and one with onOnline only the online source.

  Scenario: The callbacks are not called after the component unmounts.
    Given A component with onFocus and onOnline that mounted.
    When The component unmounts, and then the app is focused and online again.
    Then onFocus and onOnline are not called.

  Scenario: The callbacks are not called before the store is ready.
    Given A store whose persisted state is still being read.
    And A component with onMount and onFocus.
    When The app loses focus and is focused again, before the store is ready.
    Then onFocus is not called.
    And After the store is ready, onMount is called, and the next focus calls onFocus.

  Scenario: The callbacks are the ones from the latest render, so they see its values.
    Given A component whose onFocus reads a prop.
    When The component re-renders with another prop value, and then the app is focused again.
    Then onFocus sees the new prop value.

  Scenario: A callback can be added in a later render, and then works.
    Given A component that gives onFocus only when a prop says so.
    When It mounts without onFocus, re-renders with it, and then the app is focused again.
    Then onFocus is called.

  Scenario: A transition that happens while the tab is hidden is seen when the component mounts.
    Given The app is not focused.
    And A component with onFocus mounts.
    When The app is focused.
    Then onFocus is called, since the app went from not focused to focused while the component was mounted.
