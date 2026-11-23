Feature: Lint: after-throws

  Scenario Outline: A throw in the after method of an action is reported.
    Given An action whose after method throws {Case}.
    When The code is linted.
    Then The throw is reported.
    Examples: 
      | Case                       | Code                                                                                                                                     |
      | directly                   | \n  after() {\n    if (this.state.user === null) throw new Error('No user');\n  }                                                        |
      | inside a try without catch | \n  after() {\n    try {\n      if (this.state.user === null) throw new Error('No user');\n    } finally {\n      cleanup();\n    }\n  } |
      | inside a catch             | \n  after() {\n    try {\n      cleanup();\n    } catch (error) {\n      throw new Error('Cleanup failed');\n    }\n  }                  |

  Scenario Outline: A throw in the after method of a base action is reported.
    Given A base action without reduce, whose after method throws.
    When The code is linted.
    Then The throw is reported.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Throws that are caught, or that are not in after, are not reported.
    Given An action with {Case}.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Case                               | Code                                                                                                                                                    |
      | a throw caught by a try in after   | \n  after() {\n    try {\n      if (this.state.user === null) throw new Error('No user');\n    } catch (error) {\n      console.log(error);\n    }\n  } |
      | a throw inside a callback in after | \n  after() {\n    setTimeout(() => { throw new Error('Later'); }, 0);\n  }                                                                             |
      | a throw in before                  | \n  after() { cleanup(); }\n  before() { if (this.state.user === null) throw new Error('No user'); }                                                    |

  Scenario Outline: Classes that are not Kiss actions are not reported.
    Given A class that is not a Kiss action, whose after method throws.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |
