Feature: Optional state class decorator

  Scenario: The state class decorator preserves the class and its instances.
    Given A class with constructor arguments, a static member, and a method.
    When The class is annotated and an instance is used as store state.
    Then The constructor, members, and state instance are preserved without freezing the instance.

  Scenario: The decorator preserves behavior with modern and legacy decorator compilation.
    Given An annotated class compiled with modern decorators and with experimentalDecorators.
    When Each compiled class is instantiated.
    Then Both instances retain their constructor arguments and methods.
