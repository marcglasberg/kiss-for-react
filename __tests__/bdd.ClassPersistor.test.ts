import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { ClassPersistor, KissAction, PersistAction, Store } from '../src';

reporter(new FeatureFileReporter());

const feature = new Feature('ClassPersistor');

Bdd(feature)
  .scenario('When nothing is saved, the store saves its initial-state with the ClassPersistor.')
  .given('A ClassPersistor with nothing saved.')
  .when('The store is created with it, and it is ready.')
  .then('The initial-state is saved.')
  .and('It can be read back, with its classes.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const store = new Store<State>({
      initialState: new State(new Item('a'), new Date(1000)),
      persistor: storage.persistor(),
      logger: null,
    });
    await store.ready();

    expect(storage.serialized).not.toBeNull();
    const read = await storage.persistor().readState();
    expect(read).toBeInstanceOf(State);
    expect(read!.item).toBeInstanceOf(Item);
    expect(read!.item.name).toBe('a');
    expect(read!.date.getTime()).toBe(1000);
  });

Bdd(feature)
  .scenario('When the store is created, the state saved by the ClassPersistor replaces the initial-state.')
  .given('A ClassPersistor with a saved state.')
  .when('The store is created with it, and it is ready.')
  .then('The store state is the saved state, with its classes.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    await storage.persistor().saveInitialState(new State(new Item('saved'), new Date(2000)));

    const store = new Store<State>({
      initialState: new State(new Item('initial'), new Date(0)),
      persistor: storage.persistor(),
      logger: null,
    });
    await store.ready();

    expect(store.state).toBeInstanceOf(State);
    expect(store.state.item).toBeInstanceOf(Item);
    expect(store.state.item.name).toBe('saved');
    expect(store.state.date).toBeInstanceOf(Date);
    expect(store.state.date.getTime()).toBe(2000);
  });

Bdd(feature)
  .scenario('The ClassPersistor saves the whole new state each time.')
  .given('A ClassPersistor.')
  .when('A state is saved, with some last persisted state.')
  .then('The whole new state is saved, no matter the last persisted state.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor();

    await persistor.persistDifference(
      new State(new Item('old'), new Date(1)),
      new State(new Item('new'), new Date(2)));

    const read = await persistor.readState();
    expect(read!.item.name).toBe('new');
    expect(read!.date.getTime()).toBe(2);
  });

Bdd(feature)
  .scenario('State changes are saved with the ClassPersistor, and are read back when the app restarts.')
  .given('A store with a ClassPersistor.')
  .when('The state changes, and it is saved.')
  .and('The app restarts, with a new store.')
  .then('The new store state is the changed state.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const store = new Store<State>({
      initialState: new State(new Item('a'), new Date(0)),
      persistor: storage.persistor(),
      logger: null,
    });
    await store.ready();

    await store.dispatchAndWait(new RenameItem('b'));
    await store.dispatchAndWait(new PersistAction());

    const restarted = new Store<State>({
      initialState: new State(new Item('a'), new Date(0)),
      persistor: storage.persistor(),
      logger: null,
    });
    await restarted.ready();
    expect(restarted.state.item).toBeInstanceOf(Item);
    expect(restarted.state.item.name).toBe('b');
  });

Bdd(feature)
  .scenario('Deleting the state with the ClassPersistor deletes the saved state.')
  .given('A ClassPersistor with a saved state.')
  .when('The state is deleted.')
  .then('Nothing is saved anymore.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor();
    await persistor.saveInitialState(new State(new Item('a'), new Date(0)));

    await persistor.deleteState();
    expect(storage.serialized).toBeNull();
    expect(await persistor.readState()).toBeNull();
  });

Bdd(feature)
  .scenario('If the saved state can not be read, the store saves its initial-state instead.')
  .given('A ClassPersistor whose saved state is corrupted.')
  .when('The store is created with it, and it is ready.')
  .then('The error is given to the errorObserver.')
  .and('The store state is the initial-state, and it is saved.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    storage.serialized = 'This is not a serialized state.';
    const errors: any[] = [];

    const initialState = new State(new Item('initial'), new Date(0));
    const store = new Store<State>({
      initialState,
      persistor: storage.persistor(),
      logger: null,
      errorObserver: ({ error }) => {
        errors.push(error);
        return null;
      },
    });
    await store.ready();

    expect(errors.length).toBe(1);
    expect(store.state).toBe(initialState);
    const read = await storage.persistor().readState();
    expect(read!.item.name).toBe('initial');
  });

class Item {
  constructor(readonly name: string) {
  }
}

class State {
  constructor(readonly item: Item, readonly date: Date) {
  }
}

class RenameItem extends KissAction<State> {
  constructor(readonly name: string) {
    super();
  }

  reduce() {
    return new State(new Item(this.name), this.state.date);
  }
}

/** Keeps the serialized state in memory. */
class MemoryStorage {
  serialized: string | null = null;

  persistor(): ClassPersistor<State> {
    return new ClassPersistor<State>(
      async () => this.serialized,
      async (serialized) => {
        this.serialized = serialized;
      },
      async () => {
        this.serialized = null;
      },
      [State, Item],
    );
  }
}
