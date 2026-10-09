# Demo of the Kiss lint rules

These files show ALL the rules of the Kiss ESLint plugin (`eslint-plugin-kiss-for-react`), so you
can see them in your IDE, and try their quick fixes. They are not meant to run.

| File               | Rules                                                                    |
|--------------------|--------------------------------------------------------------------------|
| `components.tsx`   | Components and hooks: `useSelect`, `useObject`, `useAllState`, dispatching while rendering... |
| `reducers.ts`      | Reducers: stale state, state mutation, `return null`...                  |
| `actions.ts`       | Action methods and features: `after`, `before`, `retry`, `nonReentrant`, the base action... |
| `dispatching.ts`   | Dispatching and waiting: `dispatchSync`, `dispatchAndWait`, `ready()`, `waitCondition`... |
| `state-classes.ts` | State classes: immutability, collections, objects that are not state...  |
| `errors.ts`        | Errors: `UserException`, `globalWrapError`                               |
| `debugging.ts`     | Debugging and testing features in production code                        |
| `user.test.ts`     | A test file, with the rules that are only reported in tests              |
| `naming.ts`        | The naming rules (opt-in): action names and file names                   |
| `state.ts`         | The state, actions and store that the other files use (no warnings)      |

## How to use

1. Build the plugin: in the `eslint-plugin` directory, run `npm run build`. The demo uses the
   built plugin, in `eslint-plugin/lib` (build it again after you change the plugin).

2. Open a demo file in your IDE, with ESLint support (in VS Code, the **ESLint** extension; in
   WebStorm, **Automatic ESLint configuration**). The demo has its own `eslint.config.mjs`,
   which turns on ALL the rules, with type information.

3. All the rules are hidden by the `/* eslint-disable kiss-for-react/<rule> */` lines at the top
   of each file. To see a rule, delete its line (or all of them). The warnings then show in the
   editor. Each one is marked with a comment right above the line it underlines:

   ```ts
   // kiss-for-react/no-new-object-in-use-select
   // (The selector returns a new object, so the component re-renders on every state change)
   // Fix (automatic): Will replace `useSelect` with `useObject`, and import it.
   const user = useSelect((state: State) => ({ name: state.name, age: state.age }));
   ```

4. Try the quick fixes: the lightbulb in VS Code, or Alt+Enter in WebStorm. Automatic fixes are
   also applied by `npx eslint --fix`. Suggestions are only offered in the IDE.

5. When you're done, undo your changes (the demo files must keep their `eslint-disable` lines).

You can also see the warnings in the terminal, from the repo root:

```shell
npx eslint --no-inline-config eslint-plugin/testing/demo/components.tsx
```

(`--no-inline-config` ignores the `eslint-disable` lines.)

## The naming rules

The naming rules report every action, so the demo config turns them on only in `naming.ts`. In a
real project, turn on only one of the 3 action-name rules, and one of the 2 file-name rules.

## Keeping the demo up to date

The test `eslint-plugin/__tests__/bdd.LintsDemo.test.ts` checks the demo files: each mark must
have its warning on the line below it (with the same quick fixes), each warning must be marked,
all the rules of the plugin must be shown, and the files must compile. When you add or change a
rule, update the demo files too, and run:

```shell
npx jest eslint-plugin/__tests__/bdd.LintsDemo.test.ts
```
