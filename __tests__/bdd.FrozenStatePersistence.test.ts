import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ClassPersistor, KissAction, PersistAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('Persisting frozen state classes');

Bdd(feature)
  .scenario('A frozen state class retains its saved values when the application restarts.')
  .given('A state class freezes its fields in its constructor.')
  .and('A store has saved a counter of 42 through ClassPersistor.')
  .when('A new store starts with a counter of zero and loads the saved state.')
  .then('The new store is ready and contains an instance of the saved state class.')
  .and('The restored counter is 42, and no persistence error was reported.')
  .run(async () => {
    await checkRestart(FrozenCounterState);
  });

Bdd(feature)
  .scenario('A state class with TypeScript readonly fields retains its saved values when the application restarts.')
  .given('A state class has TypeScript readonly fields without freezing them at runtime.')
  .and('A store has saved a counter of 42 through ClassPersistor.')
  .when('A new store starts with a counter of zero and loads the saved state.')
  .then('The new store is ready and contains an instance of the saved state class.')
  .and('The restored counter is 42, and no persistence error was reported.')
  .run(async () => {
    await checkRestart(ReadonlyCounterState);
  });

Bdd(feature)
  .scenario('A frozen state class retains a saved field of any primitive type.')
  .given('A state class freezes its fields in its constructor, and its field defaults to "default".')
  .and('A store has saved the field with the value <Value> through ClassPersistor.')
  .when('A new store starts with the default value and loads the saved state.')
  .then('The restored field is <Value>, and no persistence error was reported.')
  .example(val('Value', 'a text'))
  .example(val('Value', 'false'))
  .example(val('Value', 'zero'))
  .example(val('Value', 'null'))
  .example(val('Value', 'NaN'))
  .example(val('Value', 'Infinity'))
  .example(val('Value', 'undefined'))
  .example(val('Value', 'BigInt'))
  .example(val('Value', 'the default'))
  .run(async (ctx) => {
    const value = ({
      'the default': 'default',
      'a text': 'a text',
      'false': false,
      'zero': 0,
      'null': null,
      'NaN': NaN,
      'Infinity': Infinity,
      'undefined': undefined,
      'BigInt': BigInt(7),
    } as Record<string, any>)[ctx.example.val('Value')];

    const storage = new MemoryStorage([FrozenValueState]);
    await storage.saveWithStore(new FrozenValueState(value));

    const { state, errors } = await storage.restart(new FrozenValueState());

    expect(state).toBeInstanceOf(FrozenValueState);
    expect(Object.is(state.value, value)).toBe(true);
    expect(errors).toEqual([]);
  });

Bdd(feature)
  .scenario('A restored frozen state is still frozen, and works as before.')
  .given('A state class freezes its fields in its constructor, and has a method that returns a new state.')
  .and('A store has saved a counter of 42 through ClassPersistor.')
  .when('A new store starts with a counter of zero and loads the saved state.')
  .then('The restored state is frozen.')
  .and('When an action increments the counter with the method of the restored state, the counter is 43.')
  .and('The counter of 43 is saved.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenCounterState]);
    await storage.saveWithStore(new FrozenCounterState(42));

    const store = new Store<FrozenCounterState>({
      initialState: new FrozenCounterState(0),
      persistor: storage.persistor(),
      logger: null,
    });
    try {
      await store.ready();
      expect(store.state.counter).toBe(42);
      expect(Object.isFrozen(store.state)).toBe(true);
      expect(() => {
        (store.state as any).counter = 100;
      }).toThrow(TypeError);

      await store.dispatchAndWait(new Increment());
      await store.dispatchAndWait(new PersistAction());

      expect(store.state).toBeInstanceOf(FrozenCounterState);
      expect(store.state.counter).toBe(43);
      expect(JSON.parse(storage.serialized!).counter).toBe(43);
    } finally {
      await store.dispose();
    }
  });

Bdd(feature)
  .scenario('A frozen state that holds another frozen class retains the saved values of both.')
  .given('An account state class holds a user, and both classes freeze their fields in their constructors.')
  .and('A store has saved the user "Ann" and the balance 100 through ClassPersistor.')
  .when('A new store starts with the default user "nobody" and the balance zero, and loads the saved state.')
  .then('The restored user is "Ann", and the restored balance is 100.')
  .and('The restored account and the restored user are frozen instances of their classes.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenAccount, FrozenUser]);
    await storage.saveWithStore(new FrozenAccount(new FrozenUser('Ann'), 100));

    const { state, errors } = await storage.restart(new FrozenAccount());

    expect(state).toBeInstanceOf(FrozenAccount);
    expect(state.user).toBeInstanceOf(FrozenUser);
    expect({ name: state.user.name, balance: state.balance, errors })
      .toEqual({ name: 'Ann', balance: 100, errors: [] });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.user)).toBe(true);
  });

Bdd(feature)
  .scenario('A field made read-only with Object.defineProperty retains its saved value.')
  .given('A state class makes its "theme" field read-only with Object.defineProperty, and its "volume" field is writable.')
  .and('A store has saved the theme "dark" and the volume 8 through ClassPersistor.')
  .when('A new store starts with the theme "light" and the volume 5, and loads the saved state.')
  .then('The restored theme is "dark", and the restored volume is 8.')
  .and('The "theme" field is still read-only, and the "volume" field is still writable.')
  .run(async () => {
    const storage = new MemoryStorage([Settings]);
    await storage.saveWithStore(new Settings('dark', 8));

    const { state, errors } = await storage.restart(new Settings());

    expect(state).toBeInstanceOf(Settings);
    expect({ theme: state.theme, volume: state.volume, errors })
      .toEqual({ theme: 'dark', volume: 8, errors: [] });
    expect(Object.getOwnPropertyDescriptor(state, 'theme')!.writable).toBe(false);
    expect(Object.getOwnPropertyDescriptor(state, 'volume')!.writable).toBe(true);
  });

Bdd(feature)
  .scenario('A frozen state class retains a saved field that its constructor does not create.')
  .given('A state class freezes its fields in its constructor, and creates the "note" field only when a note is given.')
  .and('A store has saved the counter 42 and the note "hello" through ClassPersistor.')
  .when('A new store starts without a note, and loads the saved state.')
  .then('The new store is ready, and no persistence error was reported.')
  .and('The restored counter is 42, the restored note is "hello", and the restored state is frozen.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenNoteState]);
    await storage.saveWithStore(new FrozenNoteState(42, 'hello'));

    const { state, errors } = await storage.restart(new FrozenNoteState());

    expect(state).toBeInstanceOf(FrozenNoteState);
    expect({ counter: state.counter, note: state.note, errors })
      .toEqual({ counter: 42, note: 'hello', errors: [] });
    expect(Object.isFrozen(state)).toBe(true);
  });

Bdd(feature)
  .scenario('A frozen state class retains saved values inside its frozen object, array, Map and Date fields.')
  .given('A state class freezes itself, and has a frozen "config" object, an "items" array of frozen instances, a "prices" Map, and an "updatedAt" Date.')
  .and('A store has saved the theme "dark", the items 1 and 2, the price 10 for "IBM", and the date 2020-01-02 through ClassPersistor.')
  .when('A new store starts with the defaults (theme "light", no items, no prices, and the date 1970-01-01) and loads the saved state.')
  .then('All the restored values are the saved ones, and no persistence error was reported.')
  .and('The restored state and its config are frozen, and the items are frozen instances of their class.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenCatalog, FrozenItem]);
    await storage.saveWithStore(new FrozenCatalog(
      Object.freeze({ theme: 'dark' }),
      [new FrozenItem(1), new FrozenItem(2)],
      new Map([['IBM', 10]]),
      new Date('2020-01-02T00:00:00.000Z'),
    ));

    const { state, errors } = await storage.restart(new FrozenCatalog());

    expect(state).toBeInstanceOf(FrozenCatalog);
    expect({
      theme: state.config.theme,
      items: state.items.map((item) => item.id),
      ibm: state.prices.get('IBM'),
      pricesSize: state.prices.size,
      updatedAt: state.updatedAt.toISOString(),
      errors,
    }).toEqual({
      theme: 'dark',
      items: [1, 2],
      ibm: 10,
      pricesSize: 1,
      updatedAt: '2020-01-02T00:00:00.000Z',
      errors: [],
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.config)).toBe(true);
    expect(state.items.every((item) => item instanceof FrozenItem && Object.isFrozen(item))).toBe(true);
    expect(state.prices).toBeInstanceOf(Map);
    expect(state.updatedAt).toBeInstanceOf(Date);
  });

Bdd(feature)
  .scenario('A sealed state class, or one closed to new properties, retains its saved values.')
  .given('A state class has a writable "counter" field, creates the "note" field only when a note is given, and calls <Method> on itself in its constructor.')
  .and('A store has saved the counter 42 and the note "hello" through ClassPersistor.')
  .when('A new store starts with the counter zero and no note, and loads the saved state.')
  .then('The restored counter is 42, the restored note is "hello", and no persistence error was reported.')
  .and('The restored state is still closed to new properties, and still sealed if its class seals it, and its counter is still writable.')
  .example(val('Method', 'Object.seal'))
  .example(val('Method', 'Object.preventExtensions'))
  .run(async (ctx) => {
    const isSealed = ctx.example.val('Method') === 'Object.seal';
    const StateClass = isSealed ? SealedNoteState : ClosedNoteState;
    const storage = new MemoryStorage([StateClass]);
    await storage.saveWithStore(new StateClass(42, 'hello'));

    const { state, errors } = await storage.restart(new StateClass());

    expect(state).toBeInstanceOf(StateClass);
    expect({ counter: state.counter, note: state.note, errors })
      .toEqual({ counter: 42, note: 'hello', errors: [] });
    expect(Object.isExtensible(state)).toBe(false);
    expect(Object.isSealed(state)).toBe(isSealed);
    expect(Object.isFrozen(state)).toBe(false);
    expect(Object.getOwnPropertyDescriptor(state, 'counter')!.writable).toBe(true);
  });

Bdd(feature)
  .scenario('The getters and methods of a restored frozen state work with the saved values.')
  .given('A state class freezes itself, has a getter "double" that returns twice the counter, and a method "withCounter" that spreads its fields into a new instance.')
  .and('A store has saved the counter 42 and the label "x" through ClassPersistor.')
  .when('A new store starts with the counter zero and the label "none", and loads the saved state.')
  .then('The getter returns 84, and the fields of the restored state are "counter" and "label", in this order.')
  .and('The method returns a new frozen instance with the counter 43 and the label "x".')
  .run(async () => {
    const storage = new MemoryStorage([FrozenSpreadState]);
    await storage.saveWithStore(new FrozenSpreadState(42, 'x'));

    const { state, errors } = await storage.restart(new FrozenSpreadState());

    expect(state).toBeInstanceOf(FrozenSpreadState);
    expect({ double: state.double, keys: Object.keys(state), errors })
      .toEqual({ double: 84, keys: ['counter', 'label'], errors: [] });

    const next = state.withCounter(43);
    expect(next).toBeInstanceOf(FrozenSpreadState);
    expect({ counter: next.counter, label: next.label }).toEqual({ counter: 43, label: 'x' });
    expect(Object.isFrozen(next)).toBe(true);
  });

Bdd(feature)
  .scenario('A frozen state class retains a saved nested frozen class, or a saved null, in a nullable field.')
  .given('An account state class freezes itself, and its "user" field holds a frozen user, or null.')
  .and('A store has saved the user <Saved> through ClassPersistor.')
  .when('A new store starts with the user <Default>, and loads the saved state.')
  .then('The restored user is <Saved>, and no persistence error was reported.')
  .example(val('Saved', 'Ann'), val('Default', 'null'))
  .example(val('Saved', 'null'), val('Default', 'Bob'))
  .run(async (ctx) => {
    const toUser = (name: string) => (name === 'null') ? null : new FrozenUser(name);
    const storage = new MemoryStorage([NullableAccount, FrozenUser]);
    await storage.saveWithStore(new NullableAccount(toUser(ctx.example.val('Saved'))));

    const { state, errors } = await storage.restart(new NullableAccount(toUser(ctx.example.val('Default'))));

    expect(state).toBeInstanceOf(NullableAccount);
    expect(errors).toEqual([]);
    if (ctx.example.val('Saved') === 'null') {
      expect(state.user).toBeNull();
    } else {
      expect(state.user).toBeInstanceOf(FrozenUser);
      expect(state.user!.name).toBe(ctx.example.val('Saved'));
      expect(Object.isFrozen(state.user)).toBe(true);
    }
    expect(Object.isFrozen(state)).toBe(true);
  });

Bdd(feature)
  .scenario('A frozen state class that extends another class retains the saved values of both classes.')
  .given('A base class has a read-only "id" field, and a subclass adds a read-only "name" field and freezes itself.')
  .and('A store has saved the id 7 and the name "Ann" through ClassPersistor.')
  .when('A new store starts with the id zero and the name "none", and loads the saved state.')
  .then('The restored state is an instance of the subclass, with the id 7 and the name "Ann", and it is frozen.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenNamedEntity]);
    await storage.saveWithStore(new FrozenNamedEntity(7, 'Ann'));

    const { state, errors } = await storage.restart(new FrozenNamedEntity());

    expect(state).toBeInstanceOf(FrozenNamedEntity);
    expect(state).toBeInstanceOf(Entity);
    expect({ id: state.id, name: state.name, errors }).toEqual({ id: 7, name: 'Ann', errors: [] });
    expect(Object.isFrozen(state)).toBe(true);
  });

Bdd(feature)
  .scenario('A frozen state class that extends a built-in class retains its saved entries, but keeps the constructor defaults of its read-only fields.')
  .given('A state class extends Map, has a read-only "label" field, and freezes itself in its constructor.')
  .and('A store has saved the label "saved" and the entry "a" = 1 through ClassPersistor.')
  .when('A new store starts with the label "default" and no entries, and loads the saved state.')
  .then('The restored state has the entry "a" = 1, and no persistence error was reported.')
  .and('The restored label is still "default", since a copy of the instance could not hold the entries.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenRegistry]);
    const original = new FrozenRegistry('saved');
    original.set('a', 1);
    await storage.saveWithStore(original);

    const { state, errors } = await storage.restart(new FrozenRegistry());

    expect(state).toBeInstanceOf(FrozenRegistry);
    expect({ a: state.get('a'), size: state.size, label: state.label, errors })
      .toEqual({ a: 1, size: 1, label: 'default', errors: [] });
  });

Bdd(feature)
  .scenario('A frozen state class with a private field retains its saved public values, but the private field is not available.')
  .given('A state class freezes itself, has a read-only "counter" field, and a private "#origin" field that a getter reads.')
  .and('A store has saved the counter 42 through ClassPersistor.')
  .when('A new store starts with the counter zero and loads the saved state.')
  .then('The restored counter is 42, and no persistence error was reported.')
  .and('Reading the getter throws a TypeError, since the restored state is a copy made without the constructor, which has no private fields.')
  .run(async () => {
    const storage = new MemoryStorage([FrozenPrivateState]);
    await storage.saveWithStore(new FrozenPrivateState(42));

    const { state, errors } = await storage.restart(new FrozenPrivateState());

    expect(state).toBeInstanceOf(FrozenPrivateState);
    expect({ counter: state.counter, errors }).toEqual({ counter: 42, errors: [] });
    expect(() => state.origin).toThrow(TypeError);
  });

class FrozenCounterState {
  constructor(readonly counter: number = 0) {
    Object.freeze(this);
  }

  increment(): FrozenCounterState {
    return new FrozenCounterState(this.counter + 1);
  }
}

class ReadonlyCounterState {
  constructor(readonly counter: number = 0) {}
}

class FrozenItem {
  constructor(readonly id: number = 0) {
    Object.freeze(this);
  }
}

class FrozenCatalog {
  constructor(
    readonly config: { theme: string } = Object.freeze({ theme: 'light' }),
    readonly items: FrozenItem[] = [],
    readonly prices: Map<string, number> = new Map(),
    readonly updatedAt: Date = new Date(0),
  ) {
    Object.freeze(this);
  }
}

class SealedNoteState {
  declare note?: string;

  constructor(public counter: number = 0, note?: string) {
    if (note !== undefined) {
      this.note = note;
    }
    Object.seal(this);
  }
}

class ClosedNoteState {
  declare note?: string;

  constructor(public counter: number = 0, note?: string) {
    if (note !== undefined) {
      this.note = note;
    }
    Object.preventExtensions(this);
  }
}

class FrozenSpreadState {
  constructor(readonly counter: number = 0, readonly label: string = 'none') {
    Object.freeze(this);
  }

  get double(): number {
    return this.counter * 2;
  }

  withCounter(counter: number): FrozenSpreadState {
    const fields = { ...this, counter };
    return new FrozenSpreadState(fields.counter, fields.label);
  }
}

class NullableAccount {
  constructor(readonly user: FrozenUser | null = null) {
    Object.freeze(this);
  }
}

class Entity {
  constructor(readonly id: number = 0) {}
}

class FrozenNamedEntity extends Entity {
  constructor(id: number = 0, readonly name: string = 'none') {
    super(id);
    Object.freeze(this);
  }
}

class FrozenRegistry extends Map<string, number> {
  constructor(readonly label: string = 'default') {
    super();
    Object.freeze(this);
  }
}

class FrozenPrivateState {
  readonly #origin = 'constructor';

  constructor(readonly counter: number = 0) {
    Object.freeze(this);
  }

  get origin(): string {
    return this.#origin;
  }
}

class FrozenValueState {
  readonly value: any;

  // Not a default parameter value, which would replace an explicit `undefined` with the default.
  constructor(...value: [any?]) {
    this.value = value.length > 0 ? value[0] : 'default';
    Object.freeze(this);
  }
}

class FrozenUser {
  constructor(readonly name: string = 'nobody') {
    Object.freeze(this);
  }
}

class FrozenAccount {
  constructor(readonly user: FrozenUser = new FrozenUser(), readonly balance: number = 0) {
    Object.freeze(this);
  }
}

class Settings {
  declare readonly theme: string;
  volume: number;

  constructor(theme: string = 'light', volume: number = 5) {
    Object.defineProperty(this, 'theme', { value: theme, writable: false, enumerable: true });
    this.volume = volume;
  }
}

class FrozenNoteState {
  declare readonly note?: string;

  constructor(readonly counter: number = 0, note?: string) {
    if (note !== undefined) {
      (this as any).note = note;
    }
    Object.freeze(this);
  }
}

class Increment extends KissAction<FrozenCounterState> {
  reduce() {
    return this.state.increment();
  }
}

/** Keeps the saved state in memory, and creates stores that save to it with a ClassPersistor. */
class MemoryStorage {
  serialized: string | null = null;

  constructor(private readonly classes: object[]) {}

  persistor<St>(): ClassPersistor<St> {
    return new ClassPersistor<St>(
      async () => this.serialized,
      async (serialized) => {
        this.serialized = serialized;
      },
      async () => {
        this.serialized = null;
      },
      this.classes,
    );
  }

  /** Creates a store with `initialState`, which saves it, and then disposes the store. */
  async saveWithStore<St>(initialState: St) {
    const store = new Store<St>({ initialState, persistor: this.persistor<St>(), logger: null });
    try {
      await store.ready();
      expect(this.serialized).not.toBeNull();
    } finally {
      await store.dispose();
    }
  }

  /**
   * Creates a new store with `initialState`, which loads the saved state, and waits until it's
   * ready. Returns the store state, and the errors given to the `errorObserver`.
   */
  async restart<St>(initialState: St): Promise<{ state: St, errors: unknown[] }> {
    const errors: unknown[] = [];
    const store = new Store<St>({
      initialState,
      persistor: this.persistor<St>(),
      errorObserver: ({ error }) => {
        errors.push(error);
        return null;
      },
      logger: null,
    });
    try {
      await store.ready();
      return { state: store.state, errors };
    } finally {
      await store.dispose();
    }
  }
}

async function checkRestart(StateClass: new (counter?: number) => ReadonlyCounterState) {
  let saved: string | null = null;
  const errors: unknown[] = [];
  const createPersistor = () => new ClassPersistor<ReadonlyCounterState>(
    async () => saved,
    async (serialized) => { saved = serialized; },
    async () => { saved = null; },
    [StateClass],
  );
  const errorObserver = ({ error }: { error: unknown }) => {
    errors.push(error);
    return null;
  };

  const original = new Store({
    initialState: new StateClass(42),
    persistor: createPersistor(),
    errorObserver,
    logger: null,
  });
  try {
    await original.ready();
    expect(original.state.counter).toBe(42);
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved!).counter).toBe(42);
  } finally {
    await original.dispose();
  }

  const restarted = new Store({
    initialState: new StateClass(0),
    persistor: createPersistor(),
    errorObserver,
    logger: null,
  });
  try {
    expect(restarted.state.counter).toBe(0);
    await expect(restarted.ready()).resolves.toBeUndefined();
    expect(restarted.state).toBeInstanceOf(StateClass);
    expect(Object.isFrozen(restarted.state)).toBe(Object.isFrozen(new StateClass(0)));
    expect({ counter: restarted.state.counter, errors }).toEqual({ counter: 42, errors: [] });
  } finally {
    await restarted.dispose();
  }
}
