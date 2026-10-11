Feature: Lint: sequential-deadlock

  Scenario Outline: A sequential action that waits for another action of the same queue is an error.
    Given Two sequential actions, Parent and Child, with the default queue.
    When Parent awaits this.dispatchAndWait(new Child()).
    Then There is an error in new Child(), saying it deadlocks.
    And The suggestion uses dispatch, without waiting, and then there is no error.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Waiting for another action of the same class is an error too.
    Given A sequential action Parent.
    When Parent awaits this.dispatchAndWait(new Parent()).
    Then There is an error in new Parent().
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Waiting for an action that is not sequential, or not waiting, is fine.
    Given A sequential action Parent.
    When Parent {Waits}.
    Then There is no error.
    Examples: 
      | Waits                                            | Code                                                                     | Type information |
      | awaits this.dispatchAndWait(new NotSequential()) | await this.dispatchAndWait(new NotSequential());                         | true             |
      | awaits this.dispatchAndWait(new NotSequential()) | await this.dispatchAndWait(new NotSequential());                         | false            |
      | dispatches Child without waiting                 | this.dispatch(new Child());                                              | true             |
      | dispatches Child without waiting                 | this.dispatch(new Child());                                              | false            |
      | calls dispatchAndWait without awaiting it        | void this.dispatchAndWait(new Child());                                  | true             |
      | calls dispatchAndWait without awaiting it        | void this.dispatchAndWait(new Child());                                  | false            |
      | awaits dispatchAndWait in a closure              | setTimeout(async () => { await this.dispatchAndWait(new Child()); }, 0); | true             |
      | awaits dispatchAndWait in a closure              | setTimeout(async () => { await this.dispatchAndWait(new Child()); }, 0); | false            |

  Scenario: An action that is not sequential can wait for a sequential action.
    Given An action that is not sequential.
    When It awaits this.dispatchAndWait(new Child()), and Child is sequential.
    Then There is no error.

  Scenario Outline: Actions with the same key in sequentialKeyParams use the same queue.
    Given A sequential action Parent, whose sequentialKeyParams returns {Parent key}.
    And A sequential action Other, whose sequentialKeyParams returns {Other key}.
    When Parent awaits this.dispatchAndWait(new Other()).
    Then There {Result}.
    Examples: 
      | Parent key       | Other key        | Result      | Type information |
      | 'saves'          | "saves"          | is an error | true             |
      | 'saves'          | "saves"          | is an error | false            |
      | 'saves'          | 'loads'          | is no error | true             |
      | 'saves'          | 'loads'          | is no error | false            |
      | 1                | 1                | is an error | true             |
      | 1                | 1                | is an error | false            |
      | null             | null             | is an error | true             |
      | null             | null             | is an error | false            |
      | null             | 'saves'          | is no error | true             |
      | null             | 'saves'          | is no error | false            |
      | this.constructor | this.constructor | is no error | true             |
      | this.constructor | this.constructor | is no error | false            |
      | Parent           | Parent           | is an error | true             |
      | Parent           | Parent           | is an error | false            |
      | this.id          | this.id          | is no error | true             |
      | this.id          | this.id          | is no error | false            |
      | this.id          | null             | is no error | true             |
      | this.id          | null             | is no error | false            |

  Scenario Outline: With this.constructor as the key, waiting for an action of the same class is an error.
    Given A sequential action whose sequentialKeyParams returns this.constructor.
    When It awaits this.dispatchAndWait of a new action of the same class.
    Then There is an error.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Waiting for a sequential action class of the same queue is an error, without a suggestion.
    Given Two sequential actions, Parent and Child, with the default queue.
    When Parent awaits {Code}.
    Then There is an error in {Reported}, without suggestions.
    Examples: 
      | Code                                            | Reported | Method             | Type information |
      | this.waitActionType(Child)                      | Child    | waitActionType     | true             |
      | this.waitActionType(Child)                      | Child    | waitActionType     | false            |
      | this.waitAllActionTypes([NotSequential, Child]) | Child    | waitAllActionTypes | true             |
      | this.waitAllActionTypes([NotSequential, Child]) | Child    | waitAllActionTypes | false            |
      | this.store.waitActionType(Child)                | Child    | waitActionType     | true             |
      | this.store.waitActionType(Child)                | Child    | waitActionType     | false            |

  Scenario Outline: Waiting for its own class with waitActionType is not reported.
    Given A sequential action Parent.
    When Parent awaits this.waitActionType(Parent).
    Then There is no error, since Kiss throws instead of waiting.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: In a list of actions, only the ones of the same queue are reported.
    Given A sequential action Parent.
    When Parent awaits this.store.dispatchAndWaitAll([new NotSequential(), new Child()]).
    Then There is an error in new Child() only.
    And The suggestion uses dispatchAll, without waiting.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: When the result of the wait is used, there is no suggestion.
    Given A sequential action Parent.
    When Parent uses the result of await this.dispatchAndWait(new Child()).
    Then There is an error, without suggestions.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: Returning the wait from a method of the action counts as waiting.
    Given A sequential action Parent.
    When A method of Parent returns this.dispatchAndWait(new Child()), and before awaits that method.
    Then There is an error in new Child(), without suggestions.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: An action kept in a const is checked too.
    Given A sequential action Parent.
    When Parent creates const child = new Child(), and awaits this.dispatchAndWait(child).
    Then There is an error in child.
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario Outline: A sequential feature inherited from a superclass counts too.
    Given An abstract action with sequential = true.
    And Two subclasses of it, Parent and Kid.
    When Parent awaits this.dispatchAndWait(new Kid()).
    Then There is an error in new Kid().
    Examples: 
      | Type information |
      | true             |
      | false            |

  Scenario: With type information, an action declared in another file is checked too.
    Given A sequential action Child, declared in another file.
    When A sequential action awaits this.dispatchAndWait(new Child()).
    Then There is an error with type information, and none without it.
