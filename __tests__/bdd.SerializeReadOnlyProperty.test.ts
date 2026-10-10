import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter, val } from 'easy-bdd-tool-jest';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with read-only properties');

Bdd(feature)
  .scenario('A read-only property holding a Map is read back with its entries.')
  .given('A class with a read-only property holding a Map, created by the constructor.')
  .and('The Map has some entries.')
  .when('An instance is serialized, and then deserialized.')
  .then('The Map read back has the same entries.')
  .and('It has no extra fields.')
  .run(async (_) => {
    const original = new MapHolder();
    original.m.set('k', 1);
    original.m.set('j', 2);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [MapHolder]);

    expect(read).toBeInstanceOf(MapHolder);
    expect(read.m).toBeInstanceOf(Map);
    expect(Array.from(read.m)).toEqual([['k', 1], ['j', 2]]);
    expect(Object.keys(read.m)).toEqual([]);
  });

Bdd(feature)
  .scenario('A read-only property holding a built-in value is read back with its content.')
  .given('A class with a read-only property holding a <Type>, created by the constructor.')
  .and('Its content is changed.')
  .when('An instance is serialized, and then deserialized.')
  .then('The <Type> read back has the same content.')
  .and('It has no extra fields.')
  .example(val('Type', 'Set'))
  .example(val('Type', 'Date'))
  .example(val('Type', 'Array subclass'))
  .example(val('Type', 'Map subclass'))
  .run(async (ctx) => {
    const holderClass = BUILTIN_HOLDERS[ctx.example.val('Type')];
    const original = new holderClass();
    holderClass.change(original.value);

    const read = ESSerializer.deserialize(
      ESSerializer.serialize(original), [holderClass, ItemList, Registry]);

    expect(read).toBeInstanceOf(holderClass);
    expect(read.value).toBeInstanceOf(original.value.constructor);
    expect(contentOf(read.value)).toEqual(contentOf(original.value));
    expect(Object.keys(read.value)).toEqual(Object.keys(original.value));
  });

Bdd(feature)
  .scenario('A read-only property holding a class instance is read back with its fields.')
  .given('A class with a read-only property holding an instance of another class.')
  .and('The fields of that instance are changed.')
  .when('An instance is serialized, and then deserialized.')
  .then('The instance read back has the same fields.')
  .and('It has no extra fields, like "type" or "value".')
  .run(async (_) => {
    const original = new SettingsHolder();
    original.settings.theme = 'dark';
    original.settings.fontSize = 14;

    const read = ESSerializer.deserialize(
      ESSerializer.serialize(original), [SettingsHolder, Settings]);

    expect(read).toBeInstanceOf(SettingsHolder);
    expect(read.settings).toBeInstanceOf(Settings);
    expect({ ...read.settings }).toEqual({ theme: 'dark', fontSize: 14 });
  });

Bdd(feature)
  .scenario('A read-only property holding a primitive JSON can\'t represent keeps its value.')
  .given('A class with a read-only property holding <Value>.')
  .when('An instance is serialized, and then deserialized.')
  .then('Deserializing does not throw.')
  .and('The property read back is <Value>.')
  .example(val('Value', 'NaN'))
  .example(val('Value', 'Infinity'))
  .example(val('Value', 'undefined'))
  .example(val('Value', 'BigInt'))
  .run(async (ctx) => {
    const value = ({
      NaN: NaN,
      Infinity: Infinity,
      undefined: undefined,
      BigInt: BigInt(7),
    } as Record<string, any>)[ctx.example.val('Value')];
    PrimitiveHolder.value = value;
    const original = new PrimitiveHolder();

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [PrimitiveHolder]);

    expect(read).toBeInstanceOf(PrimitiveHolder);
    expect(Object.is(read.p, value)).toBe(true);
  });

/** Defines `key` as a read-only (but enumerable) property of `obj`. */
function defineReadOnly(obj: object, key: string, value: any) {
  Object.defineProperty(obj, key, { value, writable: false, enumerable: true });
}

class MapHolder {
  declare readonly m: Map<string, number>;

  constructor() {
    defineReadOnly(this, 'm', new Map());
  }
}

class ItemList extends Array<number> {
}

class Registry extends Map<string, number> {
}

/** Creates a class with a read-only property `value`, created by the constructor with `create`. */
function builtinHolder(create: () => any, change: (value: any) => void) {
  return class BuiltinHolder {
    static change = change;
    declare readonly value: any;

    constructor() {
      defineReadOnly(this, 'value', create());
    }
  };
}

const BUILTIN_HOLDERS: Record<string, ReturnType<typeof builtinHolder>> = {
  'Set': builtinHolder(() => new Set<number>(), (value) => value.add(1).add(2)),
  'Date': builtinHolder(() => new Date(0), (value) => value.setTime(1234567)),
  'Array subclass': builtinHolder(() => new ItemList(), (value) => value.push(1, 2, 3)),
  'Map subclass': builtinHolder(() => new Registry(), (value) => value.set('a', 1).set('b', 2)),
};

function contentOf(value: any): any {
  return value instanceof Date ? value.getTime() : Array.from(value);
}

class Settings {
  theme = 'light';
  fontSize = 12;
}

class SettingsHolder {
  declare readonly settings: Settings;

  constructor() {
    defineReadOnly(this, 'settings', new Settings());
  }
}

class PrimitiveHolder {
  static value: any;
  declare readonly p: any;

  constructor() {
    defineReadOnly(this, 'p', PrimitiveHolder.value);
  }
}
