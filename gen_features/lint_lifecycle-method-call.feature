Feature: Lint: lifecycle-method-call

  Scenario Outline: Calling a lifecycle method of an action is reported.
    Given An action.
    And Code outside the action that calls its {Method} method: {Code}
    When The code is linted, with type information: {Type information}.
    Then There is a warning in {Method}, which says to dispatch the action instead.
    Examples: 
      | Method              | Code                                            | Type information |
      | reduce              | new LoadUser().reduce();                        | true             |
      | reduce              | new LoadUser().reduce();                        | false            |
      | before              | const action = new LoadUser(); action.before(); | true             |
      | before              | const action = new LoadUser(); action.before(); | false            |
      | after               | const action = new LoadUser(); action.after();  | true             |
      | wrapError           | new LoadUser().wrapError(new Error('boom'));    | true             |
      | abortDispatch       | new LoadUser().abortDispatch();                 | true             |
      | computeFreshKey     | new LoadUser().computeFreshKey();               | true             |
      | sendCommandToServer | new SaveName().sendCommandToServer('Mary');     | true             |
      | sendCommandToServer | new SaveName().sendCommandToServer('Mary');     | false            |

  Scenario: Calling a lifecycle method of an action in a test is also reported.
    Given A test that creates an action, and calls its reduce method, to check the new state.
    When The code is linted.
    Then There is a warning in reduce.

  Scenario Outline: Calls that are not to the lifecycle methods of another action are not reported.
    Given {Case}.
    When The code is linted, with and without type information.
    Then There are no warnings.
    Examples: 
      | Case                                                          | Code                                                                                                                                           |
      | An action that calls super in its override                    | \nclass LoadAdmin extends LoadUser {\n  before() { super.before(); }\n  reduce() { return new State('Admin'); }\n}                             |
      | An action that calls its own method with this                 | \nclass LoadAdmin extends LoadUser {\n  reduce() { this.after(); return new State('Admin'); }\n}                                               |
      | An array reduce                                               | \nexport const total = [1, 2, 3].reduce((sum, value) => sum + value, 0);                                                                       |
      | A method with the same name, in a class that is not an action | \nclass Job {\n  before() {}\n  reduce() { return 1; }\n}\nexport function run() { const job = new Job(); job.before(); return job.reduce(); } |
      | An action method that is not a lifecycle method               | \nexport function run() { const action = new LoadUser(); action.removeFreshKey(); return action.toString(); }                                  |

  Scenario: With type information, a call through a variable typed as an action is reported.
    Given A function that gets an action typed as KissAction, and calls its reduce method.
    When The code is linted with type information.
    Then There is a warning in reduce.
    And TypeScript also reports an error, since reduce is protected in KissAction.

  Scenario: The rule is in the recommended config, as an error.
    Given The recommended config of the plugin.
    When Its rules are read.
    Then The lifecycle-method-call rule is turned on, as an error.
