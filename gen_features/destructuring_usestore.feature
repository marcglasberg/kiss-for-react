Feature: Destructuring useStore

  Scenario Outline: The methods of useStore work when destructured.
    Given A component that destructures a method of useStore, as in `const { dispatch } = useStore()`.
    When The destructured method is called.
    Then It works the same as calling it on the object returned by useStore.
    Examples: 
      | Method                    |
      | dispatch                  |
      | dispatchSync              |
      | dispatchAndWait           |
      | dispatchWhen              |
      | dispatchAll               |
      | dispatchAndWaitAll        |
      | waitCondition             |
      | waitActionCondition       |
      | waitAllActions            |
      | waitActionType            |
      | waitAllActionTypes        |
      | waitAnyActionTypeFinishes |
