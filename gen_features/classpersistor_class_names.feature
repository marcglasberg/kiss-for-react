Feature: ClassPersistor class names

  Scenario: A class with a typeName is saved under its typeName.
    Given A state class with a static typeName that differs from its class name.
    When The state is saved by the ClassPersistor, and then read back.
    Then The saved text uses the typeName.
    And The state read back is an instance of the same class.

  Scenario: Two classes with the same minified name are read back as the right classes, when both have a typeName.
    Given Two different state classes, both named "e", as a minifier would name them.
    And Each one has its own typeName.
    And Class names are being minified.
    When The state is saved by the ClassPersistor, and then read back.
    Then Each object is read back as an instance of its own class.

  Scenario: The ClassPersistor throws when class names are minified and a class has no typeName.
    Given Class names are being minified.
    And A state class with no typeName.
    When The ClassPersistor is created.
    Then It throws a StoreException that names the problem.

  Scenario Outline: The ClassPersistor throws when a class name looks minified.
    Given A state class with no typeName, named <Name>, as a minifier would name it.
    When The ClassPersistor is created.
    Then It throws a StoreException that names the problem.
    Examples: 
      | Name |
      | e    |
      | ab   |
      | _e   |
      | $e   |

  Scenario Outline: A class whose name starts with a lowercase letter is accepted, when class names are not minified.
    Given A state class with no typeName, named <Name>.
    And Class names are not being minified.
    When The ClassPersistor is created.
    And The state is saved by the ClassPersistor, and then read back.
    Then Creating the ClassPersistor does not throw.
    And The state read back is an instance of the same class, with the same fields.
    Examples: 
      | Name     |
      | myState  |
      | todoItem |
      | abc      |

  Scenario Outline: A built-in class may be listed, also when class names are minified.
    Given Class names are being minified.
    And The listed classes are a state class with a typeName, and the built-in <Builtin>.
    When The ClassPersistor is created.
    And A state with a <Builtin> is saved by the ClassPersistor, and then read back.
    Then Creating the ClassPersistor does not throw.
    And The <Builtin> is read back.
    Examples: 
      | Builtin |
      | Date    |
      | Map     |

  Scenario: A subclass does not inherit the typeName of its parent class.
    Given A state class with a typeName.
    And A subclass of it with no typeName of its own.
    And Class names are being minified.
    When The ClassPersistor is created with both classes.
    Then It throws a StoreException, because the subclass has no typeName.

  Scenario: A subclass without a typeName is saved under its own class name.
    Given A state class with a typeName.
    And A subclass of it with no typeName of its own.
    When A subclass object is saved by the ClassPersistor, and then read back.
    Then It is read back as an instance of the subclass, not of the parent class.

  Scenario: The ClassPersistor throws when two classes are saved under the same name.
    Given Two different state classes that end up with the same name.
    When The ClassPersistor is created with both classes.
    Then It throws a StoreException that names the duplicated name.

  Scenario: Listing the same class twice is not a problem.
    Given A state class listed twice.
    When The ClassPersistor is created.
    Then It does not throw.

  Scenario: The ClassPersistor throws when a typeName is not a non-empty string.
    Given A state class whose typeName is an empty string.
    When The ClassPersistor is created.
    Then It throws a StoreException.

  Scenario: Class names are not minified when the tests run.
    Given The library is not minified.
    When The ClassPersistor checks if class names are minified.
    Then It finds they are not.
