/* eslint-disable kiss-for-react/stale-state-after-await */
/* eslint-disable kiss-for-react/prefer-state-parameter */
/* eslint-disable kiss-for-react/no-state-mutation */
/* eslint-disable kiss-for-react/reduce-without-await */
/* eslint-disable kiss-for-react/prefer-return-null */

// Demonstrates the reducer rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react).
// Each warning is marked with a comment right above the line it underlines: the rule name, then
// what the problem is (in parentheses, when needed), then its quick fixes, if any. Each variant
// of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule, delete its line.
// This file is not meant to run. See README.md in this directory.

import { KissAction, UpdateStateAction, useSelect } from 'kiss-for-react';
import { Action, fetchName, saveName, State, store, User } from './state';

// A second state, with a set and a map, for the `no-state-mutation` examples.
class Library {
  constructor(
    readonly tags: ReadonlySet<string>,
    readonly usersById: ReadonlyMap<string, User>,
    readonly users: readonly User[],
  ) {}

  static initialState: Library = new Library(new Set(), new Map(), []);
}

abstract class LibraryAction extends KissAction<Library> {}

// ---------------------------------------------------------------------------------------------
// stale-state-after-await

class StaleInReturnedFunction extends Action {
  async reduce() {
    const s = this.state;
    const name = await fetchName();
    // kiss-for-react/stale-state-after-await
    // (`s` has the state from before the `await`. Changes made during the `await` are lost)
    // Fix (suggestion): Will replace `s` with `state`.
    return (state: State) => s.copy({ name });
  }
}

class StaleInLocalVariable extends Action {
  async reduce() {
    const s = this.state;
    const name = await fetchName();
    // kiss-for-react/stale-state-after-await
    // (`newState` ends up in the `return`, so it's built from the old state)
    // Fix (suggestion): Will replace `s` with `this.state`.
    const newState = s.copy({ name });
    return () => newState;
  }
}

class StaleAfterIf extends Action {
  async reduce() {
    const s = this.state;
    let name = s.name; // OK: before the `await`.
    if (name === '') name = await fetchName();
    // kiss-for-react/stale-state-after-await
    // (The `await` inside the `if` counts for the code after the `if`)
    // Fix (suggestion): Will replace `s` with `state`.
    return (state: State) => s.copy({ name });
  }
}

class StaleStateOk extends Action {
  async reduce() {
    const s = this.state;
    if (s.name !== '') {
      await saveName(s.name); // OK: inside an `await`.
    } else {
      return (state: State) => s.copy({ name: 'Mary' }); // OK: the `await` is in the other branch.
    }
    if (s.counter > 10) return null; // OK: in a condition.
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// prefer-state-parameter

class ThisStateInsteadOfParameter extends Action {
  async reduce() {
    const name = await fetchName();
    // kiss-for-react/prefer-state-parameter
    // (The function gets the current state as its `state` parameter)
    // Fix (automatic): Will replace `this.state` with `state`.
    return (state: State) => this.state.copy({ name });
  }
}

class ThisStateWithoutParameter extends Action {
  async reduce() {
    const name = await fetchName();
    // kiss-for-react/prefer-state-parameter
    // (The function has no parameter. The fix of the warning below fixes this one too)
    return () => this.state.copy({
      name,
      // kiss-for-react/prefer-state-parameter
      // (The same)
      // Fix (automatic): Will add the parameter `state: State`, and replace both `this.state`
      // with `state`.
      counter: this.state.counter + 1,
    });
  }
}

class StateParameterOk extends Action {
  async reduce() {
    const counter = this.state.counter; // OK: not in the returned function.
    await saveName(this.state.name); // OK: not in the returned function.
    return (state: State) => state.copy({ counter: counter + 1 }); // OK: uses the parameter.
  }
}

// ---------------------------------------------------------------------------------------------
// no-state-mutation
//
// The fields of `State` are readonly, so TypeScript also reports most of these mutations (here,
// `@ts-expect-error` hides that). The rule also finds them when the types are not readonly, and
// when the code casts the `readonly` away.

class PushToStateArray extends Action {
  reduce() {
    // kiss-for-react/no-state-mutation
    // (`push` changes the state in place, so the components don't re-render)
    // @ts-expect-error
    this.state.items.push('Mary');
    return this.state.copy({ counter: this.state.counter + 1 });
  }
}

class AssignToState extends Action {
  reduce() {
    // kiss-for-react/no-state-mutation
    // (An assignment)
    // @ts-expect-error
    this.state.counter = 5;
    // kiss-for-react/no-state-mutation
    // (An update, like `++` or `+=`)
    // @ts-expect-error
    this.state.counter++;
    // kiss-for-react/no-state-mutation
    // (`delete` too)
    // @ts-expect-error
    delete this.state.name;
    // kiss-for-react/no-state-mutation
    // (`Object.assign` into the state)
    Object.assign(this.state, { counter: 5 });
    return null;
  }
}

class SortStateArray extends Action {
  reduce() {
    // kiss-for-react/no-state-mutation
    // (`sort` sorts the state's array in place, and returns it)
    // Fix (suggestion): Will replace `sort` with `toSorted`, which returns a new array.
    // @ts-expect-error
    const sorted = this.state.items.sort();
    // kiss-for-react/no-state-mutation
    // (The result is not used, so there's no suggestion)
    // @ts-expect-error
    this.state.items.reverse();
    return this.state.copy({ items: sorted });
  }
}

class MutateInitialState extends Action {
  reduce() {
    // kiss-for-react/no-state-mutation
    // (`this.initialState` is the state too)
    // Fix (suggestion): Will replace `splice` with `toSpliced`, which returns a new array.
    // @ts-expect-error
    const items = this.initialState.items.splice(0, 1);
    return this.state.copy({ items });
  }
}

class MutateStateParameter extends Action {
  async reduce() {
    const name = await fetchName();
    return (state: State) => {
      // kiss-for-react/no-state-mutation
      // (The parameter of the returned function is the state)
      // @ts-expect-error
      state.items.push(name);
      return state.copy({ name });
    };
  }
}

class MutateThroughVariable extends Action {
  reduce() {
    const items = this.state.items;
    // kiss-for-react/no-state-mutation
    // (`items` is the state's array, not a copy)
    // @ts-expect-error
    items.push('Mary');
    return null;
  }
}

class MutateInLoop extends LibraryAction {
  reduce() {
    for (const user of this.state.users) {
      // kiss-for-react/no-state-mutation
      // (The loop goes over the users in the state)
      // @ts-expect-error
      user.age = 0;
    }
    this.state.users.forEach((user) => {
      // kiss-for-react/no-state-mutation
      // (The callback gets the users in the state)
      // @ts-expect-error
      user.age = 0;
    });
    return null;
  }
}

class MutateSetAndMap extends LibraryAction {
  reduce() {
    const tags = this.state.tags as Set<string>;
    // kiss-for-react/no-state-mutation
    // (Casting away `readonly` doesn't help: `add` changes the state's set)
    tags.add('new');
    const usersById = this.state.usersById as Map<string, User>;
    // kiss-for-react/no-state-mutation
    // (`set`, `delete` and `clear` change the state's map)
    usersById.delete('Mary');
    return null;
  }
}

function useSortedItems() {
  // kiss-for-react/no-state-mutation
  // (The selector sorts the state's array in place)
  // Fix (suggestion): Will replace `sort` with `toSorted`, which returns a new array.
  // @ts-expect-error
  const sorted = useSelect((state: State) => state.items.sort());

  const items = useSelect((state: State) => state.items);
  // kiss-for-react/no-state-mutation
  // (`items` is a part of the state, from `useSelect`)
  // @ts-expect-error
  items.push('Mary');

  const ok = useSelect((state: State) => state.items.toSorted()); // OK: returns a new array.
  return [sorted, ok];
}

function addItemOutsideActions() {
  // kiss-for-react/no-state-mutation
  // (`store.state` is the state too)
  // @ts-expect-error
  store.state.items.push('Mary');

  store.dispatch(new UpdateStateAction((state: State) => {
    // kiss-for-react/no-state-mutation
    // (The function of `UpdateStateAction` gets the state)
    // @ts-expect-error
    state.items.push('Mary');
    return state.copy({});
  }));
}

class StateMutationOk extends Action {
  reduce() {
    const items = [...this.state.items]; // OK: a new array.
    items.push('Mary'); // OK: changes the new array.
    const sorted = this.state.items.toSorted(); // OK: returns a new array.
    return this.state.copy({ items: [...sorted, 'Mary'] }); // OK: a new state.
  }
}

// ---------------------------------------------------------------------------------------------
// reduce-without-await

class AsyncWithoutAwait extends Action {
  // kiss-for-react/reduce-without-await
  // (The `async` makes the action async for nothing)
  // Fix (suggestion): Will remove `async`, and return
  // `this.state.copy({ counter: this.state.counter + 1 })` instead of the function.
  async reduce() {
    return (state: State) => state.copy({ counter: state.counter + 1 });
  }
}

class AsyncWithoutAwaitReturnType extends Action {
  // kiss-for-react/reduce-without-await
  // (No suggestion, since `reduce` has a declared return type)
  async reduce(): Promise<null> {
    return null;
  }
}

class AsyncWithoutAwaitBlockBody extends Action {
  // kiss-for-react/reduce-without-await
  // (No suggestion, since the returned function has a block body)
  async reduce() {
    return (state: State) => {
      return state.copy({ counter: 0 });
    };
  }
}

class AwaitOnlyInNestedFunction extends Action {
  // kiss-for-react/reduce-without-await
  // (The `await` inside the nested function doesn't count)
  // Fix (suggestion): Will remove `async`.
  async reduce() {
    const save = async () => {
      await saveName(this.state.name);
    };
    save();
    return null;
  }
}

class AsyncBeforeOk extends Action {
  async before() {
    await saveName('');
  }

  async reduce() { // OK: the action is async anyway, because of its `before`.
    return (state: State) => state.copy({ counter: 0 });
  }
}

class CheckInternetOk extends Action {
  checkInternet = { dialog: true };

  async reduce() { // OK: `checkInternet` makes the action async anyway.
    return (state: State) => state.copy({ counter: 0 });
  }
}

class RetryOk extends Action {
  retry = { on: true };
  nonReentrant = true;

  async reduce() { // OK: `retry` needs an async `reduce`.
    return (state: State) => state.copy({ counter: 0 });
  }
}

class ReturnsPromiseOk extends Action {
  async reduce() { // OK: it returns a promise, so it's really async.
    return this.loadReducer();
  }

  async loadReducer() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

// ---------------------------------------------------------------------------------------------
// prefer-return-null

class ReturnsThisState extends Action {
  reduce() {
    // kiss-for-react/prefer-return-null
    // (Kiss treats it the same way as `null`, but `null` says clearly the state didn't change)
    // Fix (automatic): Will replace `this.state` with `null`.
    if (this.state.name === '') return this.state;
    return this.state.copy({ name: '' });
  }
}

class ReturnsThisStateTyped extends Action {
  reduce(): State {
    // kiss-for-react/prefer-return-null
    // (No fix, since the declared return type `State` doesn't accept `null`)
    if (this.state.name === '') return this.state;
    return this.state.copy({ name: '' });
  }
}

class ReturnsUnchangedStateFunction extends Action {
  async reduce() {
    await saveName(this.state.name);
    // kiss-for-react/prefer-return-null
    // (The returned function returns the state unchanged)
    // Fix (automatic): Will replace `(state: State) => state` with `null`.
    return (state: State) => state;
  }
}

class ReturnsUnchangedStateBlock extends Action {
  async reduce() {
    await saveName(this.state.name);
    // kiss-for-react/prefer-return-null
    // (The same, with a block body)
    // Fix (automatic): Will replace the function with `null`.
    return (state: State) => {
      return state;
    };
  }
}

class ReturnsThisStateFunction extends Action {
  async reduce() {
    await saveName(this.state.name);
    // kiss-for-react/prefer-return-null
    // (The returned function returns the state unchanged)
    // Fix (automatic): Will replace `() => this.state` with `null`.
    //
    // kiss-for-react/prefer-state-parameter
    // (`this.state` in the returned function)
    // Fix (automatic): Will add the parameter `state: State`, and replace `this.state` with
    // `state`.
    return () => this.state;
  }
}

class ReturnNullOk extends Action {
  reduce() {
    // kiss-for-react/no-state-mutation
    // (`prefer-return-null` is not reported below, since the problem is this mutation)
    // @ts-expect-error
    this.state.items.push('Mary');
    return this.state;
  }
}
