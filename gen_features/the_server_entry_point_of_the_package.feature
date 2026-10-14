Feature: The server entry point of the package

  Scenario: The server entry exports everything of the main entry, except the hooks.
    Given The main entry of the package, and its server entry.
    When Their runtime exports are compared.
    Then The server entry has every export of the main entry that is not a hook, including the StoreProvider and StoreSlice components.
    And The server entry has no hook.

  Scenario: Only the modules of the hooks and the provider use React, and they are marked "use client".
    Given The source files of the package.
    When Their imports and first lines are checked.
    Then Hooks.tsx and StoreProvider.tsx start with the "use client" directive.
    And No other source file imports react, so the server entry does not load React at all.

  Scenario: The package exports map gives the server entry to React Server Components, and as a subpath.
    Given The package.json of the package.
    When Its exports map is read.
    Then The "react-server" condition of the main entry points to the server build, in ESM and CJS, with its types.
    And The "./server" subpath points to the same files.
    And The default main entry still points to the full build.
