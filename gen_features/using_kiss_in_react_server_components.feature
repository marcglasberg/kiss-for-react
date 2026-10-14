Feature: Using Kiss in React Server Components

  Scenario: In the React Server Components environment, React is its server build.
    Given The react-server export condition.
    When React is imported.
    Then It has createElement, but no createContext and no state hooks, which the Kiss hooks and provider need.

  Scenario: The server entry of the package loads in a server component, and the store works there.
    Given The server entry of the package, imported with the react-server condition.
    When A store is created, and sync and async actions are dispatched and awaited.
    Then The state changes, the status is tracked, and a failed action is recorded, like on the client.

  Scenario: The server entry gives a server component the StoreProvider and StoreSlice components, and no hook.
    Given The server entry of the package, imported with the react-server condition.
    When Its exports are read.
    Then StoreProvider and StoreSlice are there (a bundler turns them into client references, since their module is "use client").
    And No hook is there, so importing one in a server component is a build error.
