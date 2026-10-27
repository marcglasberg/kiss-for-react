Feature: Persisting frozen state classes

  Scenario: A frozen state class retains its saved values when the application restarts.
    Given A state class freezes its fields in its constructor.
    And A store has saved a counter of 42 through ClassPersistor.
    When A new store starts with a counter of zero and loads the saved state.
    Then The new store is ready and contains an instance of the saved state class.
    And The restored counter is 42, and no persistence error was reported.

  Scenario: A state class with TypeScript readonly fields retains its saved values when the application restarts.
    Given A state class has TypeScript readonly fields without freezing them at runtime.
    And A store has saved a counter of 42 through ClassPersistor.
    When A new store starts with a counter of zero and loads the saved state.
    Then The new store is ready and contains an instance of the saved state class.
    And The restored counter is 42, and no persistence error was reported.

  Scenario Outline: A frozen state class retains a saved field of any primitive type.
    Given A state class freezes its fields in its constructor, and its field defaults to "default".
    And A store has saved the field with the value <Value> through ClassPersistor.
    When A new store starts with the default value and loads the saved state.
    Then The restored field is <Value>, and no persistence error was reported.
    Examples: 
      | Value       |
      | a text      |
      | false       |
      | zero        |
      | null        |
      | NaN         |
      | Infinity    |
      | undefined   |
      | BigInt      |
      | the default |

  Scenario: A restored frozen state is still frozen, and works as before.
    Given A state class freezes its fields in its constructor, and has a method that returns a new state.
    And A store has saved a counter of 42 through ClassPersistor.
    When A new store starts with a counter of zero and loads the saved state.
    Then The restored state is frozen.
    And When an action increments the counter with the method of the restored state, the counter is 43.
    And The counter of 43 is saved.

  Scenario: A frozen state that holds another frozen class retains the saved values of both.
    Given An account state class holds a user, and both classes freeze their fields in their constructors.
    And A store has saved the user "Ann" and the balance 100 through ClassPersistor.
    When A new store starts with the default user "nobody" and the balance zero, and loads the saved state.
    Then The restored user is "Ann", and the restored balance is 100.
    And The restored account and the restored user are frozen instances of their classes.

  Scenario: A field made read-only with Object.defineProperty retains its saved value.
    Given A state class makes its "theme" field read-only with Object.defineProperty, and its "volume" field is writable.
    And A store has saved the theme "dark" and the volume 8 through ClassPersistor.
    When A new store starts with the theme "light" and the volume 5, and loads the saved state.
    Then The restored theme is "dark", and the restored volume is 8.
    And The "theme" field is still read-only, and the "volume" field is still writable.

  Scenario: A frozen state class retains a saved field that its constructor does not create.
    Given A state class freezes its fields in its constructor, and creates the "note" field only when a note is given.
    And A store has saved the counter 42 and the note "hello" through ClassPersistor.
    When A new store starts without a note, and loads the saved state.
    Then The new store is ready, and no persistence error was reported.
    And The restored counter is 42, the restored note is "hello", and the restored state is frozen.

  Scenario: A frozen state class retains saved values inside its frozen object, array, Map and Date fields.
    Given A state class freezes itself, and has a frozen "config" object, an "items" array of frozen instances, a "prices" Map, and an "updatedAt" Date.
    And A store has saved the theme "dark", the items 1 and 2, the price 10 for "IBM", and the date 2020-01-02 through ClassPersistor.
    When A new store starts with the defaults (theme "light", no items, no prices, and the date 1970-01-01) and loads the saved state.
    Then All the restored values are the saved ones, and no persistence error was reported.
    And The restored state and its config are frozen, and the items are frozen instances of their class.

  Scenario Outline: A sealed state class, or one closed to new properties, retains its saved values.
    Given A state class has a writable "counter" field, creates the "note" field only when a note is given, and calls <Method> on itself in its constructor.
    And A store has saved the counter 42 and the note "hello" through ClassPersistor.
    When A new store starts with the counter zero and no note, and loads the saved state.
    Then The restored counter is 42, the restored note is "hello", and no persistence error was reported.
    And The restored state is still closed to new properties, and still sealed if its class seals it, and its counter is still writable.
    Examples: 
      | Method                   |
      | Object.seal              |
      | Object.preventExtensions |

  Scenario: The getters and methods of a restored frozen state work with the saved values.
    Given A state class freezes itself, has a getter "double" that returns twice the counter, and a method "withCounter" that spreads its fields into a new instance.
    And A store has saved the counter 42 and the label "x" through ClassPersistor.
    When A new store starts with the counter zero and the label "none", and loads the saved state.
    Then The getter returns 84, and the fields of the restored state are "counter" and "label", in this order.
    And The method returns a new frozen instance with the counter 43 and the label "x".

  Scenario Outline: A frozen state class retains a saved nested frozen class, or a saved null, in a nullable field.
    Given An account state class freezes itself, and its "user" field holds a frozen user, or null.
    And A store has saved the user <Saved> through ClassPersistor.
    When A new store starts with the user <Default>, and loads the saved state.
    Then The restored user is <Saved>, and no persistence error was reported.
    Examples: 
      | Saved | Default |
      | Ann   | null    |
      | null  | Bob     |

  Scenario: A frozen state class that extends another class retains the saved values of both classes.
    Given A base class has a read-only "id" field, and a subclass adds a read-only "name" field and freezes itself.
    And A store has saved the id 7 and the name "Ann" through ClassPersistor.
    When A new store starts with the id zero and the name "none", and loads the saved state.
    Then The restored state is an instance of the subclass, with the id 7 and the name "Ann", and it is frozen.

  Scenario: A frozen state class that extends a built-in class retains its saved entries, but keeps the constructor defaults of its read-only fields.
    Given A state class extends Map, has a read-only "label" field, and freezes itself in its constructor.
    And A store has saved the label "saved" and the entry "a" = 1 through ClassPersistor.
    When A new store starts with the label "default" and no entries, and loads the saved state.
    Then The restored state has the entry "a" = 1, and no persistence error was reported.
    And The restored label is still "default", since a copy of the instance could not hold the entries.

  Scenario: A frozen state class with a private field retains its saved public values, but the private field is not available.
    Given A state class freezes itself, has a read-only "counter" field, and a private "#origin" field that a getter reads.
    And A store has saved the counter 42 through ClassPersistor.
    When A new store starts with the counter zero and loads the saved state.
    Then The restored counter is 42, and no persistence error was reported.
    And Reading the getter throws a TypeError, since the restored state is a copy made without the constructor, which has no private fields.
