Feature: Lint: event-name-suffix

  Scenario Outline: Event fields named with the Evt suffix are fine.
    Given A state class whose event fields end with Evt: properties, parameter properties, with and without a declared type.
    When The code is linted, with or without type information.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: An event field without the Evt suffix is a warning, with a suggested name.
    Given A class with an event field (Evt or EvtState) whose name doesn't end with Evt.
    When The code is linted, with or without type information.
    Then There is a warning on the field name, suggesting the name with the Evt suffix.
    Examples: 
      | Type information | Field                                  | Name             | Suggestion     |
      | true             | readonly scrollToTop: Evt              | scrollToTop      | scrollToTopEvt |
      | false            | readonly scrollToTop: Evt              | scrollToTop      | scrollToTopEvt |
      | true             | readonly changeText: Evt<string>       | changeText       | changeTextEvt  |
      | true             | readonly pulse: EvtState<number>       | pulse            | pulseEvt       |
      | true             | readonly focus: Evt | null             | focus            | focusEvt       |
      | true             | readonly openDialog = Evt.spent()      | openDialog       | openDialogEvt  |
      | false            | readonly closeDialog = new Evt()       | closeDialog      | closeDialogEvt |
      | true             | readonly highlight = new EvtState('x') | highlight        | highlightEvt   |
      | true             | readonly scrollToTopEvent: Evt         | scrollToTopEvent | scrollToTopEvt |
      | true             | readonly event: Evt                    | event            | eventEvt       |

  Scenario Outline: Event parameter properties without the Evt suffix are a warning too.
    Given A class whose constructor has event parameter properties without the suffix, one with a default value instead of a type.
    When The code is linted, with or without type information.
    Then There is a warning on each of them.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: Events imported with a namespace import are found too.
    Given A class with an event field typed kiss.Evt, with import * as kiss.
    When The code is linted.
    Then There is a warning.

  Scenario: A class named Evt that is not from Kiss is not an event.
    Given A local class named Evt, and a class with a field of that type, without the suffix.
    When The code is linted.
    Then There are no warnings.

  Scenario: Not reported in tests.
    Given A test file with an event field without the suffix.
    When The code is linted.
    Then There are no warnings.
