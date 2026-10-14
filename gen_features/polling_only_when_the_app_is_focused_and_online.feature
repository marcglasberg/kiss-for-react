Feature: Polling only when the app is focused and online

  Scenario Outline: By default, polling does not tick while the app is not focused, or not online.
    Given An action that polls every 100 millis, and is polling.
    When The app loses focus (or goes offline).
    Then The ticks that come due do not run.
    And When the app is focused (or online) again, the tick that was due runs right away.
    And Then the polling goes on, every 100 millis.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: If the app is focused again before a tick is due, the tick runs at its normal time.
    Given An action that polls every 100 millis, and is polling.
    When The app loses focus and is focused again, 50 millis after the last tick.
    Then The next tick runs at its normal time, 100 millis after the last tick, not right away.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: With pollOnlyWhenFocused false, polling ticks while the app is not focused.
    Given An action that polls every 100 millis, with pollOnlyWhenFocused false (or pollOnlyWhenOnline false).
    When The app loses focus (or goes offline).
    Then The ticks keep running.
    Examples: 
      | Signal | Options         |
      | focus  | [object Object] |
      | online | [object Object] |

  Scenario: Each option only looks at its own signal.
    Given An action with pollOnlyWhenFocused false, but pollOnlyWhenOnline true (the default).
    When The app loses focus.
    Then The ticks keep running.
    And When the app goes offline, the ticks stop.

  Scenario: When both are required, a tick waits until the app is focused AND online.
    Given An action that polls, and the app is not focused and not online.
    When A tick comes due, and then the app is focused again, but is still offline.
    Then The tick does not run.
    And When the app is online again, the tick runs.

  Scenario Outline: The immediate run of Poll.start and Poll.runNowAndRestart is not affected.
    Given The app is not focused (or not online).
    When An action is dispatched with Poll.start, and later with Poll.runNowAndRestart.
    Then It runs right away, both times.
    And But the ticks wait for the app to be focused (or online) again.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario Outline: Poll.stop while a tick is waiting for the app to be focused cancels that tick.
    Given An action that is polling, and a tick is waiting for the app to be focused (or online).
    When The action is dispatched with Poll.stop, and then the app is focused (or online) again.
    Then The tick does not run, and there are no more ticks.
    Examples: 
      | Signal |
      | focus  |
      | online |

  Scenario: Poll.runNowAndRestart while a tick is waiting replaces that tick.
    Given An action that is polling, and a tick is waiting for the app to be focused.
    When The action is dispatched with Poll.runNowAndRestart, and then the app is focused again.
    Then The action ran once, for the Poll.runNowAndRestart, and the waiting tick is dropped.
    And The polling goes on from the restart.

  Scenario Outline: Clearing the internal action props, or disposing the store, cancels the waiting ticks.
    Given An action that is polling, and a tick is waiting for the app to be focused.
    When clearInternalActionProps is called (or the store is disposed), and then the app is focused again.
    Then The tick does not run.
    Examples: 
      | How                      |
      | clearInternalActionProps |
      | dispose                  |

  Scenario: A polling action without these options does not make the store listen to the focus and online sources.
    Given A store with custom focus and online sources.
    And An action that polls, with pollOnlyWhenFocused false and pollOnlyWhenOnline false.
    When It polls for a while.
    Then The sources are never started.
    And With the defaults, the sources are started by the first tick.

  Scenario: Where the store cannot know if the app is focused or online, polling never pauses.
    Given A store in Node, with no document and no navigator, and an action that polls with the defaults.
    When It polls for a while.
    Then Every tick runs, since the app counts as focused and online.

  Scenario Outline: Invalid pollOnlyWhenFocused or pollOnlyWhenOnline values make the dispatch throw.
    Given An action that polls, with a non-boolean value in one of the options.
    When The action is dispatched.
    Then The dispatch throws a StoreException.
    Examples: 
      | Option              |
      | pollOnlyWhenFocused |
      | pollOnlyWhenOnline  |
