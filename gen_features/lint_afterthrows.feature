Feature: Lint: after-throws

  Scenario Outline: A throw in the after method of an action is reported.
    Given An action whose after method throws {Case}.
    When The code is linted.
    Then The throw is reported.
    Examples: 
      | Case                       | Code                                                                                                                              |
      | directly                   | 
  after() {
    if (this.state.user === null) throw new Error('No user');
  }                                                    |
      | inside a try without catch | 
  after() {
    try {
      if (this.state.user === null) throw new Error('No user');
    } finally {
      cleanup();
    }
  } |
      | inside a catch             | 
  after() {
    try {
      cleanup();
    } catch (error) {
      throw new Error('Cleanup failed');
    }
  }                  |

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
      | Case                               | Code                                                                                                                                             |
      | a throw caught by a try in after   | 
  after() {
    try {
      if (this.state.user === null) throw new Error('No user');
    } catch (error) {
      console.log(error);
    }
  } |
      | a throw inside a callback in after | 
  after() {
    setTimeout(() => { throw new Error('Later'); }, 0);
  }                                                                         |
      | a throw in before                  | 
  after() { cleanup(); }
  before() { if (this.state.user === null) throw new Error('No user'); }                                               |

  Scenario Outline: Classes that are not Kiss actions are not reported.
    Given A class that is not a Kiss action, whose after method throws.
    When The code is linted.
    Then There are no warnings.
    Examples: 
      | Type information |
      | true             |
      | false            |
