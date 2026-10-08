import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { ClassPersistor, KissAction, Store } from '../src';
import { ESSerializer } from '../src/Esserializer';
import { delayMillis } from '../src/utils';

reporter(new FeatureFileReporter());

const feature = new Feature('ClassPersistor with Map');

Bdd(feature)
  .scenario('A state with a Map is saved and read back with all its entries.')
  .given('A state class with a Map of strings to numbers.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('The state read back has a Map with the same entries, in the same order.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<MapState>([MapState]);

    await persistor.saveInitialState(new MapState(new Map([['a', 1], ['b', 2]])));
    const read = await persistor.readState();

    expect(read).toBeInstanceOf(MapState);
    expect(read!.map).toBeInstanceOf(Map);
    expect(Array.from(read!.map.entries())).toEqual([['a', 1], ['b', 2]]);
  });

Bdd(feature)
  .scenario('An empty Map is saved and read back as an empty Map.')
  .given('A state class with an empty Map.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('The state read back has an empty Map.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<MapState>([MapState]);

    await persistor.saveInitialState(new MapState(new Map()));
    const read = await persistor.readState();

    expect(read!.map).toBeInstanceOf(Map);
    expect(read!.map.size).toBe(0);
  });

Bdd(feature)
  .scenario('Map keys and values keep their types when read back.')
  .given('A Map whose keys are numbers, booleans, dates and undefined.')
  .and('Whose values are custom classes, dates, Sets and nested Maps.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('Each key and value is read back with its original type and content.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<MapState>([MapState, Item]);

    const date = new Date(1700000000000);
    const map = new Map<any, any>([
      [1, new Item('one')],
      [true, date],
      [date, new Set(['x', 'y'])],
      [undefined, new Map([['inner', new Item('nested')]])],
    ]);

    await persistor.saveInitialState(new MapState(map));
    const read = (await persistor.readState())!;
    const entries = Array.from(read.map.entries());

    expect(entries.length).toBe(4);

    expect(entries[0][0]).toBe(1);
    expect(entries[0][1]).toBeInstanceOf(Item);
    expect(entries[0][1].name).toBe('one');

    expect(entries[1][0]).toBe(true);
    expect(entries[1][1]).toBeInstanceOf(Date);
    expect(entries[1][1].getTime()).toBe(date.getTime());

    expect(entries[2][0]).toBeInstanceOf(Date);
    expect(entries[2][0].getTime()).toBe(date.getTime());
    expect(entries[2][1]).toBeInstanceOf(Set);
    expect(Array.from(entries[2][1])).toEqual(['x', 'y']);

    expect(entries[3][0]).toBeUndefined();
    expect(entries[3][1]).toBeInstanceOf(Map);
    expect(entries[3][1].get('inner')).toBeInstanceOf(Item);
    expect(entries[3][1].get('inner').name).toBe('nested');
  });

Bdd(feature)
  .scenario('A Map inside an array or a Set is saved and read back.')
  .given('A state with an array of Maps, and a Set containing a Map.')
  .when('The state is saved by the ClassPersistor, and then read back.')
  .then('The Maps are read back with all their entries.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const persistor = storage.persistor<ContainerState>([ContainerState]);

    await persistor.saveInitialState(new ContainerState(
      [new Map([['a', 1]]), new Map([['b', 2]])],
      new Set([new Map([['c', 3]])]),
    ));
    const read = (await persistor.readState())!;

    expect(read.list.map((m: Map<string, number>) => Array.from(m.entries()))).toEqual([[['a', 1]], [['b', 2]]]);
    const [mapInSet] = Array.from(read.set) as Map<string, number>[];
    expect(mapInSet).toBeInstanceOf(Map);
    expect(Array.from(mapInSet.entries())).toEqual([['c', 3]]);
  });

Bdd(feature)
  .scenario('A state with a Map survives an app restart.')
  .given('A store with a ClassPersistor, whose state has a Map.')
  .and('An action that adds an entry to the Map, and is saved.')
  .when('The app restarts, and a new store is created with the same storage.')
  .then('The new store state has the Map with all the saved entries.')
  .and('The saved state is not deleted.')
  .and('No error is logged.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    const logs: string[] = [];

    const store1 = new Store<MapState>({
      initialState: new MapState(new Map([['a', 1]])),
      persistor: storage.persistor<MapState>([MapState]),
      logger: () => {},
    });
    await delayMillis(10);
    store1.dispatch(new AddEntry('b', 2));
    await delayMillis(10);

    // The app restarts.
    const store2 = new Store<MapState>({
      initialState: new MapState(new Map()),
      persistor: storage.persistor<MapState>([MapState]),
      logger: (obj: any) => logs.push(String(obj)),
    });
    await delayMillis(10);

    expect(Array.from(store2.state.map.entries())).toEqual([['a', 1], ['b', 2]]);
    expect(storage.deleted).toBe(false);
    expect(storage.serialized).not.toBeNull();
    expect(logs.filter(l => l.includes('Error'))).toEqual([]);
  });

Bdd(feature)
  .scenario('A Map saved by an older version, without its entries, is read back as an empty Map.')
  .given('A saved state where the Map was written without its entries.')
  .when('The state is read by the ClassPersistor.')
  .then('There is no error, and the Map is read back as an empty Map.')
  .run(async (_) => {
    const storage = new MemoryStorage();
    storage.serialized = '{"map":{"*type":"Map"},"*type":"MapState"}';
    const persistor = storage.persistor<MapState>([MapState]);

    const read = (await persistor.readState())!;

    expect(read).toBeInstanceOf(MapState);
    expect(read.map).toBeInstanceOf(Map);
    expect(read.map.size).toBe(0);
  });

class MemoryStorage {
  serialized: string | null = null;
  deleted = false;

  persistor<St>(classes: any[]): ClassPersistor<St> {
    ESSerializer.clearRegisteredClasses();
    const persistor = new ClassPersistor<St>(
      async () => this.serialized,
      async (s) => { this.serialized = s; },
      async () => { this.serialized = null; this.deleted = true; },
      classes,
    );
    // No throttle, so every state change is saved right away.
    Object.defineProperty(persistor, 'throttle', { get: () => null });
    return persistor;
  }
}

class MapState {
  constructor(readonly map: Map<any, any>) {
  }
}

class Item {
  constructor(readonly name: string) {
  }
}

class ContainerState {
  constructor(readonly list: Map<string, number>[], readonly set: Set<Map<string, number>>) {
  }
}

class AddEntry extends KissAction<MapState> {
  constructor(readonly key: string, readonly value: number) {
    super();
  }

  reduce() {
    return new MapState(new Map(this.state.map).set(this.key, this.value));
  }
}
