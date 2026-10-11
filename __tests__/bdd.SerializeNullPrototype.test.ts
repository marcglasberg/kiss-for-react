import { expect } from '@jest/globals';
import { Bdd, Feature, FeatureFileReporter, reporter } from 'easy-bdd-tool-jest';
import { ESSerializer } from '../src/Esserializer';

reporter(new FeatureFileReporter());

const feature = new Feature('ESSerializer with a null-prototype object');

Bdd(feature)
  .scenario('A null-prototype object is read back with no prototype.')
  .given('A dictionary of word counts with no prototype, made with Object.create(null).')
  .and('It is a field of a plain object.')
  .when('The plain object is serialized, and then deserialized.')
  .then('The dictionary read back has no prototype.')
  .and('It has the same word counts.')
  .and('It has no inherited keys, like "constructor" or "toString".')
  .run(async (_) => {
    const dict = wordCounts({ the: 3, cat: 1 });

    const read = ESSerializer.deserialize(ESSerializer.serialize({ dict }), []).dict;

    expect(Object.getPrototypeOf(read)).toBeNull();
    expect({ ...read }).toEqual({ the: 3, cat: 1 });
    expect(read['constructor']).toBeUndefined();
    expect(read['toString']).toBeUndefined();
  });

Bdd(feature)
  .scenario('A top-level null-prototype object is read back with no prototype.')
  .given('A dictionary with no prototype, made with Object.create(null).')
  .when('The dictionary itself is serialized, and then deserialized.')
  .then('The dictionary read back has no prototype, and the same entries.')
  .run(async (_) => {
    const dict = wordCounts({ the: 3 });

    const read = ESSerializer.deserialize(ESSerializer.serialize(dict), []);

    expect(Object.getPrototypeOf(read)).toBeNull();
    expect({ ...read }).toEqual({ the: 3 });
  });

Bdd(feature)
  .scenario('A null-prototype object inside a class keeps its nested values.')
  .given('A class with a field holding a dictionary with no prototype.')
  .and('The dictionary has a Date, a Map, a class instance, and a nested dictionary with no prototype.')
  .when('An instance of the class is serialized, and then deserialized.')
  .then('The dictionary read back has no prototype.')
  .and('Its nested values are read back with their types.')
  .run(async (_) => {
    const dict = Object.create(null);
    dict.date = new Date(1234567);
    dict.map = new Map([['a', 1]]);
    dict.point = new Point(1, 2);
    dict.nested = wordCounts({ constructor: 1 });
    const original = new Index(dict);

    const read = ESSerializer.deserialize(ESSerializer.serialize(original), [Index, Point]);

    expect(read).toBeInstanceOf(Index);
    expect(Object.getPrototypeOf(read.dict)).toBeNull();
    expect(read.dict.date).toEqual(new Date(1234567));
    expect(read.dict.map).toEqual(new Map([['a', 1]]));
    expect(read.dict.point).toBeInstanceOf(Point);
    expect(read.dict.point).toEqual(new Point(1, 2));
    expect(Object.getPrototypeOf(read.dict.nested)).toBeNull();
    expect(read.dict.nested['constructor']).toBe(1);
  });

Bdd(feature)
  .scenario('A null-prototype object with a "__proto__" key keeps it as a normal key.')
  .given('A dictionary with no prototype, with the keys "__proto__" and "a".')
  .when('The dictionary is serialized, and then deserialized.')
  .then('The dictionary read back has no prototype.')
  .and('"__proto__" is a normal key, with its value.')
  .run(async (_) => {
    const dict = Object.create(null);
    dict['__proto__'] = { polluted: true };
    dict.a = 1;

    const read = ESSerializer.deserialize(ESSerializer.serialize({ dict }), []).dict;

    expect(Object.getPrototypeOf(read)).toBeNull();
    expect(Object.keys(read)).toEqual(['__proto__', 'a']);
    expect(read['__proto__']).toEqual({ polluted: true });
    expect(read.a).toBe(1);
    expect(({} as any).polluted).toBeUndefined();
  });

Bdd(feature)
  .scenario('A plain object is still read back with the Object prototype.')
  .given('A plain object, made with {}.')
  .when('It is serialized, and then deserialized.')
  .then('The object read back has the Object prototype.')
  .and('The saved JSON has no type for it.')
  .run(async (_) => {
    const serialized = ESSerializer.serialize({ dict: { the: 3 } });
    const read = ESSerializer.deserialize(serialized, []);

    expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(read.dict)).toBe(Object.prototype);
    expect(JSON.parse(serialized)).toEqual({ dict: { the: 3 } });
  });

/** Creates a dictionary with no prototype, with the given entries. */
function wordCounts(entries: Record<string, number>): Record<string, number> {
  return Object.assign(Object.create(null), entries);
}

class Point {
  constructor(readonly x: number, readonly y: number) {
  }
}

class Index {
  constructor(readonly dict: any) {
  }
}
