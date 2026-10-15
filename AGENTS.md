# AGENTS.md

## Tests are BDDs written in code

This project writes its tests as BDDs, using
[easy-bdd-tool-jest](https://www.npmjs.com/package/easy-bdd-tool-jest) (by the project author).
Read its README before writing tests (`node_modules/easy-bdd-tool-jest/README.md`).

- BDDs are written **in code**, in `__tests__/bdd.<Topic>.test.ts`. The Gherkin text
  (scenario, given, when, then, and) is written with the builder methods, and the test code
  that runs the BDD goes in `.run(async (ctx) => { ... })`.
- **NEVER write or edit `.feature` files.** The `.feature` files in `gen_features/` are generated
  automatically by the `FeatureFileReporter` each time the tests run. To change one, change the
  BDD code and run the tests again.
- Every BDD must have code that actually runs it and checks the `Then` part with `expect`.
  A BDD that only has text is not a test.

Template:

```ts
import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { KissAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('My topic');

Bdd(feature)
  .scenario('What the system does, in one sentence.')
  .given('The initial context.')
  .and('More context, if needed.')
  .when('The event being tested.')
  .then('The expected result.')
  .run(async (_) => {
    // Given: set up the store and its state.
    // When: dispatch the action, call the method, etc.
    // Then: expect(...) the results.
  });
```

Other features of the package:
- Tables: `.given('...').table('Name', row(val('Col', value), ...), ...)`, read in the code with `ctx.table('Name').rows`.
- Examples (run the same BDD several times): `.example(val('Name', value), ...)`, read with `ctx.example.val('Name')`.

Guidelines:
- Describe **what** the system does, not how. No UI details.
- The `Given` sets up state. The `When` is what's being tested. The `Then` must have `expect` calls.
- When fixing a bug, first write BDDs that fail because of the bug, then fix it, then check they pass.
- Run the tests with `npx jest` (or `npx jest __tests__/bdd.<Topic>.test.ts`).

## Git

- **NEVER use `git stash`** (or anything else that changes or reverts the working tree, like
  `git checkout -- <file>` or `git reset --hard`), as other agents may be working in this same
  directory at the same time.

## Talking to the user

Always talk to the user in ASD-STE100 format. Ideas must be presented in a clear way, 
using simple words. Each sentence must say **what** you are talking about, in full. 
Never refer to something by a name, a value or a shortcut that only makes sense if 
the reader watched you work.

Bad: "I left `null` as the way to reconnect the source."

The reader asks: left `null` where? Reconnect what source? To what?

Good: "In tests, `store.setFocused(false)` makes the store stop listening to the browser's
visibility events, and keep the value you set. To make it listen to the browser again, call
`store.setFocused(null)`."

Rules:

- Say the full name of the thing (`store.setFocused`, not "the setter"; "the browser's
  visibility events", not "the source").
- Say what happens, step by step, instead of using the internal name of a mechanism.
- This applies to the final message, the progress messages, and the questions you ask.

### When the user has to decide something

Whenever you bring up something the user has to decide (a name, a default, a behavior, a
trade-off), be clear and brief, but give everything needed to choose without reading the code:

1. **Context:** what the thing is, and when it matters, in plain words. One or two sentences.
2. **The alternatives:** each one in its own bullet, with the full name of what it would be
   (`store.setFocused(null)`, not "the null option"), what the user would write, and what
   happens.
3. **The trade-offs:** what each alternative is better or worse at. Then say which one you
   recommend, and why, in one sentence.

Keep it short, but never so short that the user has to ask "what?". Do the same when you
describe a decision you already took on your own: say what the alternatives were, so the user
can change it.
