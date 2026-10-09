# eslint-plugin-kiss-for-react

This is an ESLint plugin for [Kiss](https://www.npmjs.com/package/kiss-for-react)
([kissforreact.org](https://kissforreact.org)).
It checks for mistakes that compile fine but are wrong at runtime, and for style issues.
See also the [Linter page](https://kissforreact.org/react/linter) of the Kiss docs.

* Meant primarily for **AI agents**, like **Claude Code** and **Codex**
* Shows lint errors as you type in the IDE: VS Code, WebStorm, and any editor with ESLint support
* Quick fixes (for example, the lightbulb in VS Code, or ALT+Enter in WebStorm)

## How to install

Ask your AI agent:

*"Install the eslint-plugin-kiss-for-react package from npm,
following all the steps in its README."*

## AI agents and the command line

Any ESLint command shows the plugin's errors:

| Command                       | What it does                                                  |
|-------------------------------|---------------------------------------------------------------|
| `npx eslint .`                | Shows the errors in all files                                 |
| `npx eslint <file or dir> ...` | Shows the errors in the given files and directories         |
| `npx eslint --fix <file> ...` | Applies the automatic fixes, and shows the remaining errors   |

Note `tsc` and `npm run build` don't show these errors. They only show TypeScript's own
errors, since the plugin finds mistakes that compile fine. So, AI agents must run
`npx eslint` to check their work.

Add the following to the `AGENTS.md` file at the root of your project:

```markdown
## Linting

Use the `eslint-plugin-kiss-for-react` ESLint plugin. To check for errors, run
`npx eslint <file> ...` for the files you changed, or `npx eslint .` for all files.
Fix all errors and warnings of the `kiss-for-react/...` rules. Running `tsc` is not
enough, as it doesn't show them.
```

Note Codex reads `AGENTS.md`. Claude Code reads it too, but only when the project has no
`CLAUDE.md`. So it's best to have only `AGENTS.md`. If your project has both
`AGENTS.md` and `CLAUDE.md`, add the above text to both.

## Install

Requires ESLint 9 or later (with the flat config, `eslint.config.js`), Node 20.19 or later,
and `kiss-for-react` 2.0.0 or later. For TypeScript files, you also need the
[`typescript-eslint`](https://typescript-eslint.io) parser, which your project probably
already has.

1. Install the package as a dev dependency:

   ```shell
   npm install --save-dev eslint-plugin-kiss-for-react
   ```

2. Add `kiss.configs.recommended` to your `eslint.config.js` (or `eslint.config.mjs`).
   For example, in a typical React project with TypeScript:

   ```js
   import { defineConfig } from 'eslint/config';
   import js from '@eslint/js';
   import tseslint from 'typescript-eslint';
   import kiss from 'eslint-plugin-kiss-for-react';

   export default defineConfig(
     js.configs.recommended,
     tseslint.configs.recommended,
     kiss.configs.recommended,
   );
   ```

   If your project has no ESLint yet, install it first:
   `npm install --save-dev eslint @eslint/js typescript-eslint`, and create the file above.

3. Turn on type information (recommended, see the next section).

4. You may need to restart the ESLint server of your IDE. In VS Code, install the
   **ESLint** extension (by Microsoft), and run **ESLint: Restart ESLint Server** from the
   command palette. In WebStorm, ESLint is built in: in **Settings | Languages & Frameworks |
   JavaScript | Code Quality Tools | ESLint**, select **Automatic ESLint configuration**.

To use a local copy of the plugin, give its path instead of a version, in your
`package.json`, and run `npm install` again:

```json
"devDependencies": {
  "eslint-plugin-kiss-for-react": "file:../kiss-for-react/eslint-plugin"
}
```

The local copy must be built: run `npm run build` in its directory.

## Type information

Almost all rules work without type information, looking only at the file being linted.
But with type information, they find more mistakes, and report fewer false ones:

* They know the classes, stores and state declared in other files. For example,
  `dispatch-sync-async-action` then finds async actions declared in other files, and the
  state class rules know which classes are part of the state.
* They check that a class really is a Kiss action, or that an object really is a Kiss store,
  instead of guessing from the code.
* Some quick fixes can do more, like adding a parameter with its type.

The rule `non-state-object-in-state` only works with type information. Each rule's
description says when type information matters.

To turn it on, add the `projectService` option of `typescript-eslint`:

```js
export default defineConfig(
  js.configs.recommended,
  tseslint.configs.recommended,
  kiss.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
```

Linting with type information is slower, since ESLint uses TypeScript to type-check the
files. For most projects, it's still fast enough to use all the time.

## Quick fixes

Rules can have two kinds of quick fixes:

* **Automatic fixes** don't change what the code does (or only make it better). The IDE
  offers them, and `npx eslint --fix` (and "fix on save", if your IDE has it) applies them.

* **Suggestions** change what the code does, so you must choose them yourself. The IDE
  offers them, but `npx eslint --fix` doesn't apply them.

Each rule below says which kind of fix it has.

## Turning rules on and off

Most rules are on in `kiss.configs.recommended`. The opt-in rules, marked in the
[list of rules](#rules), are off until you turn them on. To turn a rule on or off, or change
its severity, add it after the recommended config, with `'off'`, `'warn'` or `'error'`:

```js
export default defineConfig(
  // ...
  kiss.configs.recommended,
  {
    rules: {
      'kiss-for-react/prefer-state-parameter': 'off',
      'kiss-for-react/stale-state-after-await': 'warn',
      'kiss-for-react/action-name-ends-with-action': 'warn', // An opt-in rule.
    },
  },
);
```

When Kiss offers more than one style, like how to name actions, each style is a separate
opt-in rule. Turn on only one of them.

To turn a rule off only for some files, add `files`:

```js
{
  files: ['**/*.test.ts', '**/*.test.tsx'],
  rules: {
    'kiss-for-react/dispatch-sync-async-action': 'off',
  },
}
```

To ignore a single error directly in the code, add a comment on the line before it:

```ts
// eslint-disable-next-line kiss-for-react/dispatch-sync-async-action
store.dispatchSync(new LoadUser());
```

Use `/* eslint-disable kiss-for-react/<rule> */` at the top of a file to ignore a rule in
the whole file.

## Command line and CI

* `npx eslint .` reports the errors of all files, and `npx eslint <file or dir> ...` of
  some files. Both work the same way, with or without type information.

* `npx eslint --fix .` applies the automatic fixes. Suggestions are only available in the IDE.

* In CI, use `npx eslint . --max-warnings 0` to also fail on warnings.

## Rules

Most rules are on in `kiss.configs.recommended`. The ones marked opt-in are off until you
[turn them on](#turning-rules-on-and-off).

Some rules are not reported in tests, as noted in their descriptions. Tests are the files
whose names end with `.test` or `.spec` (like `user.test.ts`), and the files in `__tests__`
directories.

**Components and hooks**

- [`no-new-object-in-use-select`](#no-new-object-in-use-select) error
- [`new-values-in-use-object`](#new-values-in-use-object) warning
- [`avoid-use-all-state`](#avoid-use-all-state) warning
- [`store-in-selector`](#store-in-selector) error
- [`dispatch-in-render`](#dispatch-in-render) warning
- [`store-state-in-render`](#store-state-in-render) warning
- [`then-on-dispatch-and-wait`](#then-on-dispatch-and-wait) warning

**Reducers**

- [`stale-state-after-await`](#stale-state-after-await) error
- [`prefer-state-parameter`](#prefer-state-parameter) warning
- [`no-state-mutation`](#no-state-mutation) error
- [`reduce-without-await`](#reduce-without-await) warning
- [`prefer-return-null`](#prefer-return-null) warning

**Action methods and features**

- [`async-after`](#async-after) error
- [`after-throws`](#after-throws) warning
- [`missing-super-in-override`](#missing-super-in-override) error
- [`retry-requires-async-reduce`](#retry-requires-async-reduce) error
- [`retry-without-non-reentrant`](#retry-without-non-reentrant) warning
- [`async-feature-in-sync-action`](#async-feature-in-sync-action) warning
- [`extend-base-action`](#extend-base-action) warning
- [`avoid-abort-dispatch`](#avoid-abort-dispatch) opt-in warning
- [`avoid-wrap-reduce`](#avoid-wrap-reduce) opt-in warning
- [`missing-key-params`](#missing-key-params) opt-in warning

**Dispatching and waiting**

- [`dispatch-sync-async-action`](#dispatch-sync-async-action) error
- [`dispatch-same-action-twice`](#dispatch-same-action-twice) error
- [`dispatch-before-store-ready`](#dispatch-before-store-ready) error
- [`dispatch-and-wait-unlimited-retries`](#dispatch-and-wait-unlimited-retries) warning
- [`wait-fail-never-matches`](#wait-fail-never-matches) warning
- [`wait-condition-without-timeout`](#wait-condition-without-timeout) warning

**State classes**

- [`state-class-must-be-immutable`](#state-class-must-be-immutable) warning
- [`prefer-readonly-collections`](#prefer-readonly-collections) warning
- [`non-state-object-in-state`](#non-state-object-in-state) warning
- [`copy-missing-field`](#copy-missing-field) warning
- [`missing-initial-state`](#missing-initial-state) opt-in warning
- [`route-in-state`](#route-in-state) opt-in warning

**Errors**

- [`user-exception-outside-action`](#user-exception-outside-action) warning
- [`user-exception-without-cause`](#user-exception-without-cause) warning
- [`throw-in-global-wrap-error`](#throw-in-global-wrap-error) warning

**Tests and debugging**

- [`expect-without-waiting`](#expect-without-waiting) warning
- [`testing-feature-in-production`](#testing-feature-in-production) warning
- [`action-status-details-in-production`](#action-status-details-in-production) warning
- [`debug-observer-in-release`](#debug-observer-in-release) warning

**Naming**

- [`action-name-ends-with-action`](#action-name-ends-with-action) opt-in warning
- [`action-name-ends-with-underscore-action`](#action-name-ends-with-underscore-action) opt-in warning
- [`action-name-without-action`](#action-name-without-action) opt-in warning
- [`action-file-name-ends-with-action`](#action-file-name-ends-with-action) opt-in warning
- [`action-file-name-starts-with-action`](#action-file-name-starts-with-action) opt-in warning

---

### no-new-object-in-use-select

An error for `useSelect` (or `useSelector`) with a selector that returns a new object or
array:

```tsx
const user = useSelect((state: State) => ({ name: state.name, age: state.age })); // Error
const user = useSelect((state: State) => [state.name, state.age]);                // Error

const user = useObject((state: State) => ({ name: state.name, age: state.age })); // OK
const name = useSelect((state: State) => state.name);                             // OK
```

`useSelect` re-renders the component when the selected value changes, comparing it with
`===`. A new object is never `===` the previous one, so the component re-renders on every
state change, even when `name` and `age` didn't change. Instead, `useObject` compares the
values inside the object (or array), and re-renders only when one of them changes.

Only Kiss's `useSelect` is reported: imported from `kiss-for-react`, by name or with
`import * as kiss`.

Quick fix (automatic): replace `useSelect` with `useObject`, and import it. If that was the
only use of `useSelect`, it's replaced with `useObject` in the import.

---

### new-values-in-use-object

A warning for a `useObject` whose selector creates new values inside the object or array it
returns, like `state.items.filter(...)`, `state.items.map(...)`, `{ ...state.user }`, `[]`, or
a function:

```tsx
const data = useObject((state: State) => ({ done: state.items.filter((i) => i.done) })); // Warning
const data = useObject((state: State) => ({ items: state.items, filter: state.filter })); // OK
```

`useObject` compares the values inside the object by identity, so a new value makes the
component re-render on every state change, as with `useSelect`. Keep the computed values in the
state, or compute them in the component, from the selected parts.

Values that are numbers, strings or booleans are fine, like `state.items.length`, since they
are compared by value. A selector that returns a filtered array directly, like
`useObject((state: State) => state.items.filter(...))`, is fine too, since `useObject` compares
its items. Methods that strings also have, like `slice` and `concat`, are only reported with
[type information](#type-information).

---

### avoid-use-all-state

A warning for `useAllState()`, and for `useSelect((state) => state)`, which re-render the
component on every state change, even when the parts it uses didn't change:

```tsx
const state = useAllState<State>();                         // Warning
return <p>{state.user.name}</p>;

const name = useSelect((state: State) => state.user.name);  // OK
return <p>{name}</p>;
```

Also for `useSelector` and `useObject` with a selector that returns the whole state. Not
reported in tests. With [type information](#type-information), not reported when the state is
a number, string or boolean, since then the component needs all of it. Otherwise, when the
component really needs the whole state, use `// eslint-disable-next-line`.

Quick fix (automatic): replace it with one `useSelect` for each path the component reads, named
after the path:

```tsx
const state = useAllState<State>();                          // Before
const label = state.user.name + state.user.age;

const userName = useSelect((state: State) => state.user.name); // After
const userAge = useSelect((state: State) => state.user.age);
const label = userName + userAge;
```

`const { user, items } = useAllState<State>()` becomes one `useSelect` for each property. The
fix is not offered when the component uses the state itself (like `console.log(state)`), when
the state type is not written in the code (as in `useAllState<State>()` or
`const state: State = useAllState()`), or when a new name is already used.

---

### store-in-selector

An error for a selector of `useSelect`, `useSelector` or `useObject`, or a condition of
`waitCondition`, `dispatchWhen` or `useDispatchWhen`, that dispatches, or reads the state from
somewhere other than its parameter:

```tsx
const state = useAllState<State>();
const items = useSelect((s: State) => state.items);                            // Error
const items = useSelect((s: State) => store.state.items);                      // Error
const items = useSelect((s: State) => { dispatch(new X()); return s.items; }); // Error
const items = useSelect((s: State) => s.items);                                // OK
```

Kiss runs selectors and conditions with the current state, many times, on every state change.
A variable with the whole state, from `useAllState`, has the state of the last render, which
may be outdated.

Reports dispatches, `store.state`, `this.state` (in actions), and variables with the whole
state: from `useAllState`, or from a selector that returns the whole state, like
`useSelect((state) => state)`. Values selected by other selectors are fine, like props:

```tsx
const ready = useSelect((s: State) => s.ready);
const count = useSelect((s: State) => ready ? s.items.length : 0); // OK
```

With [type information](#type-information), it finds stores imported from other files.

Quick fix (automatic): replace `store.state`, `this.state`, or a variable with the whole state,
with the parameter.

---

### dispatch-in-render

A warning for a dispatch that runs while a component renders. It dispatches again on every
render, and loops forever when the action changes the state:

```tsx
function User() {
  const dispatch = useDispatch();
  dispatch(new LoadUser());                                            // Warning
  useDispatch({ onMount: (store) => store.dispatch(new LoadUser()) }); // OK
  return <button onClick={() => dispatch(new LoadUser())} />;          // OK
}
```

Checks the body of function components (functions whose name starts with an uppercase letter,
and that return JSX or call hooks, functions wrapped in `memo` or `forwardRef`, and top-level
functions that return JSX), and of custom hooks (functions whose name starts with `use`). Dispatches in event handlers, effects,
`useDispatch` options, and other nested functions, are not reported.

It recognizes the functions returned by `useDispatch`, `useDispatchAndWait` and the other
dispatch hooks, the methods of `useStore()`, and stores created in the same file. With
[type information](#type-information), it also finds stores imported from other files.

---

### store-state-in-render

A warning for reading `store.state` while a component renders. It reads the state once, and
the component doesn't re-render when the state changes:

```tsx
import { store } from './store';

function User() {
  const name = store.state.user.name;                         // Warning
  const name = useSelect((state: State) => state.user.name);  // OK
}
```

Reading `store.state` in event handlers and effects is fine. Checks the same functions as
[`dispatch-in-render`](#dispatch-in-render). It needs [type information](#type-information) to
know that `store` is a Kiss store, unless the store is created in the same file, or its type is
written, like `store: Store<State>`.

Quick fix (suggestion): read it with `useSelect`, adding the import if needed:

```tsx
const name = store.state.user.name;                         // Before
const name = useSelect((state: State) => state.user.name);  // After
```

Not offered when the read doesn't run on every render (inside an `if`, after `&&`, or after an
early `return`), since a hook can't be called there.

---

### then-on-dispatch-and-wait

A warning for `.then(...)` on the promise returned by `dispatchAndWait`, when the callback
ignores the status. When the action fails with a `UserException` (which is shown to the user),
or is aborted, the promise still resolves, so the callback runs anyway:

```ts
dispatchAndWait(new SaveUser()).then(() => navigate('/home'));    // Warning
dispatchAndWait(new SaveUser()).then((status) => {                // OK
  if (status.isCompletedOk) navigate('/home');
});
```

Checks the `dispatchAndWait` of the store, of actions, of `useStore()`, and the function returned
by `useDispatchAndWait()`. Not reported when the callback reads its parameter, or names it with
a leading `_`, like `_status`. If the callback must always run, use `.finally(...)` instead.

Quick fix (suggestion): wrap the callback's body in `if (status.isCompletedOk) { ... }`, adding
the `status` parameter if needed.

---

### stale-state-after-await

An error for an async `reduce` that copies `this.state` to a local variable before an
`await`, and uses that variable after the `await` to build the state it returns.
`this.state` always has the current state, but the variable keeps the old one. If other
actions change the state during the `await`, their changes are lost:

```ts
async reduce() {
  const s = this.state;
  const user = await api.loadUser();

  return (state: State) => s.copy({ user });     // Error
  return (state: State) => state.copy({ user }); // OK
}
```

Uses that build the returned state are the ones in the `return`, and in other local
variables that end up in the `return`:

```ts
async reduce() {
  const s = this.state;
  const user = await api.loadUser();
  const newState = s.copy({ user }); // Error
  return () => newState;
}
```

Uses in a condition, like `if (s.user === null)`, and inside an `await`, like
`await api.load(s.id)`, are not reported. The order is the source order, so an `await`
inside an `if` counts for the code after the `if`, but not for the `else` branch.

Quick fix (suggestion): use the state parameter of the returned function (or `this.state`)
instead of the variable.

---

### prefer-state-parameter

A warning for `this.state` inside the function returned by an async `reduce`:

```ts
async reduce() {
  const user = await api.loadUser();

  return (state: State) => this.state.copy({ user }); // Warning
  return (state: State) => state.copy({ user });      // OK
}
```

The returned function gets the current state as its parameter, so use it. When that function
runs, `this.state` has the same value, so this is not a bug. But reading `this.state` there
hides that the function gets the state, and it's easy to confuse with reading it before an
`await` (see [`stale-state-after-await`](#stale-state-after-await)).

Quick fix (automatic): replace `this.state` with the parameter. If the function has no
parameter, the fix also adds a `state` parameter, with its type, but only with
[type information](#type-information):

```ts
return () => this.state.copy({ user });             // Before
return (state: State) => state.copy({ user });      // After
```

---

### no-state-mutation

An error for code that changes the state in place, instead of creating a new state. Kiss
compares states by identity (`===`), so the components don't re-render, and the change isn't
persisted:

```ts
reduce() {
  this.state.items.push(item);                      // Error
  this.state.count = 5;                             // Error
  return new State([...this.state.items, item], 5); // OK
}

const items = useSelect((state: State) => state.items.sort());     // Error
const items = useSelect((state: State) => state.items.toSorted()); // OK
```

It reports assignments (`=`, `+=`, `++`, `delete`), `Object.assign(state, ...)`, and the
methods that change arrays (`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`,
`fill`, `copyWithin`), maps (`set`, `delete`, `clear`) and sets (`add`, `delete`, `clear`).
It checks:

* `this.state` and `this.initialState` in actions.
* The state parameter of the function returned by an async `reduce`, of the selectors of
  `useSelect` and `useObject`, of the conditions of `waitCondition`, `dispatchWhen` and
  `useDispatchWhen`, and of the function of `UpdateStateAction`.
* The state from `useAllState()`, and the value from a `useSelect` that returns a part of the
  state, like `useSelect((state: State) => state.items)`.

Changing new objects is fine, like `const items = [...this.state.items]; items.push(x)`.
Methods that return a new array, like `toSorted`, are fine too.

Without [type information](#type-information), only paths that start at the state are
checked, like `this.state.items.push(x)`, and the methods of maps and sets are not checked,
since state classes often have methods called `add` or `set` that return a new state. With
it, the rule also follows variables (`const items = this.state.items; items.push(x)`), loops
and callbacks over state arrays (`for (const item of this.state.items) item.done = true`),
and `store.state`, and it only reports the methods of real arrays, maps and sets.

Quick fix (suggestion): for `sort`, `reverse` and `splice`, when the result is used, use
`toSorted`, `toReversed` or `toSpliced`. Only with type information, and when your
TypeScript `lib` has them (ES2023).

---

### reduce-without-await

A warning for an async `reduce` without any `await`:

```ts
async reduce() {                         // Warning
  return (state: State) => state.add(1);
}

reduce() {                               // OK
  return this.state.add(1);
}
```

This doesn't lose state changes, since the returned function gets the current state. But
the `async` makes the action async for nothing: `dispatchSync` throws, `isWaiting` is true
for a moment, and the component renders one more time.

Not reported when the action is async anyway (its `before` is async, or it sets
`checkInternet`), when it uses `retry` (which needs an async `reduce`), when it overrides
`wrapReduce`, or when `reduce` may return a promise, like `return loadReducer()`. An `await`
inside a nested function doesn't count. With [type information](#type-information), it also
finds `before`, `checkInternet` and `retry` inherited from superclasses in other files, and
knows more about what `reduce` returns.

Quick fix (suggestion): make `reduce` sync. It removes `async`, and turns `return () => x` and
`return (state) => x` into `return x`, with `this.state` instead of `state`:

```ts
async reduce() { return (state: State) => state.add(1); } // Before
reduce() { return this.state.add(1); }                    // After
```

The suggestion is not offered when `reduce` has a declared return type, or when a returned
function has a block body.

---

### prefer-return-null

A warning for a reducer that returns the state unchanged. Kiss treats this the same way as
returning `null`, but `null` says clearly that the state didn't change:

```ts
reduce() {
  if (this.state.user === null) return this.state; // Warning
  if (this.state.user === null) return null;       // OK
  ...
}

async reduce() {
  await api.save();
  return (state: State) => state;                  // Warning
  return null;                                     // OK
}
```

For an async `reduce`, it reports returned functions like `(state) => state`,
`() => this.state`, and `(state) => { return state; }`. Not reported when `reduce` seems to
mutate the state, like `this.state.items.push(x)`, since the problem there is the mutation.

Quick fix (automatic): return `null`. Not offered when the declared return type of `reduce`
doesn't accept `null`, like `reduce(): State`.

---

### async-after

An error for an `async after()` method, or an `after()` that returns a promise. Kiss requires
`after` to be sync. It doesn't wait for the promise, so the code after the first `await`
runs after the action finished, and its errors are only logged:

```ts
async after() { await this.cleanup(); } // Error
after() { this.cleanup(); }             // OK
```

TypeScript allows it, since `void` methods can be overridden with async ones. Without type
information, an `after()` is reported if it's `async`, or if its declared return type is a
`Promise`. With [type information](#type-information), also if it returns a promise without
declaring it, like `after() { return this.cleanup(); }`.

Quick fix (suggestion): remove `async`. Only when `after` has no `await`.

---

### after-throws

A warning for a `throw` in the `after` method of an action, outside a `try` that catches it.
Kiss ignores errors thrown by `after`, and only logs them, so the error is lost:

```ts
after() {
  if (this.state.user === null) throw new Error('No user'); // Warning
}

after() {
  try {
    if (this.state.user === null) throw new Error('No user'); // OK
  } catch (error) {
    console.log(error);
  }
}
```

A `throw` inside a `try` with only a `finally`, or inside a `catch`, is reported. A `throw`
inside a function declared in `after`, like a callback, is not reported, since it may run
somewhere else.

---

### missing-super-in-override

An error for an override that silently turns off a Kiss feature, because it doesn't call
`super`:

- `before()` without `super.before()`, in an action that sets `checkInternet` (or inherits
  it). The default `before` is what checks the internet, so the check stops working:

  ```ts
  class LoadUser extends Action {
    checkInternet = { dialog: true };
    async before() { await this.prepare(); }                      // Error
    async before() { await super.before(); await this.prepare(); } // OK
  }
  ```

  It's also reported in `checkInternet`, when the action inherits a `before` that doesn't
  call `super.before()`:

  ```ts
  abstract class Action extends KissAction<State> {
    async before() { await prepare(); }
  }

  class LoadUser extends Action {
    checkInternet = { dialog: true }; // Error
  }
  ```

- `reduce()` in a subclass of `OptimisticCommand`. Its `reduce` does the optimistic update,
  so overriding it turns that off. Implement `optimisticValue`, `getValueFromState`,
  `applyValueToState` and `sendCommandToServer` instead.

A `before` that reads `this.checkInternet` is not reported, since it probably checks the
internet by itself. Without type information, only `checkInternet` and superclasses declared
in the same file are found. With [type information](#type-information), also the ones in
other files.

Quick fix (suggestion), for `before`: add `await super.before();` as the first statement, and
make `before` async if it isn't. Not offered when `before` has a declared return type that is
not a `Promise`.

---

### retry-requires-async-reduce

An error for an action with `retry` whose `reduce` is sync:

```ts
class LoadText extends Action {
  retry = { on: true }; // Error
  reduce() { ... }
}

class LoadText extends Action {
  retry = { on: true }; // OK
  async reduce() { ... }
}
```

Retry only works with async reducers. A sync reducer is a pure function of the state, so if
it fails once, it fails again. Dispatching this action fails with a `StoreException`, even if
the reducer succeeds.

Any `retry` options turn retry on, like `retry = { maxRetries: 5 }`. Not reported for
`retry = { on: false }`.

Quick fixes (suggestions): remove `retry`, or make `reduce` async. The second one adds
`async`, and turns each `return x` into `return () => x`, since an async reducer returns a
function:

```ts
reduce() { return this.state.add(1); }              // Before
async reduce() { return () => this.state.add(1); }  // After
```

---

### retry-without-non-reentrant

A warning for an action with `retry`, but not `nonReentrant`. The Kiss docs recommend it for
most actions with `retry`, so that a new dispatch doesn't run while the previous one is
still retrying:

```ts
class LoadText extends Action {
  retry = { on: true };     // Warning
  async reduce() { ... }
}

class LoadText extends Action {
  retry = { on: true };     // OK
  nonReentrant = true;
  async reduce() { ... }
}
```

Not reported when the action (or its superclass) declares `nonReentrant`, even as `false`,
or overrides `abortDispatch`. Also not reported for `OptimisticCommand`, which is always
non-reentrant, for `retry = { on: false }`, for a sync `reduce` (see
[`retry-requires-async-reduce`](#retry-requires-async-reduce)), or in tests. With
[type information](#type-information), it also checks the superclasses of other files.

Quick fix (suggestion): add `nonReentrant = true;`.

---

### async-feature-in-sync-action

A warning for `nonReentrant` or `checkInternet` in an action whose `reduce` is sync. These
features are meant for async actions:

```ts
class Increment extends Action {
  nonReentrant = true;                       // Warning
  reduce() { return this.state.add(1); }
}

class Increment extends Action {
  checkInternet = { dialog: true };          // Warning
  reduce() { return this.state.add(1); }
}
```

A sync action finishes during its dispatch, so it never runs twice at the same time, and
`nonReentrant` does nothing. And a sync reducer doesn't use the network, but `checkInternet`
makes the action async, so `dispatchSync` of it throws.

Not reported when the action (or its superclass) overrides `before` or `wrapReduce`, which
may make it async, or in tests. `nonReentrant` is also not reported when the action sets
`checkInternet` or `retry`. For `retry`, see
[`retry-requires-async-reduce`](#retry-requires-async-reduce). With
[type information](#type-information), it also checks the superclasses of other files.

Quick fix (suggestion): remove the property.

---

### extend-base-action

A warning for an action that extends `KissAction` directly, instead of your app's base
action, like `abstract class Action extends KissAction<State> {}`. The base action is where
you add what all your actions share, like getters for parts of the state:

```ts
class LoadUser extends KissAction<State> { ... } // Warning
class LoadUser extends Action { ... }            // OK
```

If there is no base action, the warning says to create one. Not reported for abstract
classes, actions with a generic state (like `KissAction<St>`), or in tests.

Without [type information](#type-information), it only finds the base actions declared in
the same file. With it, it finds the abstract classes of your project that extend
`KissAction` with the same state directly.

Quick fixes (suggestions): extend the base action, one for each base action found (up to
3). It adds the import of the base action, and removes the import of `KissAction` if it's
no longer used.

---

### avoid-abort-dispatch

An opt-in warning for every override of `abortDispatch` in an action. The Kiss docs call it "a
complex power feature that you may not need to learn". Most actions should use a feature
instead, like `nonReentrant`, `retry` or `checkInternet`:

```ts
class LoadUser extends Action {
  abortDispatch() { return this.state.user === null; } // Warning
}
```

This rule is not in `kiss.configs.recommended`. Turn it on to make each override deliberate,
with an `eslint-disable` comment where you really need it:

```js
rules: {
  'kiss-for-react/avoid-abort-dispatch': 'warn',
}
```

Overrides as a property with a function, like `abortDispatch = () => ...`, are also reported.
Not reported in tests.

---

### avoid-wrap-reduce

An opt-in warning for every override of `wrapReduce` in an action. The Kiss docs call it "a
complex power feature that you may not need to learn". Most actions should use a feature
instead, like `nonReentrant`, `retry` or `checkInternet`:

```ts
class LoadUser extends Action {
  wrapReduce(reduce: () => ReduxReducer<State>) { ... } // Warning
}
```

This rule is not in `kiss.configs.recommended`. Turn it on to make each override deliberate,
with an `eslint-disable` comment where you really need it:

```js
rules: {
  'kiss-for-react/avoid-wrap-reduce': 'warn',
}
```

Overrides as a property with a function, like `wrapReduce = () => ...`, are also reported.
Not reported in tests.

---

### missing-key-params

An opt-in warning for a non-reentrant action with fields, that doesn't override
`nonReentrantKeyParams` or `computeNonReentrantKey`. Non-reentrant actions are the ones with
`nonReentrant = true` (in the action or a superclass), and the subclasses of
`OptimisticCommand`. By default, the non-reentrant key doesn't depend on the fields, so all
instances share it. For example, `SaveTodo('A')` then blocks `SaveTodo('B')`:

```ts
class SaveTodo extends OptimisticCommand<State> { // Warning
  constructor(readonly todoId: string) { super(); }
}

class LoadTodo extends Action { // Warning
  nonReentrant = true;
  constructor(readonly todoId: string) { super(); }
}

class SaveTodo extends OptimisticCommand<State> { // OK
  constructor(readonly todoId: string) { super(); }
  nonReentrantKeyParams() { return this.todoId; }
}
```

It's opt-in, since sharing the key is often intended. Without
[type information](#type-information), the class must extend `KissAction` or
`OptimisticCommand` in the same file (directly, or through its superclasses).

Quick fix (suggestion): override `nonReentrantKeyParams()`, returning the fields. You may
then remove the fields that shouldn't be part of the key.

---

### dispatch-sync-async-action

An error for `dispatchSync` of an async action, since `dispatchSync` only accepts sync
actions. An action is async if its `reduce` or `before` returns a promise. This includes
the default `before`, when the action sets `checkInternet` (or inherits it):

```ts
class LoadUser extends Action {
  async reduce() { ... }
}

abstract class OnlineAction extends Action {
  checkInternet = { dialog: true };
}

class SaveDraft extends OnlineAction {
  reduce() { ... }
}

store.dispatchSync(new LoadUser());  // Error: `reduce` returns a promise.
store.dispatchSync(new SaveDraft()); // Error: it sets `checkInternet`.
store.dispatch(new LoadUser());      // OK
```

It checks any call to a method or function called `dispatchSync`, like `store.dispatchSync(...)`,
`this.dispatchSync(...)`, or `dispatchSync(...)` with the function returned by
`useDispatchSync()`. It also checks the methods the action inherits from its superclasses.

The rule only reports when the action's class is known. With
[type information](#type-information), that's whenever the action's type is a specific
action class. For example, it doesn't report `dispatchSync(action)` when `action` is typed as
`KissAction<State>`. Without type information, the action must be created with `new` (in the
call, or in a `const`), and its class must be declared in the same file.

Quick fixes (suggestions): replace `dispatchSync` with `dispatch` or `dispatchAndWait`.

---

### dispatch-same-action-twice

An error for the same action object dispatched twice. Kiss throws a `StoreException`, since
each dispatch needs a new action:

```ts
const action = new LoadUser();
store.dispatch(action);
store.dispatch(action);              // Error
store.dispatch(new LoadUser());      // OK
```

Any dispatch counts: `dispatch`, `dispatchAndWait`, `dispatchSync`, `dispatchWhen`, the actions
in the array of `dispatchAll` and `dispatchAndWaitAll`, and the functions returned by hooks like
`useDispatch()`. That's for the store, `useStore()`, and actions (`this.dispatch(...)`).

Only actions created with `new` and kept in a `const` are checked, between two dispatches in
the same function. Not reported when the dispatches are in different branches of an `if`, `?:`,
`switch`, or `try` and `catch`, or when the code always leaves (with `return`, `throw`, `break`
or `continue`) after the first dispatch. With [type information](#type-information), the action
must be a Kiss action.

Quick fix (suggestion): dispatch a new action, by repeating the `new` expression, like
`new LoadUser()`.

---

### dispatch-before-store-ready

An error for a dispatch right after creating a store with a persistor, without waiting for
`store.ready()`. Kiss throws a `StoreException`, since the persisted state is still being read:

```ts
const store = createStore<State>({ initialState: State.initialState, persistor });
store.dispatch(new InitApp());   // Error
await store.ready();
store.dispatch(new InitApp());   // OK
```

The store must be a `const`, created with `createStore` or `new Store` from Kiss, with a
`persistor` option. Only the code of the same function (or module) that creates the store is
checked, in source order. A dispatch is fine after any `await` that waits for `store.ready()`,
like `await Promise.all([store.ready(), ...])`. Dispatches inside other functions, like
`store.ready().then(() => store.dispatch(...))`, are not checked.

Quick fix (suggestion): add `await store.ready();` before the dispatch, when the function is
`async`, or at the top level of a module.

---

### dispatch-and-wait-unlimited-retries

A warning for `dispatchAndWait` or `dispatchAndWaitAll` with an action that retries forever,
with `retry = { maxRetries: -1 }` or `retry = { unlimitedRetries: true }`. The promise never
resolves while the action keeps failing:

```ts
class LoadText extends Action {
  retry = { maxRetries: -1 };
  async reduce() { ... }
}

await store.dispatchAndWait(new LoadText()); // Warning
store.dispatch(new LoadText());              // OK
```

It checks any call to a method or function called `dispatchAndWait` or `dispatchAndWaitAll`,
like `store.dispatchAndWait(...)`, `this.dispatchAndWait(...)`, or the functions returned by
`useDispatchAndWait()` and `useDispatchAndWaitAll()`. It also checks the `retry` the action
inherits from its superclasses. Not reported in tests.

The rule only reports when the action's class is known. With
[type information](#type-information), that's whenever the action's type is a specific
action class. Without it, the action must be created with `new` (in the call, or in a
`const`), and its class must be declared in the same file.

---

### wait-fail-never-matches

A warning for `isWaiting` or `useIsWaiting` with a sync action. It's always `false`, since a
sync action finishes during its dispatch, before anything can wait for it:

```ts
class Increment extends Action {
  reduce() { return this.state.add(1); }
}

const isWaiting = useIsWaiting(Increment);    // Warning
const isWaiting = useIsWaiting(LoadUser);     // OK, if `LoadUser` is async
const isFailed = useIsFailed(Increment);      // OK, sync actions can fail
```

An action is sync when its `reduce` and `before` are sync, and it doesn't set
`checkInternet`. Not reported for abstract classes (`isWaiting` also matches their
subclasses), for classes that have subclasses, for actions that override `wrapReduce` or
turn on `retry` (which may make them async), or in tests.

The action's class must be known. Without [type information](#type-information), it must
be declared in the same file, with its superclasses.

---

### wait-condition-without-timeout

A warning for `waitCondition`, `dispatchWhen` or `useDispatchWhen` with no timeout
(`{ timeoutMillis: 0 }`, or a negative number), in code that is not a test:

```ts
store.dispatchWhen(new BuyStock('IBM'), (state) => state.price >= 100, { timeoutMillis: 0 });      // Warning
store.dispatchWhen(new BuyStock('IBM'), (state) => state.price >= 100, { timeoutMillis: 60_000 }); // OK
```

While a wait is pending, its condition runs on every state change, and it can't be cancelled.
A wait without a timeout may never end. Use a timeout, or put the logic in an action.

It checks the methods of the store, of `useStore()`, and of actions (like `this.waitCondition`),
and the function returned by `useDispatchWhen()`. Not reported in tests. With
[type information](#type-information), the object must be a Kiss store or action. Without it,
any object with these methods is checked, since the `timeoutMillis` option is specific to Kiss.

---

### state-class-must-be-immutable

A warning for a field of a state class that is not `readonly`. Kiss compares states by
identity (`===`), so changing a field in place doesn't re-render the components, and the
change isn't persisted. Create a new state instead:

```ts
class State {
  count: number;                         // Warning
  readonly name: string;                 // OK
  constructor(public age: number) {}     // Warning
  constructor(readonly age: number) {}   // OK
}
```

A state class is the `State` of a `KissAction<State>`, `Store<State>` or
`createStore<State>`, and the classes it contains: the types of its fields (also inside
arrays, maps, sets and unions, like `readonly User[]` or `Settings | null`), and their
superclasses. Static fields, getters and methods are not reported.

Without [type information](#type-information), only the state classes declared in the same
file as the action or store are found. With it, they are found in all files of the project.

Quick fix (automatic): add `readonly`. Not offered when the same file assigns the field outside
the constructor, since the code would no longer compile.

---

### prefer-readonly-collections

A warning for a field of a state class whose type is a mutable array, `Map` or `Set`. With a
readonly type, TypeScript doesn't let the code change the collection in place, which
wouldn't re-render the components:

```ts
class State {
  readonly users: User[];                       // Warning
  readonly users: readonly User[];              // OK
  readonly ids: Set<string>;                    // Warning
  readonly ids: ReadonlySet<string>;            // OK
  readonly byId: Map<string, User>;             // Warning
  readonly byId: ReadonlyMap<string, User>;     // OK
}
```

Only the declared type of the field is checked (and the members of a union, like
`User[] | null`), not its type arguments. Fields without a declared type are not checked.
Not reported in tests. See
[`state-class-must-be-immutable`](#state-class-must-be-immutable) for which classes are state
classes. Without [type information](#type-information), only the state classes declared in
the same file as the action or store are found.

Quick fix (suggestion): change the type to `readonly T[]`, `ReadonlyArray<T>`, `ReadonlyMap`
or `ReadonlySet`. The code that changes the collection in place then no longer compiles, which
shows where to fix it.

---

### non-state-object-in-state

A warning for a field of a state class that holds an object that is not state. The state
should only have data, that can be compared, saved and restored:

```ts
class State {
  readonly user: Promise<User> | null;              // Warning
  readonly timer: NodeJS.Timeout | null;            // Warning
  readonly input: RefObject<HTMLInputElement>;      // Warning
  readonly user: User | null;                       // OK
  readonly format: (user: User) => string;          // OK
}
```

Reported for:

* A `Promise`, a Node timer (`NodeJS.Timeout`), an `AbortController`, an `AbortSignal`, a
  `WebSocket`, an `EventSource` or a `Worker`. Keep these outside the state, for example in a
  module, or in the action that uses them.
* A DOM node (`Node`, `Element`, `HTMLElement` and its subtypes), a React ref (`RefObject`,
  `MutableRefObject`), or a React element (`ReactElement`, `ReactNode`, `JSX.Element`). Keep
  these in the component.

Subclasses, union members and type arguments are checked too, like `Promise<User>[]` or
`ReadonlyMap<string, AbortController>`. Functions are fine. In the browser, a timer from
`setTimeout` is a `number`, which is fine. Needs [type information](#type-information).

---

### copy-missing-field

A warning for a `copy` (or `copyWith`) method of a state class that can't change some of
the fields. The copies always keep the old values of those fields:

```ts
class State {
  constructor(readonly name: string, readonly age: number) {}

  copy({ name }: { name?: string }) {                   // Warning: `age` is missing.
    return new State(name ?? this.name, this.age);
  }

  copy({ name, age }: { name?: string, age?: number }) { // OK
    return new State(name ?? this.name, age ?? this.age);
  }
}
```

Only methods that create a new instance of the class (`new State(...)`) are checked. The
fields can be listed as a destructured object, an object type, or separate parameters with
the names of the fields. A `copy(changes: Partial<State>)` has all the fields, and methods
that use `...this` or `Object.assign` are not checked. Private fields are not required.
Methods like `withName(name)` are not checked, since they change one field on purpose.

Without [type information](#type-information), only the state classes declared in the same
file as the action or store are found, and only fields declared in the same file are known.

Quick fix (suggestion): add the missing fields to the parameters, and use them in the new
instance, so `this.age` becomes `age ?? this.age`. Only offered when the method creates one
instance, which uses each missing field once (as `this.field`), and the fields are declared in
the class with a type that can't be `null` or `undefined`.

---

### missing-initial-state

An [opt-in](#turning-rules-on-and-off) warning for a store whose initial state is not the static `initialState` of the state
class. Keeping the initial state in the state class keeps it in one place, to reuse it in
tests and to reset the state:

```ts
class State {
  static initialState: State = new State({ todoList: TodoList.empty });
}

const store = createStore<State>({ initialState: new State(...) });     // Warning
const store = createStore<State>({ initialState: State.initialState }); // OK
```

Reported when the state class has no static `initialState` (a property, getter or method),
or when the store calls its constructor directly. Checks `createStore` and `new Store`. Not
reported for states that are not classes, like `createStore<number>` or a plain object, or in
tests.

Without [type information](#type-information), the static `initialState` is only known when
the state class is declared in the same file. Otherwise, only a direct call of the constructor
is reported.

Quick fix (suggestion): replace the constructor call with `State.initialState` (or
`State.initialState()`, if it's a method). Only offered when the state class has it.

---

### route-in-state

An opt-in warning for a field of a state class named `currentRoute`, `routeName`,
`currentPath`, `pathname` or `location`. Get the current route from your router instead,
like React Router's `useLocation()`. A copy in the state can get out of sync with the router:

```ts
class State {
  readonly pathname: string;   // Warning
}

const { pathname } = useLocation(); // OK
```

It's opt-in, since it only looks at the name of the field. Not reported in tests. See
[`state-class-must-be-immutable`](#state-class-must-be-immutable) for which classes are state
classes. Without [type information](#type-information), only the state classes declared in
the same file as the action or store are found.

To turn it on:

```js
rules: {
  'kiss-for-react/route-in-state': 'warn',
},
```

---

### user-exception-outside-action

A warning for a `UserException` thrown where Kiss can't catch it: in a component, in a hook,
in a function declared inside them (like an event handler or an effect), or in the `after`
method of an action. Kiss only shows a `UserException` to the user when it's thrown from the
`before` or `reduce` of an action. Elsewhere, it's a plain error, and the user sees nothing:

```tsx
const dispatch = useDispatch();

<button onClick={() => { throw new UserException('Invalid'); }} />       // Warning
<button onClick={() => dispatch(new UserExceptionAction('Invalid'))} />  // OK
```

A component is a function named with an uppercase first letter that has JSX or calls a hook,
and a hook is a function named `useX`. Only `UserException` imported from `kiss-for-react`
is checked. Not reported: throws in the `before`, `reduce` or `wrapError` of an action, throws
in other functions (they may be called from an action), and throws caught by a `try` in the
same function.

Quick fix (suggestion): dispatch a `UserExceptionAction` instead, followed by `return;` (since
a `throw` stops the function). It's offered in the `after` method (with `this.dispatch`), and
in functions inside a component or hook that has a `dispatch` from `useDispatch()`. It's not
offered while rendering (dispatching there is wrong too), or when the `UserException` has
options other than its message, or when the function returns a value.

---

### user-exception-without-cause

A warning for a `UserException` that replaces another error, without keeping it as its
`hardCause`. The original error is lost, so you can't log it (for example, in the
`errorObserver`) to find out what really went wrong:

```ts
try {
  return this.state.copy({ count: parseNumber(text) });
} catch (error) {
  throw new UserException('Please enter a valid number');                       // Warning
  throw new UserException('Please enter a valid number').withHardCause(error); // OK
}
```

It checks the `UserException`s created in a `catch` clause, in the `wrapError` of an action
or persistor, and in the store's `globalWrapError`. Not reported: a `UserException` with the
`hardCause` option, or with a method called on it (like `.withHardCause(error)`), or stored in
a variable. Also not reported when the error is ignored on purpose: a `catch` without a
parameter, or a parameter whose name starts with `_`. Not reported in tests.

Quick fix (automatic): add `.withHardCause(error)`.

---

### throw-in-global-wrap-error

A warning for a `throw` in the store's `globalWrapError`. Kiss uses a thrown error just like
a returned one, but returning it makes clear that it replaces the original error, as the Kiss
docs recommend:

```ts
createStore<State>({
  globalWrapError: (error) => {
    throw new UserException('Failed').withHardCause(error);  // Warning
    return new UserException('Failed').withHardCause(error); // OK
  },
});
```

It checks the `globalWrapError` given to `createStore` or `new Store`, also when it's a
function declared in the same file. Not reported: throws caught by a `try` in
`globalWrapError`, and throws in functions declared inside it.

Quick fix (automatic): change `throw` to `return`. Not offered when `globalWrapError` declares
a return type, since the returned error may not match it.

---

### expect-without-waiting

A warning, in tests, for `store.dispatch(...)` of an async action, followed by an `expect`
that reads `store.state`, without waiting in between. The `expect` checks the state before
the action finishes:

```ts
store.dispatch(new LoadUser());                // Warning
await store.dispatchAndWait(new LoadUser());   // OK
expect(store.state.user.name).toBe('Mary');
```

The `expect` must be in the same block, after the dispatch. Any `await` between them counts as
waiting. Not reported when the test later waits and checks `store.state` again, since then the
first `expect` checks the state while the action runs, on purpose:

```ts
store.dispatch(new LoadUser());
expect(store.state.isLoading).toBe(true);      // OK
await store.waitCondition((state) => !state.isLoading, { timeoutMillis: 1000 });
expect(store.state.user.name).toBe('Mary');
```

Only reported in tests. An action is async if its `reduce` or `before` returns a promise (or it
sets `checkInternet`). Without [type information](#type-information), the action's class must be
declared in the same file.

Quick fix (automatic): use `await store.dispatchAndWait(...)`. If the test function is not
`async`, it's made `async`. There is no fix when the function can't be made `async`, for example
a helper function with a `void` return type.

---

### testing-feature-in-production

A warning for Kiss features meant for tests, used in code that is not a test:

```ts
store.mocks.add(LoadUser, () => null);   // Warning
store.record.start();                    // Warning
await store.waitActionType(LoadUser);    // Warning
await store.waitAllActions([]);          // Warning: waits for all actions.

await store.waitAllActions([action]);    // OK
await store.dispatchAndWait(action);     // OK
```

The features are `store.mocks`, `store.record`, the wait methods that the Kiss docs say are
only for tests (`waitActionType`, `waitAllActionTypes`, `waitAnyActionTypeFinishes` and
`waitActionCondition`), and `waitAllActions` with no actions. `mocks` replaces the actions
you dispatch, and `record` records every state change. Waiting for actions that other code
dispatches, or for all actions, can easily deadlock. The wait methods are also checked in the
store returned by `useStore()`, and in actions, like `this.waitActionType(...)`.

Not reported in tests. The store must clearly be a Kiss store. With
[type information](#type-information), its type tells. Without it, the store must be created in
the same file, with `createStore` or `new Store`, or come from `useStore()`.

---

### action-status-details-in-production

A warning for `hasFinishedMethodBefore`, `hasFinishedMethodReduce` or `hasFinishedMethodAfter`
of an action's status, in code that is not a test. They are meant for tests and debugging. In
the app, use `isCompleted`, `isCompletedOk` or `isCompletedFailed`:

```ts
if (action.status.hasFinishedMethodReduce) ...   // Warning
if (action.status.isCompletedOk) ...             // OK
```

Not reported in tests. With [type information](#type-information), any `ActionStatus` is
checked. Without it, only `something.status`, and the status returned by
`await dispatchAndWait(...)`.

Quick fix (automatic): replace `hasFinishedMethodAfter` with `isCompleted`, which has the same
value.

---

### debug-observer-in-release

A warning for debug tools given to the store without a check for the environment. They are
only useful while debugging, and slow down your app in production:

- `PersistorPrinterDecorator`, which prints all persistence calls.
- An `actionObserver` or `stateObserver` that only prints to the console (`console.log`,
  `console.info` or `console.debug`).

```ts
createStore<State>({ persistor: new PersistorPrinterDecorator(persistor) });            // Warning
createStore<State>({ persistor: isDev ? new PersistorPrinterDecorator(persistor) : persistor }); // OK

createStore<State>({ actionObserver: (action) => console.log(action) });                // Warning
createStore<State>({ actionObserver: isDev ? (action) => console.log(action) : undefined }); // OK
```

Not reported inside an `if`, a conditional expression (`a ? b : c`), a `switch`, or the right
side of `&&`, `||` and `??`. Observers that do anything else, besides printing, are not
reported. Not reported in tests.

Quick fixes (suggestions): remove the `PersistorPrinterDecorator`, keeping the persistor it
decorates, or remove the observer.

---

### action-name-ends-with-action

An opt-in warning for an action whose name doesn't end with `Action`:

```ts
class LoadUser extends Action { ... }        // Warning
class LoadUser_Action extends Action { ... } // Warning
class LoadUserAction extends Action { ... }  // OK
```

There are 3 ways to name actions, and one rule for each. Turn on only one of them:

| Rule                                                                                  | Example           |
|---------------------------------------------------------------------------------------|-------------------|
| [`action-name-ends-with-action`](#action-name-ends-with-action)                       | `LoadUserAction`  |
| [`action-name-ends-with-underscore-action`](#action-name-ends-with-underscore-action) | `LoadUser_Action` |
| [`action-name-without-action`](#action-name-without-action)                           | `LoadUser`        |

Only actions that can be dispatched are checked. Abstract classes, like the base action, are
not. Without [type information](#type-information), a class is an action if it declares
`reduce`, or inherits it from a class of the same file, or extends `OptimisticCommand`. With
it, any class that extends `KissAction` is an action.

Quick fix (suggestion): rename the action, like `LoadUser` to `LoadUserAction`, in the
whole file. ESLint can only change the current file, so it's not offered when the action is
exported. In that case, use your IDE's rename refactoring, which also renames it in the
other files. It's also not offered when the new name is already used in the file.

---

### action-name-ends-with-underscore-action

An opt-in warning for an action whose name doesn't end with `_Action`:

```ts
class LoadUser extends Action { ... }        // Warning
class LoadUserAction extends Action { ... }  // Warning
class LoadUser_Action extends Action { ... } // OK
```

There are 3 ways to name actions, and one rule for each. Turn on only one of them:

| Rule                                                                                  | Example           |
|---------------------------------------------------------------------------------------|-------------------|
| [`action-name-ends-with-action`](#action-name-ends-with-action)                       | `LoadUserAction`  |
| [`action-name-ends-with-underscore-action`](#action-name-ends-with-underscore-action) | `LoadUser_Action` |
| [`action-name-without-action`](#action-name-without-action)                           | `LoadUser`        |

Only actions that can be dispatched are checked. Abstract classes, like the base action, are
not. Without [type information](#type-information), a class is an action if it declares
`reduce`, or inherits it from a class of the same file, or extends `OptimisticCommand`. With
it, any class that extends `KissAction` is an action.

Quick fix (suggestion): rename the action, like `LoadUser` to `LoadUser_Action`, in the
whole file. ESLint can only change the current file, so it's not offered when the action is
exported. In that case, use your IDE's rename refactoring, which also renames it in the
other files. It's also not offered when the new name is already used in the file.

---

### action-name-without-action

An opt-in warning for an action whose name ends with `Action`:

```ts
class LoadUserAction extends Action { ... }  // Warning
class LoadUser_Action extends Action { ... } // Warning
class LoadUser extends Action { ... }        // OK
```

There are 3 ways to name actions, and one rule for each. Turn on only one of them:

| Rule                                                                                  | Example           |
|---------------------------------------------------------------------------------------|-------------------|
| [`action-name-ends-with-action`](#action-name-ends-with-action)                       | `LoadUserAction`  |
| [`action-name-ends-with-underscore-action`](#action-name-ends-with-underscore-action) | `LoadUser_Action` |
| [`action-name-without-action`](#action-name-without-action)                           | `LoadUser`        |

Names that only contain `Action` elsewhere, like `ActionLog`, are fine.

Only actions that can be dispatched are checked. Abstract classes, like the base action, are
not. Without [type information](#type-information), a class is an action if it declares
`reduce`, or inherits it from a class of the same file, or extends `OptimisticCommand`. With
it, any class that extends `KissAction` is an action.

Quick fix (suggestion): rename the action, like `LoadUserAction` to `LoadUser`, in the
whole file. ESLint can only change the current file, so it's not offered when the action is
exported. In that case, use your IDE's rename refactoring, which also renames it in the
other files. It's also not offered when the new name is already used in the file, or is a
global, like `Error` for `ErrorAction`.

---

### action-file-name-ends-with-action

An opt-in warning for a file that declares actions, but whose name doesn't end with `Action`:

```ts
// LoadUser.ts
class LoadUser extends Action { ... } // Warning: rename the file to `LoadUserAction.ts`.
```

There are 2 ways to name the files that declare actions, and one rule for each. Turn on
only one of them:

| Rule                                                                          | Examples                                                    |
|-------------------------------------------------------------------------------|-------------------------------------------------------------|
| [`action-file-name-ends-with-action`](#action-file-name-ends-with-action)     | `LoadUserAction.ts`, `load-user-action.ts`, `load_user_action.ts` |
| [`action-file-name-starts-with-action`](#action-file-name-starts-with-action) | `ACTION_LoadUser.ts`, `ACTION_load_user.ts`                 |

Any case style is fine, like `LoadUserAction.ts`, `loadUserAction.ts`, `load-user-action.ts`
or `load_user_action.ts`. A file with more than one action can have any name that follows
the style, like `user-actions.ts` (the plural `Actions` is also fine).

The warning is shown on the first action of the file. Files without actions, `index` files,
and tests are not checked. Abstract classes, like the base action, don't count as actions.
With [type information](#type-information), it also finds actions that inherit `reduce` from
a class of another file.

There's no quick fix, because ESLint can't rename files. The message suggests a name, in the
case style of the current name. When the file has only one action, it's based on the action,
like `load-user-action.ts` for `LoadUser`. Rename the file with your IDE, which also updates
the imports.

---

### action-file-name-starts-with-action

An opt-in warning for a file that declares actions, but whose name doesn't start with
`ACTION_`:

```ts
// LoadUser.ts
class LoadUser extends Action { ... } // Warning: rename the file to `ACTION_LoadUser.ts`.
```

There are 2 ways to name the files that declare actions, and one rule for each. Turn on
only one of them:

| Rule                                                                          | Examples                                                    |
|-------------------------------------------------------------------------------|-------------------------------------------------------------|
| [`action-file-name-ends-with-action`](#action-file-name-ends-with-action)     | `LoadUserAction.ts`, `load-user-action.ts`, `load_user_action.ts` |
| [`action-file-name-starts-with-action`](#action-file-name-starts-with-action) | `ACTION_LoadUser.ts`, `ACTION_load_user.ts`                 |

Any case style is fine, like `ACTION_LoadUser.ts`, `ACTION_load_user.ts`,
`action-load-user.ts` or `actionLoadUser.ts`. A file with more than one action can have any
name that follows the style, like `ACTION_user.ts` (the plural `ACTIONS` is also fine).

The warning is shown on the first action of the file. Files without actions, `index` files,
and tests are not checked. Abstract classes, like the base action, don't count as actions.
With [type information](#type-information), it also finds actions that inherit `reduce` from
a class of another file.

There's no quick fix, because ESLint can't rename files. The message suggests a name, in the
case style of the current name. When the file has only one action, it's based on the action,
like `ACTION_LoadUser.ts` for `LoadUser`. Rename the file with your IDE, which also updates
the imports.
