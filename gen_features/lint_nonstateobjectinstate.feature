Feature: Lint: non-state-object-in-state

  Scenario Outline: A field of a state class that holds a promise, a timer, or another resource is a warning.
    Given A state class with a field that holds an object that is not state.
    When The code is linted.
    Then There is a warning in the field, which says to keep it outside the state.
    Examples: 
      | Field                                                           | Type            |
      | readonly user: Promise<User> | null = null;                     | Promise         |
      | readonly users: Promise<User>[] = [];                           | Promise         |
      | readonly loads: ReadonlyMap<string, Promise<User>> = new Map(); | Promise         |
      | readonly controller = new AbortController();                    | AbortController |
      | readonly socket: WebSocket | null = null;                       | WebSocket       |
      | readonly events: EventSource | null = null;                     | EventSource     |
      | readonly worker: Worker | null = null;                          | Worker          |
      | readonly timer: NodeJS.Timeout | null = null;                   | NodeJS.Timeout  |
      | readonly timer: ReturnType<typeof setTimeout> | null = null;    | NodeJS.Timeout  |

  Scenario Outline: A field of a state class that holds a DOM node, a React ref or a React element is a warning.
    Given A state class with a field that holds a part of the UI.
    When The code is linted.
    Then There is a warning in the field, which says to keep it in the component.
    Examples: 
      | Field                                                  | Type                   |
      | readonly input: HTMLInputElement | null = null;        | HTMLElement            |
      | readonly node: Element | null = null;                  | Element                |
      | readonly ref: RefObject<HTMLDivElement> | null = null; | React.RefObject        |
      | readonly ref: MutableRefObject<number> | null = null;  | React.MutableRefObject |
      | readonly title: ReactNode = null;                      | React.ReactNode        |
      | readonly icons: readonly ReactElement[] = [];          | React.ReactElement     |

  Scenario: Subclasses of objects that are not state are warnings too.
    Given A state class with a field whose class extends Promise.
    When The code is linted.
    Then There is a warning in the field.

  Scenario: State values, functions and timers that are numbers are fine.
    Given A state class with users, a date, a function, a user class named Node, and a number timer.
    When The code is linted.
    Then There are no warnings.

  Scenario: A user class named like a DOM type is fine.
    Given A state class with a field of a user class named Node.
    When The code is linted.
    Then There are no warnings.

  Scenario Outline: Classes that are not state classes, and code without type information, are not reported.
    Given A class with a promise, which is not part of the state, and a state class with a promise.
    When The code is linted, with or without type information.
    Then With type information, only the state class is reported.
    And Without type information, nothing is reported, since the rule needs it.
    Examples: 
      | Type information |
      | true             |
      | false            |
