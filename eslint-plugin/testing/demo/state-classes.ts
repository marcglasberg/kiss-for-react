/* eslint-disable kiss-for-react/state-class-must-be-immutable */
/* eslint-disable kiss-for-react/prefer-readonly-collections */
/* eslint-disable kiss-for-react/non-state-object-in-state */
/* eslint-disable kiss-for-react/copy-missing-field */
/* eslint-disable kiss-for-react/missing-initial-state */
/* eslint-disable kiss-for-react/route-in-state */

// Demonstrates the state class rules of the Kiss ESLint plugin (eslint-plugin-kiss-for-react).
// Each warning is marked with a comment right above the line it underlines: the rule name, then
// what the problem is (in parentheses, when needed), then its quick fixes, if any. Each variant
// of a rule is shown separately.
//
// The rules are hidden by the `eslint-disable` lines above. To see a rule in the IDE, delete its
// line. This file is not meant to run. See README.md in this directory.
//
// A state class is the state of a `KissAction<St>`, `Store<St>` or `createStore<St>`, and the
// classes it contains: the types of its fields (also inside arrays, maps, sets and unions), and
// their superclasses. Each section below declares its own state, and makes it a state class with
// an abstract base action (`extends KissAction<...>`), or with a store.
//
// `missing-initial-state` and `route-in-state` are opt-in rules.

import type { JSX, ReactElement, ReactNode, RefObject } from 'react';
import { createStore, KissAction, Store } from 'kiss-for-react';
import { User } from './state';

// ===============================================================================================
// state-class-must-be-immutable

/** The state of the settings screen. */
class Settings {
  static defaultTheme = 'light'; // OK: static fields are not reported.

  // kiss-for-react/state-class-must-be-immutable
  // (Kiss compares states by identity, so changing the field in place doesn't re-render the
  // components, and the change isn't persisted. Create a new state instead)
  // Fix (automatic): Will add `readonly`.
  theme: string = Settings.defaultTheme;

  readonly fontSize: number = 14; // OK: readonly.

  constructor(
    // kiss-for-react/state-class-must-be-immutable
    // (A parameter property)
    // Fix (automatic): Will add `readonly`, giving `public readonly language`.
    public language: string,
    readonly country: string, // OK: readonly.
  ) {}

  // OK: getters and methods are not reported.
  get isDark(): boolean {
    return this.theme === 'dark';
  }
}

// Makes `Settings` a state class: the state of these actions.
abstract class SettingsAction extends KissAction<Settings> {}

// The classes that the state contains are state classes too.

class Entity {
  // kiss-for-react/state-class-must-be-immutable
  // (`Entity` is a superclass of `Todo`, which is in the state)
  // Fix (automatic): Will add `readonly`.
  id: string = '';
}

class Todo extends Entity {
  // kiss-for-react/state-class-must-be-immutable
  // (`Todo` is in an array of the state)
  // Fix (automatic): Will add `readonly`.
  done: boolean = false;
}

class Filter {
  // kiss-for-react/state-class-must-be-immutable
  // (`Filter` is in a union of the state, `Filter | null`)
  // Fix (automatic): Will add `readonly`.
  text: string = '';
}

class TodoList {
  constructor(readonly todos: readonly Todo[], readonly filter: Filter | null) {}
}

abstract class TodoListAction extends KissAction<TodoList> {}

class Stopwatch {
  // kiss-for-react/state-class-must-be-immutable
  // (No quick fix: this file changes `seconds` outside the constructor, in `tick` below, so the
  // code wouldn't compile with `readonly`)
  seconds: number = 0;
}

abstract class StopwatchAction extends KissAction<Stopwatch> {}

function tick(stopwatch: Stopwatch) {
  stopwatch.seconds++;
}

// OK: `FormDraft` is not in any state, so it's not a state class, and its fields can change.
class FormDraft {
  text = '';
  tags: string[] = [];
}

// ===============================================================================================
// prefer-readonly-collections

class Product {
  constructor(readonly name: string, readonly price: number) {}
}

class Catalog {
  constructor(
    // kiss-for-react/prefer-readonly-collections
    // (A mutable array: TypeScript lets the code change it in place)
    // Fix (suggestion): Will change the type to `readonly string[]`.
    readonly tags: string[],
    // kiss-for-react/prefer-readonly-collections
    // (A mutable `Array<T>`)
    // Fix (suggestion): Will change the type to `ReadonlyArray<string>`.
    readonly names: Array<string>,
    // kiss-for-react/prefer-readonly-collections
    // (A mutable `Set`)
    // Fix (suggestion): Will change the type to `ReadonlySet<string>`.
    readonly ids: Set<string>,
    // kiss-for-react/prefer-readonly-collections
    // (A mutable `Map`)
    // Fix (suggestion): Will change the type to `ReadonlyMap<string, Product>`.
    readonly byId: Map<string, Product>,
    // kiss-for-react/prefer-readonly-collections
    // (A mutable array in a union)
    // Fix (suggestion): Will change `string[]` to `readonly string[]`.
    readonly recent: string[] | null,
    readonly categories: readonly string[], // OK
    readonly brands: ReadonlyArray<string>, // OK
    readonly codes: ReadonlySet<string>, // OK
    readonly prices: ReadonlyMap<string, number>, // OK
    // OK: only the type of the field is checked, not its type arguments.
    readonly groups: ReadonlyMap<string, string[]>,
  ) {}

  // OK: fields without a declared type are not checked.
  readonly sizes = ['S', 'M', 'L'];
}

abstract class CatalogAction extends KissAction<Catalog> {}

// ===============================================================================================
// non-state-object-in-state

/** A subclass of `Promise`. */
class Task extends Promise<void> {}

class Loading {
  constructor(
    // kiss-for-react/non-state-object-in-state
    // (A `Promise` is not state: it can't be compared, saved or restored. Keep it outside the
    // state, for example in a module, or in the action that uses it)
    readonly userPromise: Promise<User> | null,
    // kiss-for-react/non-state-object-in-state
    // (A Node timer)
    readonly timer: NodeJS.Timeout | null,
    // kiss-for-react/non-state-object-in-state
    // (An `AbortController`)
    readonly controller: AbortController | null,
    // kiss-for-react/non-state-object-in-state
    // (An `AbortSignal`)
    readonly signal: AbortSignal | null,
    // kiss-for-react/non-state-object-in-state
    // (A `WebSocket`)
    readonly socket: WebSocket | null,
    // kiss-for-react/non-state-object-in-state
    // (An `EventSource`)
    readonly events: EventSource | null,
    // kiss-for-react/non-state-object-in-state
    // (A `Worker`)
    readonly worker: Worker | null,
    // kiss-for-react/non-state-object-in-state
    // (A `Promise` in the type arguments)
    readonly pending: readonly Promise<User>[],
    // kiss-for-react/non-state-object-in-state
    // (An `AbortController` in the type arguments)
    readonly controllers: ReadonlyMap<string, AbortController>,
    // kiss-for-react/non-state-object-in-state
    // (A subclass of `Promise`)
    readonly task: Task | null,
    readonly user: User | null, // OK: state.
    readonly format: (user: User) => string, // OK: functions are fine.
    readonly timerId: number | null, // OK: in the browser, a timer from `setTimeout` is a number.
  ) {}
}

abstract class LoadingAction extends KissAction<Loading> {}

class ProfilePage {
  constructor(
    // kiss-for-react/non-state-object-in-state
    // (A DOM node: it belongs to the UI, and can't be saved or restored. Keep it in the
    // component)
    readonly node: Node | null,
    // kiss-for-react/non-state-object-in-state
    // (A DOM `Element`)
    readonly element: Element | null,
    // kiss-for-react/non-state-object-in-state
    // (An `HTMLElement`)
    readonly container: HTMLElement | null,
    // kiss-for-react/non-state-object-in-state
    // (A subtype of `HTMLElement`)
    readonly input: HTMLInputElement | null,
    // kiss-for-react/non-state-object-in-state
    // (A React ref)
    readonly inputRef: RefObject<HTMLInputElement | null>,
    // kiss-for-react/non-state-object-in-state
    // (A React element)
    readonly title: ReactElement,
    // kiss-for-react/non-state-object-in-state
    // (A React node)
    readonly content: ReactNode,
    // kiss-for-react/non-state-object-in-state
    // (A `JSX.Element`)
    readonly footer: JSX.Element,
  ) {}
}

abstract class ProfilePageAction extends KissAction<ProfilePage> {}

// ===============================================================================================
// copy-missing-field

class Profile {
  constructor(readonly name: string, readonly age: number, readonly email: string) {}

  // kiss-for-react/copy-missing-field
  // (A destructured object, without `age`: the copies always keep the old age)
  // Fix (suggestion): Will add `age` to the parameters, and replace `this.age` with
  // `age ?? this.age`.
  copy({ name, email }: { name?: string, email?: string }) {
    return new Profile(name ?? this.name, this.age, email ?? this.email);
  }
}

class Address {
  constructor(readonly street: string, readonly city: string, readonly zip: string) {}

  // kiss-for-react/copy-missing-field
  // (Separate parameters, named like the fields, without `city` and `zip`. `copyWith` is checked
  // too)
  // Fix (suggestion): Will add `city?: string, zip?: string` to the parameters, and replace
  // `this.city` with `city ?? this.city`, and `this.zip` with `zip ?? this.zip`.
  copyWith(street?: string) {
    return new Address(street ?? this.street, this.city, this.zip);
  }
}

class Preferences {
  constructor(readonly language: string, readonly darkMode: boolean) {}

  // kiss-for-react/copy-missing-field
  // (An object parameter, without `darkMode`. No quick fix for an object parameter)
  copy(changes: { language?: string }) {
    return new Preferences(changes.language ?? this.language, this.darkMode);
  }
}

class Contact {
  constructor(readonly name: string, readonly phone: string | null) {}

  // kiss-for-react/copy-missing-field
  // (Without `phone`. No quick fix, since `phone` can be null, and `phone ?? this.phone` would
  // not let the copy set it to null)
  copy({ name }: { name?: string }) {
    return new Contact(name ?? this.name, this.phone);
  }
}

class Account {
  constructor(readonly id: string, readonly balance: number, private readonly secret: string) {}

  // OK: all the fields. Private fields are not required.
  copy({ id, balance }: { id?: string, balance?: number }) {
    return new Account(id ?? this.id, balance ?? this.balance, this.secret);
  }

  // OK: not a copy method. Methods like this change one field on purpose.
  withBalance(balance: number) {
    return new Account(this.id, balance, this.secret);
  }
}

class Wallet {
  constructor(readonly owner: string, readonly coins: number) {}

  // OK: a `Partial<Wallet>` has all the fields.
  copy(changes: Partial<Wallet>): Wallet {
    return new Wallet(changes.owner ?? this.owner, changes.coins ?? this.coins);
  }

  // OK: `Object.assign` (or `...this`) copies all the fields.
  copyWith(changes: { owner?: string }): Wallet {
    return Object.assign(new Wallet(this.owner, this.coins), changes);
  }
}

class Customer {
  constructor(
    readonly profile: Profile,
    readonly address: Address,
    readonly preferences: Preferences,
    readonly contact: Contact,
    readonly account: Account,
    readonly wallet: Wallet,
  ) {}
}

abstract class CustomerAction extends KissAction<Customer> {}

// ===============================================================================================
// missing-initial-state (opt-in)

class Cart {
  static initialState: Cart = new Cart([]);

  constructor(readonly items: readonly string[]) {}
}

// kiss-for-react/missing-initial-state
// (The store creates the state with the constructor. Keep the initial state in the state class,
// to reuse it in tests and to reset the state)
// Fix (suggestion): Will replace `new Cart([])` with `Cart.initialState`.
const cartStore = createStore<Cart>({ initialState: new Cart([]) });

// kiss-for-react/missing-initial-state
// (Without a type argument, the state class is found from the initial state)
// Fix (suggestion): Will replace `new Cart([])` with `Cart.initialState`.
const cartStore2 = createStore({ initialState: new Cart([]) });

// kiss-for-react/missing-initial-state
// (With `new Store`)
// Fix (suggestion): Will replace `new Cart([])` with `Cart.initialState`.
const cartStore3 = new Store<Cart>({ initialState: new Cart([]) });

const cartStore4 = createStore<Cart>({ initialState: Cart.initialState }); // OK

class Wishlist {
  static initialState(): Wishlist {
    return new Wishlist([]);
  }

  constructor(readonly items: readonly string[]) {}
}

// kiss-for-react/missing-initial-state
// (Here `initialState` is a static method)
// Fix (suggestion): Will replace `new Wishlist([])` with `Wishlist.initialState()`.
const wishlistStore = createStore<Wishlist>({ initialState: new Wishlist([]) });

const wishlistStore2 = createStore<Wishlist>({ initialState: Wishlist.initialState() }); // OK

class Orders {
  constructor(readonly ids: readonly string[]) {}
}

// kiss-for-react/missing-initial-state
// (`Orders` has no static `initialState`. No quick fix: add one, like
// `static initialState = new Orders([])`)
const ordersStore = createStore<Orders>({ initialState: new Orders([]) });

const counterStore = createStore<number>({ initialState: 0 }); // OK: the state is not a class.
const plainStore = createStore({ initialState: { count: 0 } }); // OK: a plain object.

// ===============================================================================================
// route-in-state (opt-in)

class Navigation {
  constructor(
    // kiss-for-react/route-in-state
    // (Get the current route from your router instead, like React Router's `useLocation()`.
    // A copy in the state can get out of sync with the router)
    readonly currentRoute: string,
    // kiss-for-react/route-in-state
    readonly routeName: string,
    // kiss-for-react/route-in-state
    readonly currentPath: string,
    // kiss-for-react/route-in-state
    readonly pathname: string,
    // kiss-for-react/route-in-state
    readonly location: string,
    readonly lastSearch: string, // OK: other names.
  ) {}
}

abstract class NavigationAction extends KissAction<Navigation> {}

// OK: `RouterInfo` is not a state class.
class RouterInfo {
  constructor(readonly pathname: string) {}
}
