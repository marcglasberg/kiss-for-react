Feature: Environment, dependencies and configuration

  Scenario: The store gives access to the environment, the dependencies and the configuration it was created with.
    Given A store created with an environment, a configuration factory and a dependencies factory.
    When The environment, the configuration and the dependencies are read from the store.
    Then They are the environment, and the objects the factories returned.
    And Reading them again gives the same objects.

  Scenario: A store created without them has them undefined.
    Given A store created with only the initial state.
    When The environment, the configuration and the dependencies are read from the store.
    Then They are all undefined.

  Scenario: The factories get the store, and the configuration is created before the dependencies.
    Given A store created with an environment, a configuration factory and a dependencies factory.
    When The store is created.
    Then The configuration factory gets the store, and can read its environment and its state.
    And The dependencies factory gets the store, and can read its environment and its configuration.
    And Each factory is called once.

  Scenario: A factory that throws makes the store creation fail.
    Given A dependencies factory that throws.
    When The store is created.
    Then The error is thrown by the store creation.

  Scenario: The dependencies are available to the errorObserver while the persisted state is read.
    Given A store with a dependencies factory, a persistor that fails to read the state, and an errorObserver.
    When The store is created, and the persistor fails.
    Then The errorObserver gets the error, and can read the dependencies from the store.

  Scenario: Actions read the environment, the dependencies and the configuration through the store, with typed getters in the base action.
    Given A base action with typed getters for the environment, the dependencies and the configuration.
    And A store with an injected API client.
    When An action that loads the user with the API client is dispatched.
    Then The action used the injected API client, and put the result in the state.

  Scenario: Each store has its own dependencies, so a fake with internal state does not leak from one test to the next.
    Given Two stores, each created with its own fake API client.
    When An action that uses the API client is dispatched twice in the first store.
    Then The first store's fake recorded the calls, and the second store's fake recorded none.
    And The dependencies of the two stores are different objects.

  Scenario: The errorObserver can read the environment, to handle errors differently in production and in tests.
    Given An errorObserver that sends the errors to a monitoring service only in production.
    And A store in production, and a store in testing, both with that errorObserver.
    When An action fails in each store.
    Then Only the error of the production store is sent to the monitoring service.

  Scenario: logOut and clearInternalActionProps keep the environment, the dependencies and the configuration.
    Given A store with an environment, disposable dependencies and a disposable configuration.
    When logOut is called, disposing the props, and clearInternalActionProps is called.
    Then The environment, the dependencies and the configuration are the same, and were not disposed.

  Scenario: Disposing the store disposes the dependencies and the configuration, after the props.
    Given A store with a disposable prop, disposable dependencies and a disposable configuration.
    When The store is disposed.
    Then The prop is disposed first, then the dependencies, then the configuration.
    And The dependencies and the configuration can still be read from the store.

  Scenario Outline: The dependencies and the configuration are disposed with Symbol.dispose, Symbol.asyncDispose, or a dispose method.
    Given A store whose dependencies and configuration can be disposed in the given way.
    When The store is disposed, and the returned promise is awaited.
    Then Both are disposed once, and the async disposals have finished.
    Examples: 
      | Way                 |
      | Symbol.dispose      |
      | Symbol.asyncDispose |
      | dispose()           |

  Scenario: Dependencies and a configuration that cannot be disposed are left alone.
    Given A store whose dependencies and configuration are plain objects, without any dispose method.
    When The store is disposed.
    Then Nothing happens to them, and dispose finishes without errors.

  Scenario Outline: A failing disposal of the dependencies does not make dispose fail, and the configuration is still disposed.
    Given A store with an errorObserver, dependencies whose disposal fails, and a disposable configuration.
    When The store is disposed.
    Then The returned promise resolves.
    And The error is given to the errorObserver, with a null action.
    And The configuration is disposed.
    Examples: 
      | Failure |
      | throws  |
      | rejects |

  Scenario: Disposing the store twice disposes the dependencies and the configuration only once.
    Given A store with disposable dependencies and configuration.
    When The store is disposed twice.
    Then Each is disposed once.

  Scenario: A store declared with `await using` disposes its dependencies at the end of the block.
    Given A test that creates a store with `await using`, with async disposable dependencies.
    When The block ends.
    Then The dependencies are disposed, and their async disposal has finished.

  Scenario: Components read the environment and the configuration with useEnvironment and useConfiguration.
    Given A store with an environment and a configuration.
    And A component that shows them, using useEnvironment and useConfiguration.
    When The component renders.
    Then It shows the environment and the configuration of the store.

  Scenario Outline: useEnvironment and useConfiguration do not re-render the component when the state changes.
    Given A component that uses useEnvironment and useConfiguration, but not the state.
    When The state changes, several times.
    Then The component does not render again.
    And A component that also uses the state renders again, as usual.
    Examples: 
      | StrictMode |
      | false      |
      | true       |

  Scenario: useEnvironment and useConfiguration must be used within a StoreProvider.
    Given Components that use useEnvironment or useConfiguration, rendered without a StoreProvider.
    When The components render.
    Then They throw.
