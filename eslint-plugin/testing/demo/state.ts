// The state, actions and store shared by the demo files. This file has no lint warnings.

import { createStore, KissAction } from 'kiss-for-react';

export class User {
  constructor(readonly name: string, readonly age: number) {}

  withName(name: string): User {
    return new User(name, this.age);
  }
}

export class State {
  constructor(
    readonly counter: number,
    readonly name: string,
    readonly user: User,
    readonly items: readonly string[],
  ) {}

  static initialState: State = new State(0, '', new User('', 0), []);

  copy(changes: Partial<State>): State {
    return Object.assign(new State(this.counter, this.name, this.user, this.items), changes);
  }
}

/** The base action that all actions extend. */
export abstract class Action extends KissAction<State> {}

/** A sync action. */
export class Increment extends Action {
  reduce() {
    return this.state.copy({ counter: this.state.counter + 1 });
  }
}

/** An async action. */
export class LoadUser extends Action {
  async reduce() {
    const name = await fetchName();
    return (state: State) => state.copy({ name });
  }
}

/** Another async action. */
export class SaveUser extends Action {
  async reduce() {
    await saveName(this.state.name);
    return null;
  }
}

export async function fetchName(): Promise<string> {
  return 'Mary';
}

export async function saveName(_name: string): Promise<void> {}

export const store = createStore<State>({ initialState: State.initialState });
