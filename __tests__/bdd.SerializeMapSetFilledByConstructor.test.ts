import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ClassPersistor } from '../src';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with a Map or Set filled by its constructor');

Bdd(feature)
  .scenario('A Map or Set subclass is read back with only its saved entries.')
  .given('A <Type> subclass whose constructor adds some default entries.')
  .and('An instance had one of the default entries removed, and a new entry added.')
  .when('The instance is serialized, and then deserialized.')
  .then('The <Type> read back has exactly the entries of the original one.')
  .and('The removed default entry does not come back.')
  .example(val('Type', 'Map'))
  .example(val('Type', 'Set'))
  .run(async (ctx) => {
    const type = TYPES[ctx.example.val('Type')];
    const original = new type.Subclass();
    type.change(original);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [type.Subclass]);

    expect(read).toBeInstanceOf(type.Subclass);
    expect(Array.from(read)).toEqual(Array.from(original));
    expect(Array.from(read)).toEqual(type.expected);
  });

Bdd(feature)
  .scenario('A Map or Set subclass that was emptied is read back empty.')
  .given('A <Type> subclass whose constructor adds some default entries.')
  .and('An instance had all its entries removed.')
  .when('The instance is serialized, and then deserialized.')
  .then('The <Type> read back is empty.')
  .example(val('Type', 'Map'))
  .example(val('Type', 'Set'))
  .run(async (ctx) => {
    const type = TYPES[ctx.example.val('Type')];
    const original = new type.Subclass();
    original.clear();

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [type.Subclass]);

    expect(read).toBeInstanceOf(type.Subclass);
    expect(read.size).toBe(0);
  });

Bdd(feature)
  .scenario('A read-only Map or Set property filled by the constructor is read back with only its saved entries.')
  .given('A class with a read-only property holding a <Type>, which the constructor fills with default entries.')
  .and('One of the default entries was removed, and a new entry added.')
  .when('An instance of the class is serialized, and then deserialized.')
  .then('The <Type> read back has exactly the entries of the original one.')
  .and('The removed default entry does not come back.')
  .example(val('Type', 'Map'))
  .example(val('Type', 'Set'))
  .run(async (ctx) => {
    const type = TYPES[ctx.example.val('Type')];
    const original = new type.Holder();
    type.change(original.value);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [type.Holder]);

    expect(read).toBeInstanceOf(type.Holder);
    expect(read.value).toBeInstanceOf(type.Builtin);
    expect(Array.from(read.value)).toEqual(Array.from(original.value));
    expect(Array.from(read.value)).toEqual(type.expected);
  });

Bdd(feature)
  .scenario('A removed default entry of a Map subclass does not come back after a restart.')
  .given('A ClassPersistor, and a state with a Map subclass whose constructor adds some default entries.')
  .and('One of the default entries was removed, and a new entry added.')
  .when('The state is saved, and then read back, as when the app restarts.')
  .then('The Map read back has the other default entry, and the new entry.')
  .and('The removed default entry does not come back.')
  .run(async (_) => {
    let saved: string | null = null;
    const persistor = new ClassPersistor<AppState>(
      async () => saved,
      async (s) => { saved = s; },
      async () => { saved = null; },
      [AppState, Settings],
    );
    const state = new AppState();
    state.settings.delete('theme');
    state.settings.set('lang', 'en');

    await persistor.saveInitialState(state);
    const read = await persistor.readState();

    expect(read).toBeInstanceOf(AppState);
    expect(read!.settings).toBeInstanceOf(Settings);
    expect(Array.from(read!.settings)).toEqual([['size', 'big'], ['lang', 'en']]);
  });

class Settings extends Map<string, string> {
  constructor() {
    super([['theme', 'dark'], ['size', 'big']]);
  }
}

class Tags extends Set<string> {
  constructor() {
    super(['red', 'green']);
  }
}

/** Defines `key` as a read-only (but enumerable) property of `obj`. */
function defineReadOnly(obj: object, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: false, enumerable: true });
}

class MapHolder {
  declare readonly value: Map<string, string>;

  constructor() {
    defineReadOnly(this, 'value', new Map([['theme', 'dark'], ['size', 'big']]));
  }
}

class SetHolder {
  declare readonly value: Set<string>;

  constructor() {
    defineReadOnly(this, 'value', new Set(['red', 'green']));
  }
}

const TYPES: Record<string, {
  Builtin: any,
  Subclass: any,
  Holder: any,
  change: (value: any) => void,
  expected: any[],
}> = {
  'Map': {
    Builtin: Map,
    Subclass: Settings,
    Holder: MapHolder,
    change: (map: Map<string, string>) => {
      map.delete('theme');
      map.set('size', 'small');
      map.set('lang', 'en');
    },
    expected: [['size', 'small'], ['lang', 'en']],
  },
  'Set': {
    Builtin: Set,
    Subclass: Tags,
    Holder: SetHolder,
    change: (set: Set<string>) => {
      set.delete('red');
      set.add('blue');
    },
    expected: ['green', 'blue'],
  },
};

class AppState {
  readonly settings = new Settings();
}
