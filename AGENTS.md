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
  `git checkout -- <file>` or `git reset --hard`). Other agents may be working in this same
  directory at the same time, and stashing would take away, or mix up, their uncommitted work.
  To compare behavior with and without a change, temporarily edit only your own lines instead.
